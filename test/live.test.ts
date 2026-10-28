import { ApiContract } from '../src/lib/common/contracts';
import { findContracts } from '../src/lib/actions/find-contracts';
import { getContract } from '../src/lib/actions/get-contract';
import { getRelatedContracts } from '../src/lib/actions/get-related-contracts';
import { setContractTerms } from '../src/lib/actions/set-contract-terms';
import { renewContract } from '../src/lib/actions/renew-contract';
import { terminateContract } from '../src/lib/actions/terminate-contract';
import {
  AppConnectionType,
  ApFile,
  OutputSchema,
} from '@activepieces/pieces-framework';
import { HttpError, HttpMethod, httpClient } from '@activepieces/pieces-common';
import { assinafyAuth } from '../src/lib/auth';
import {
  AssinafyAuthValue,
  AssinafyApiError,
  assinafyApi,
} from '../src/lib/common/client';
import { createSigner } from '../src/lib/actions/create-signer';
import { deleteDocument } from '../src/lib/actions/delete-document';
import { downloadDocument } from '../src/lib/actions/download-document';
import { findDocuments } from '../src/lib/actions/find-documents';
import { findSigners } from '../src/lib/actions/find-signers';
import { getDocument } from '../src/lib/actions/get-document';
import { requestSignatures } from '../src/lib/actions/request-signatures';
import { updateSigner } from '../src/lib/actions/update-signer';
import { updateSigningDeadline } from '../src/lib/actions/update-signing-deadline';
import { uploadDocument } from '../src/lib/actions/upload-document';
import { assinafyProps } from '../src/lib/common/props';
import { createDocumentFromTemplate } from '../src/lib/actions/create-document-from-template';
import { resendSignatureRequest } from '../src/lib/actions/resend-signature-request';
import { documentSigned } from '../src/lib/triggers/document-signed';
import { newEvent } from '../src/lib/triggers/new-event';
import { assinafyOutputSchemas } from '../src/lib/output-schemas';
import { ApiDocument, ApiTemplate } from '../src/lib/common/format';
import { assinafyConstants } from '../src/lib/common/constants';
import { assinafyDocuments } from '../src/lib/common/documents';
import { memoryStore } from './helpers';
import { samplePdf } from './live-helpers';

vi.unmock('@activepieces/pieces-common');

// The sandbox rate-limits bursts with HTTP 429 ("Try again in N seconds");
// a rate-limited request was not processed, so it is safe to send again.
const send = httpClient.sendRequest.bind(httpClient);
vi.spyOn(httpClient, 'sendRequest').mockImplementation(async (request) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send(request);
    } catch (error) {
      const response =
        error instanceof HttpError
          ? (error.response as { status: number; body: unknown })
          : undefined;
      if (response?.status !== 429 || attempt === 6) {
        throw error;
      }
      const seconds = Number(
        /(\d+) seconds?/.exec(JSON.stringify(response.body))?.[1] ?? 30
      );
      await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000));
    }
  }
});
vi.setConfig({ testTimeout: 15 * 60_000, hookTimeout: 15 * 60_000 });

const describedKeys = (schema: OutputSchema) =>
  schema.fields.map((field) => field.value ?? field.key);

const env = process.env;
const enabled = env['ASSINAFY_LIVE'] === '1';
const production = env['ASSINAFY_LIVE_PRODUCTION'] === '1';
const runId = Date.now().toString(36);
const auth = {
  type: AppConnectionType.CUSTOM_AUTH,
  props: {
    api_key: env['ASSINAFY_API_KEY'] ?? '',
    environment: production ? 'production' : 'sandbox',
    account_id: env['ASSINAFY_ACCOUNT_ID'],
  },
};

function liveContext({
  props,
  extra = {},
}: {
  props: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  const written: { fileName: string; data: Buffer }[] = [];
  return {
    written,
    ctx: {
      auth,
      propsValue: props,
      store: memoryStore(),
      files: {
        write: async (file: { fileName: string; data: Buffer }) => {
          written.push(file);
          return `memory://${file.fileName}`;
        },
      },
      ...extra,
    } as never,
  };
}

describe.skipIf(!enabled)(
  `Assinafy ${production ? 'production' : 'sandbox'} (live)`,
  () => {
    const client = assinafyApi.forAuth(auth as AssinafyAuthValue);
    let documentId: string | undefined;
    let signerId: string | undefined;
    const extraDocumentIds = new Set<string>();
    const extraSignerIds = new Set<string>();

    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    afterAll(async () => {
      vi.unstubAllGlobals();
      const failures: unknown[] = [];
      if (documentId) extraDocumentIds.add(documentId);
      if (signerId) extraSignerIds.add(signerId);
      for (const id of extraDocumentIds) {
        await client
          .request({
            method: HttpMethod.DELETE,
            path: `/documents/${id}`,
          })
          .catch((error: unknown) => failures.push(error));
      }
      for (const id of extraSignerIds) {
        await client
          .request({
            method: HttpMethod.DELETE,
            path: await client.accountPath(`/signers/${id}`),
          })
          .catch((error: unknown) => failures.push(error));
      }
      expect(failures, 'Live-test resources must be removed').toEqual([]);
    });

    test('uses production only with explicit opt-in and validates the API key', async () => {
      expect(client.baseUrl).toBe(
        production ? assinafyApi.urls.production : assinafyApi.urls.sandbox
      );
      const result = await assinafyAuth[0].validate?.({
        auth: auth.props as never,
        server: {} as never,
      });
      expect(result).toEqual({ valid: true });
    });

    test('uploads, reads, finds and downloads a document', async () => {
      const upload = liveContext({
        props: {
          file: new ApFile(`ap-live-${runId}.pdf`, samplePdf(), 'pdf'),
          name: undefined,
        },
      });
      const uploaded = (await uploadDocument.run(upload.ctx)) as {
        id: string;
        name: string;
      };
      documentId = uploaded.id;
      expect(uploaded.name).toContain(runId);

      const fetched = (await getDocument.run(
        liveContext({ props: { document: documentId } }).ctx
      )) as { id: string };
      expect(fetched.id).toBe(documentId);
      expect(Object.keys(fetched)).toEqual(
        describedKeys(assinafyOutputSchemas.document)
      );

      const found = (await findDocuments.run(
        liveContext({ props: { search: runId, limit: 10 } }).ctx
      )) as { id: string }[];
      expect(found.map((document) => document.id)).toContain(documentId);

      const recent = (await findDocuments.run(
        liveContext({ props: { limit: 20 } }).ctx
      )) as { updated_at: string | null }[];
      const times = recent.map(
        (document) => Date.parse(document.updated_at ?? '') || 0
      );
      expect(times).toEqual([...times].sort((a, b) => b - a));

      const download = liveContext({
        props: {
          document: documentId,
          file_type: 'original',
          file_name: undefined,
        },
      });
      const downloaded = (await downloadDocument.run(download.ctx)) as object;
      expect(download.written[0].data.subarray(0, 4).toString()).toBe('%PDF');
      expect(Object.keys(downloaded)).toEqual(
        describedKeys(assinafyOutputSchemas.download)
      );

      const options = await assinafyProps
        .document('x')
        .options({ auth: auth as never }, { searchValue: runId } as never);
      expect(options.options.map((option) => option.value)).toContain(
        documentId
      );

      const activities = await client.list<{
        event?: string;
        created_at?: string;
      }>({
        method: HttpMethod.GET,
        path: `/documents/${documentId}/activities`,
      });
      expect(
        activities.every((activity) => typeof activity.event === 'string')
      ).toBe(true);
    });

    test('downloads available final artifacts from an existing signed document', async () => {
      const signed = await client.list<ApiDocument>({
        method: HttpMethod.GET,
        path: await client.accountPath('/documents'),
        queryParams: { status: 'certificated', 'per-page': 1 },
      });
      if (!signed[0]) {
        console.info(
          'No signed document is available for final-artifact downloads.'
        );
        return;
      }
      const document = await client.request<ApiDocument>({
        method: HttpMethod.GET,
        path: `/documents/${signed[0].id}`,
      });
      const artifacts = Object.keys(document.artifacts ?? {}).filter((type) =>
        Object.hasOwn(assinafyConstants.downloadableFiles, type)
      );
      expect(artifacts).toEqual(
        expect.arrayContaining(['certificated', 'certificate-page', 'bundle'])
      );
      for (const file_type of artifacts) {
        const download = liveContext({
          props: { document: document.id, file_type },
        });
        const result = await downloadDocument.run(download.ctx);
        expect(Object.keys(result as object)).toEqual(
          describedKeys(assinafyOutputSchemas.download)
        );
        expect(
          download.written[0].data
            .subarray(0, file_type === 'bundle' ? 2 : 4)
            .toString()
        ).toBe(file_type === 'bundle' ? 'PK' : '%PDF');
      }
    }, 30_000);

    test('creates, finds and updates a signer', async () => {
      const email = `ap-live-${runId}@example.com`;
      const created = (await createSigner.run(
        liveContext({ props: { full_name: `Live ${runId}`, email } }).ctx
      )) as { id: string };
      signerId = created.id;
      expect(Object.keys(created)).toEqual(
        describedKeys(assinafyOutputSchemas.signer)
      );

      const found = (await findSigners.run(
        liveContext({ props: { search: email, limit: 5 } }).ctx
      )) as { id: string }[];
      expect(found.map((signer) => signer.id)).toContain(signerId);

      const updated = await updateSigner.run(
        liveContext({
          props: { signer: signerId, full_name: `Live ${runId} updated` },
        }).ctx
      );
      expect(updated).toMatchObject({
        id: signerId,
        full_name: `Live ${runId} updated`,
      });
    });

    test('finds the activity and template role shapes the triggers and template action rely on', async () => {
      const signed = await client.list<{ id: string }>({
        method: HttpMethod.GET,
        path: await client.accountPath('/documents'),
        queryParams: {
          status: 'certificated',
          sort: '-updated_at',
          'per-page': 3,
        },
      });
      if (signed.length === 0) {
        console.info(
          'No signed documents in this workspace; the signing activity check was skipped.'
        );
      } else {
        const events = (
          await client.list<{ event?: string }>({
            method: HttpMethod.GET,
            path: `/documents/${signed[0].id}/activities`,
          })
        ).map((activity) => activity.event);
        console.info(
          `Activity events on a signed document: ${[...new Set(events)].join(
            ', '
          )}`
        );
        expect(
          events.some(
            (event) =>
              event === 'document_ready' || event === 'signer_signed_document'
          )
        ).toBe(true);
      }

      const templates = await client.list<{
        roles?: { assignment_type?: string }[];
      }>({
        method: HttpMethod.GET,
        path: await client.accountPath('/templates'),
        queryParams: { 'per-page': 100 },
      });
      const roleTypes = [
        ...new Set(
          templates.flatMap((template) =>
            (template.roles ?? []).map((role) => role.assignment_type)
          )
        ),
      ];
      console.info(
        `Templates: ${templates.length}; role types: ${
          roleTypes.join(', ') || 'none'
        }`
      );
      expect(roleTypes.every((type) => typeof type === 'string')).toBe(true);

      const firstTemplate = (
        await assinafyProps
          .template('x')
          .options({ auth: auth as never }, {} as never)
      ).options[0];
      if (firstTemplate) {
        const roleInputs = await createDocumentFromTemplate.props.signers.props(
          { auth: auth as never, template: firstTemplate.value },
          {} as never
        );
        const fieldInputs =
          await createDocumentFromTemplate.props.editor_fields.props(
            { auth: auth as never, template: firstTemplate.value },
            {} as never
          );
        console.info(
          `Template form: ${Object.keys(roleInputs).length} role inputs, ${
            Object.keys(fieldInputs).length
          } editor field inputs`
        );
        expect(
          Object.keys(roleInputs).every((key) =>
            /^(email|whatsapp|name|cpf|verification|step)_/.test(key)
          )
        ).toBe(true);
        expect(
          Object.keys(fieldInputs).every((key) => key.startsWith('field_'))
        ).toBe(true);
      }
    });

    test('supports every event in the live webhook catalog', async () => {
      const events = await client.list<{ id: string }>({
        method: HttpMethod.GET,
        path: '/webhooks/event-types',
      });
      expect(events.map((event) => event.id).sort()).toEqual(
        Object.keys(assinafyConstants.webhookEventLabels).sort()
      );
    });

    test('loads templates and trigger samples without changing anything', async () => {
      const templates = await assinafyProps
        .template('x')
        .options({ auth: auth as never }, {} as never);
      expect(templates.disabled).toBe(false);
      await expect(
        newEvent.test?.(
          liveContext({ props: { events: ['document_ready'] } }).ctx
        )
      ).resolves.toBeInstanceOf(Array);
      await expect(
        documentSigned.test?.(liveContext({ props: {} }).ctx)
      ).resolves.toBeInstanceOf(Array);
    });

    test('checks cost estimates or explicit plan restrictions for every verification method', async () => {
      expect(documentId).toBeDefined();
      await assinafyDocuments.waitUntilProcessed({
        client,
        documentId: documentId!,
      });
      for (const method of Object.values(
        assinafyConstants.signerVerificationMethods
      )) {
        try {
          const cost = await client.request<{
            total_credits: number;
            breakdown: { code: string; cost: number }[];
          }>({
            method: HttpMethod.POST,
            path: `/documents/${documentId}/assignments/estimate-cost`,
            body: {
              method: 'virtual',
              signers: [
                {
                  verification_method: method.verification_method,
                  notification_methods: [method.notification_method],
                },
              ],
            },
          });
          expect(Number.isFinite(cost.total_credits)).toBe(true);
          expect(cost.total_credits).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(cost.breakdown)).toBe(true);
        } catch (error) {
          if (env['ASSINAFY_LIVE_REQUIRE_PAID_METHODS'] === '1') throw error;
          expect(error).toBeInstanceOf(AssinafyApiError);
          expect((error as AssinafyApiError).status).toBe(403);
          expect((error as Error).message).toMatch(
            /plano|certificado|disponível|identidade|biometr/i
          );
          console.info(
            `${method.verification_method}/${method.notification_method}: workspace plan does not allow this method`
          );
        }
      }
    });

    test.skipIf(!production)(
      'tracks, finds, reads, amends, renews and terminates only the temporary contract',
      async () => {
        expect(documentId).toBeDefined();
        const run = (props: Record<string, unknown>) =>
          liveContext({ props }).ctx;
        const first = (await setContractTerms.run(
          run({
            document: documentId,
            terms: {
              status: 'active',
              counterparty_name: 'Example Ltd',
              value: 0.29,
              currency: 'BRL',
              start_date: '2026-01-01',
              end_date: '2090-12-31',
              auto_renew: false,
              renewal_term_months: 12,
              notice_period_days: 0,
              metadata: { source: 'activepieces' },
              external_references: [{ system: 'activepieces', id: runId }],
            },
          })
        )) as ApiContract;
        expect(first).toMatchObject({
          document_id: documentId,
          value: 0.29,
          status: 'active',
          auto_renew: false,
        });
        expect(
          await getContract.run(run({ document: documentId }))
        ).toMatchObject(first);
        const found = (await findContracts.run(
          run({
            external_system: 'activepieces',
            external_id: runId,
            expand_document: true,
            limit: 5,
          })
        )) as ApiContract[];
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({
          document_id: documentId,
          document: { id: documentId },
        });
        await expect(
          setContractTerms.run(
            run({
              document: documentId,
              terms: { value: 999, updated_at: '2000-01-01T00:00:00Z' },
            })
          )
        ).rejects.toMatchObject({ status: 409, code: 'ContractChanged' });
        const instrument = (await uploadDocument.run(
          run({
            file: new ApFile(`ap-amendment-${runId}.pdf`, samplePdf(), 'pdf'),
          })
        )) as { id: string };
        extraDocumentIds.add(instrument.id);
        await assinafyDocuments.waitUntilProcessed({
          client,
          documentId: instrument.id,
        });
        try {
          const linked = (await setContractTerms.run(
            run({
              document: instrument.id,
              terms: {
                parent_document_id: documentId,
                relation_type: 'amendment',
                value: 120,
              },
            })
          )) as ApiContract;
          expect(linked).toMatchObject({
            resource: 'document_contract_amendment',
            status: 'pending',
            parent_document_id: documentId,
          });
          expect(
            await getContract.run(run({ document: instrument.id }))
          ).toMatchObject(linked);
          expect(
            await getRelatedContracts.run(run({ document: instrument.id }))
          ).toMatchObject({
            document_id: documentId,
            amendments: [{ document_id: instrument.id }],
          });
        } finally {
          await setContractTerms.run(
            run({
              document: instrument.id,
              terms: { parent_document_id: null },
            })
          );
        }
        const cleared = (await setContractTerms.run(
          run({
            document: documentId,
            terms: {
              value: null,
              metadata: null,
              external_references: [],
              auto_renew: false,
              notice_period_days: 0,
            },
          })
        )) as ApiContract;
        expect(cleared).toMatchObject({
          value: null,
          metadata: null,
          external_references: [],
          auto_renew: false,
          notice_period_days: 0,
        });
        const renewal = {
          term: cleared['term'],
          end_date: '2091-12-31',
          value: 12.34,
          updated_at: cleared['updated_at'],
        };
        const renewed = (await renewContract.run(
          run({ document: documentId, renewal })
        )) as ApiContract;
        expect(renewed).toMatchObject({ end_date: '2091-12-31', value: 12.34 });
        await expect(
          renewContract.run(run({ document: documentId, renewal }))
        ).rejects.toBeInstanceOf(AssinafyApiError);
        const ended = await terminateContract.run(
          run({
            document: documentId,
            reason: 'Temporary integration test completed',
            updated_at: renewed['updated_at'],
          })
        );
        expect(ended).toMatchObject({ status: 'terminated' });
      }
    );

    test.skipIf(env['ASSINAFY_LIVE_SEND'] !== '1')(
      'creates assignments for every method with the tested signer in an inactive second step',
      async () => {
        const email = `ap-method-${runId}@example.com`;
        const featureSigner = await client.request<{ id: string }>({
          method: HttpMethod.POST,
          path: await client.accountPath('/signers'),
          body: {
            full_name: `Methods ${runId}`,
            email,
            government_id: '39053344705',
            whatsapp_phone_number: '+5548999990000',
          },
        });
        extraSignerIds.add(featureSigner.id);
        for (const [verification, method] of Object.entries(
          assinafyConstants.signerVerificationMethods
        )) {
          const uploaded = (await uploadDocument.run(
            liveContext({
              props: {
                file: new ApFile(
                  `ap-method-${verification}-${runId}.pdf`,
                  samplePdf(),
                  'pdf'
                ),
              },
            }).ctx
          )) as { id: string };
          extraDocumentIds.add(uploaded.id);
          try {
            const result = await requestSignatures.run(
              liveContext({
                props: {
                  document: uploaded.id,
                  signers: [
                    { email: `ap-live-${runId}@example.com`, step: 1 },
                    {
                      email,
                      whatsapp: '+5548999990000',
                      verification,
                      step: 2,
                    },
                  ],
                },
              }).ctx
            );
            expect(result).toMatchObject({
              document_id: uploaded.id,
              signers: [
                { step: 1, verification_method: 'Email' },
                {
                  id: featureSigner.id,
                  step: 2,
                  verification_method: method.verification_method,
                  notification_method: method.notification_method,
                },
              ],
            });
            console.info(`${verification}: assignment accepted`);
          } catch (error) {
            if (env['ASSINAFY_LIVE_REQUIRE_PAID_METHODS'] === '1') throw error;
            expect(error).toBeInstanceOf(AssinafyApiError);
            expect((error as AssinafyApiError).status).toBe(403);
            expect((error as Error).message).toMatch(
              /plano|certificado|disponível|identidade|biometr/i
            );
            console.info(
              `${verification}: workspace plan does not allow this method`
            );
          }
        }
      }
    );

    test.skipIf(env['ASSINAFY_LIVE_SEND'] !== '1')(
      'creates and sends a document from a ready template',
      async (testContext) => {
        const templates = await client.list<ApiTemplate>({
          method: HttpMethod.GET,
          path: await client.accountPath('/templates'),
        });
        const template = templates.find(
          (candidate) =>
            candidate.status?.toLowerCase() === 'ready' &&
            candidate.roles?.filter(
              (role) =>
                !['editor', 'copyreceiver'].includes(
                  role.assignment_type?.toLowerCase() ?? ''
                )
            ).length === 1
        );
        if (!template) {
          testContext.skip(
            'No ready template with one signer role is available.'
          );
        }
        const role = template!.roles!.find(
          (candidate) =>
            !['editor', 'copyreceiver'].includes(
              candidate.assignment_type?.toLowerCase() ?? ''
            )
        )!;
        const editorRoleIds = new Set(
          template!
            .roles!.filter(
              (candidate) =>
                candidate.assignment_type?.toLowerCase() === 'editor'
            )
            .map((candidate) => candidate.id)
        );
        const fields = Object.fromEntries(
          (template!.pages ?? [])
            .flatMap((page) => page.fields ?? [])
            .filter((field) => editorRoleIds.has(field.role_id))
            .map((field) => [`field_${field.field_id}`, 'Integration test'])
        );
        if (!signerId) {
          const signer = await client.request<{ id: string }>({
            method: HttpMethod.POST,
            path: await client.accountPath('/signers'),
            body: {
              full_name: `Live ${runId}`,
              email: `ap-live-${runId}@example.com`,
            },
          });
          extraSignerIds.add(signer.id);
        }
        const document = (await createDocumentFromTemplate.run(
          liveContext({
            props: {
              template: template!.id,
              signers: {
                [`email_${role.id}`]: `ap-live-${runId}@example.com`,
                [`name_${role.id}`]: `Live ${runId}`,
              },
              editor_fields: fields,
              document_name: `ap-template-${runId}.pdf`,
            },
          }).ctx
        )) as { id: string; template_id: string; assignment_id: string | null };
        extraDocumentIds.add(document.id);
        expect(document.template_id).toBe(template!.id);
        expect(Object.keys(document)).toEqual(
          describedKeys(assinafyOutputSchemas.document)
        );
        await vi.waitFor(
          async () => {
            const current = (await getDocument.run(
              liveContext({
                props: { document: document.id },
              }).ctx
            )) as { assignment_id: string | null; status: string };
            expect(current.assignment_id).toBeTruthy();
            expect(current.status).toBe('pending_signature');
          },
          { timeout: 30_000, interval: 1000 }
        );
      },
      40_000
    );

    test.skipIf(env['ASSINAFY_LIVE_SEND'] !== '1')(
      'sends the document for signature and moves the deadline',
      async () => {
        expect(documentId).toBeDefined();
        const sent = await requestSignatures.run(
          liveContext({
            props: {
              document: documentId,
              signers: [
                {
                  email: `ap-live-${runId}@example.com`,
                  full_name: `Live ${runId}`,
                },
              ],
              message: 'Automated integration test, please ignore.',
            },
          }).ctx
        );
        expect(sent).toMatchObject({
          document_id: documentId,
          signer_count: 1,
        });
        expect(Object.keys(sent as object)).toEqual(
          describedKeys(assinafyOutputSchemas.signatureRequest)
        );

        const signerOptions = await assinafyProps
          .documentSigner('x')
          .options({ auth: auth as never, document: documentId }, {} as never);
        expect(signerOptions.options.map((option) => option.value)).toContain(
          signerId
        );
        const resent = await resendSignatureRequest.run(
          liveContext({ props: { document: documentId, signer: signerId } }).ctx
        );
        expect(resent).toMatchObject({
          document_id: documentId,
          signer_id: signerId,
        });
        expect(Object.keys(resent as object)).toEqual(
          describedKeys(assinafyOutputSchemas.resend)
        );

        const events = (
          await client.list<{ event?: string }>({
            method: HttpMethod.GET,
            path: `/documents/${documentId}/activities`,
          })
        ).map((activity) => activity.event);
        console.info(
          `Activity events after sending: ${[...new Set(events)].join(', ')}`
        );
        expect(events).toContain('assignment_created');

        const deadline = new Date(
          Date.now() + 7 * 24 * 3600 * 1000
        ).toISOString();
        const moved = await updateSigningDeadline.run(
          liveContext({ props: { document: documentId, expires_at: deadline } })
            .ctx
        );
        expect(moved).toMatchObject({ document_id: documentId });

        await deleteDocument.run(
          liveContext({ props: { document: documentId } }).ctx
        );
        documentId = undefined;
      }
    );

    test.skipIf(env['ASSINAFY_LIVE_WEBHOOK'] !== '1')(
      'registers and removes the webhook it owns',
      async (testContext) => {
        const webhookUrl = `https://automations.example.com/api/v1/webhooks/ap-live-${runId}`;
        const ownUrl = new RegExp(
          `^${webhookUrl}\\?assinafy_token=[0-9a-f]{48}$`
        );
        const props = {
          events: Object.keys(assinafyConstants.webhookEventLabels),
          notification_email:
            env['ASSINAFY_LIVE_WEBHOOK_EMAIL'] ?? 'webhooks@example.com',
          replace_existing: false,
        };
        const endpointsPath = await client.accountPath('/webhooks/endpoints');
        let registered = false;
        const endpoints = () =>
          client.list<{ url?: string }>({
            method: HttpMethod.GET,
            path: endpointsPath,
          });
        const supportsEndpoints = await endpoints().then(
          () => true,
          (error: unknown) => {
            if (error instanceof AssinafyApiError && error.status === 404) {
              return false;
            }
            throw error;
          }
        );
        const path = await client.accountPath('/webhooks/subscriptions');
        const original = supportsEndpoints
          ? null
          : await client.find<{
              events?: string[];
              is_active?: boolean;
              url?: string | null;
              email?: string | null;
            }>({ method: HttpMethod.GET, path });
        const store = memoryStore();
        const { ctx } = liveContext({ props, extra: { webhookUrl, store } });
        try {
          try {
            await newEvent.onEnable(ctx);
            registered = true;
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.startsWith('Every webhook endpoint')
            ) {
              expect(supportsEndpoints).toBe(true);
              testContext.skip(
                'The workspace webhook slots are occupied; existing endpoints are preserved.'
              );
            }
            throw error;
          }
          if (supportsEndpoints) {
            expect(
              (await endpoints()).filter((endpoint) =>
                ownUrl.test(endpoint.url ?? '')
              )
            ).toHaveLength(1);
            expect(await store.get('webhook_secret')).toMatch(/^whsec_/);
            const endpointId = await store.get<string>('webhook_endpoint_id');
            await newEvent.onEnable(ctx);
            expect(await store.get('webhook_endpoint_id')).toBe(endpointId);
            const rotated = await client.request<{ secret: string }>({
              method: HttpMethod.POST,
              path: `${endpointsPath}/${endpointId}/secret/rotate`,
            });
            expect(rotated.secret).toMatch(/^whsec_/);
            await newEvent.onEnable(ctx);
            expect(await store.get('webhook_secret')).toBe(rotated.secret);
          } else {
            expect(
              await client.find({ method: HttpMethod.GET, path })
            ).toMatchObject({
              url: expect.stringMatching(ownUrl),
              is_active: true,
            });
          }
          await newEvent.onDisable(ctx);
          registered = false;
          if (supportsEndpoints) {
            expect(
              (await endpoints()).some((endpoint) =>
                ownUrl.test(endpoint.url ?? '')
              )
            ).toBe(false);
          } else {
            expect(
              await client.find({ method: HttpMethod.GET, path })
            ).toMatchObject({ is_active: false });
          }
        } finally {
          if (registered) await newEvent.onDisable(ctx);
          if (original?.url && original.email) {
            await client.request({
              method: HttpMethod.PUT,
              path,
              body: {
                events: original.events ?? [],
                is_active: Boolean(original.is_active),
                url: original.url,
                email: original.email,
              },
            });
          }
        }
      }
    );
  }
);
