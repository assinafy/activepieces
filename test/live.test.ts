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
const runId = Date.now().toString(36);
const auth = {
  type: AppConnectionType.CUSTOM_AUTH,
  props: {
    api_key: env['ASSINAFY_API_KEY'] ?? '',
    environment: 'sandbox',
    account_id: env['ASSINAFY_ACCOUNT_ID'],
  },
};

function samplePdf(): Buffer {
  const text = 'BT /F1 18 Tf 72 760 Td (Activepieces live test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

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

describe.skipIf(!enabled)('Assinafy sandbox (live)', () => {
  const client = assinafyApi.forAuth(auth as AssinafyAuthValue);
  let documentId: string | undefined;
  let signerId: string | undefined;
  const templateDocumentIds = new Set<string>();

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const id of templateDocumentIds) {
      await client.request({
        method: HttpMethod.DELETE,
        path: `/documents/${id}`,
      });
    }
    if (documentId) {
      await client
        .request({
          method: HttpMethod.DELETE,
          path: `/documents/${documentId}`,
        })
        .catch((error) =>
          console.warn(
            `Could not delete live-test document ${documentId}: ${error}`
          )
        );
    }
    if (signerId) {
      await client
        .request({
          method: HttpMethod.DELETE,
          path: await client.accountPath(`/signers/${signerId}`),
        })
        .catch((error) =>
          console.warn(
            `Could not delete live-test signer ${signerId}: ${error}`
          )
        );
    }
  });

  test('refuses anything but the sandbox and validates the API key', async () => {
    expect(client.baseUrl).toBe('https://sandbox.assinafy.com.br/v1');
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
    expect(options.options.map((option) => option.value)).toContain(documentId);

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
          /plano|certificado|disponível/i
        );
        console.info(
          `${method.verification_method}/${method.notification_method}: workspace plan does not allow this method`
        );
      }
    }
  });

  test.skipIf(env['ASSINAFY_LIVE_SEND'] !== '1')(
    'creates and sends a document from a ready template',
    async () => {
      const templates = await client.list<ApiTemplate>({
        method: HttpMethod.GET,
        path: await client.accountPath('/templates'),
      });
      const template = templates.find(
        (candidate) =>
          candidate.status?.toLowerCase() === 'ready' &&
          candidate.roles?.filter(
            (role) => role.assignment_type?.toLowerCase() !== 'editor'
          ).length === 1 &&
          !(candidate.pages ?? []).some((page) =>
            (page.fields ?? []).some((field) =>
              candidate.roles?.some(
                (role) =>
                  role.id === field.role_id &&
                  role.assignment_type?.toLowerCase() === 'editor'
              )
            )
          )
      );
      expect(
        template,
        'Create a ready sandbox template with one signer role and no editor fields'
      ).toBeDefined();
      const role = template!.roles!.find(
        (candidate) => candidate.assignment_type?.toLowerCase() !== 'editor'
      )!;
      const document = (await createDocumentFromTemplate.run(
        liveContext({
          props: {
            template: template!.id,
            signers: {
              [`email_${role.id}`]: `ap-live-${runId}@example.com`,
              [`name_${role.id}`]: `Live ${runId}`,
            },
            document_name: `ap-template-${runId}.pdf`,
          },
        }).ctx
      )) as { id: string; template_id: string; assignment_id: string | null };
      templateDocumentIds.add(document.id);
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
            message: 'Automated sandbox test, please ignore.',
          },
        }).ctx
      );
      expect(sent).toMatchObject({ document_id: documentId, signer_count: 1 });
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
    async () => {
      const webhookUrl = `https://automations.example.com/api/v1/webhooks/ap-live-${runId}`;
      const ownUrl = new RegExp(
        `^${webhookUrl}\\?assinafy_token=[0-9a-f]{48}$`
      );
      const props = {
        events: ['document_ready'],
        notification_email:
          env['ASSINAFY_LIVE_WEBHOOK_EMAIL'] ?? 'webhooks@example.com',
        replace_existing: false,
      };
      const endpointsPath = await client.accountPath('/webhooks/endpoints');
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
        await newEvent.onEnable(ctx);
        if (supportsEndpoints) {
          expect(
            (await endpoints()).filter((endpoint) =>
              ownUrl.test(endpoint.url ?? '')
            )
          ).toHaveLength(1);
          expect(await store.get('webhook_secret')).toMatch(/^whsec_/);
        } else {
          expect(
            await client.find({ method: HttpMethod.GET, path })
          ).toMatchObject({
            url: expect.stringMatching(ownUrl),
            is_active: true,
          });
        }
        await newEvent.onDisable(ctx);
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
});
