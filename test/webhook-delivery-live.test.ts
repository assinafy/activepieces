import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import {
  AppConnectionType,
  ApFile,
  DEDUPE_KEY_PROPERTY,
} from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { uploadDocument } from '../src/lib/actions/upload-document';
import { setContractTerms } from '../src/lib/actions/set-contract-terms';
import { renewContract } from '../src/lib/actions/renew-contract';
import { terminateContract } from '../src/lib/actions/terminate-contract';
import { assinafyApi, AssinafyAuthValue } from '../src/lib/common/client';
import { ApiContract } from '../src/lib/common/contracts';
import { assinafyDocuments } from '../src/lib/common/documents';
import { assinafyValues } from '../src/lib/common/values';
import { newEvent } from '../src/lib/triggers/new-event';
import { memoryStore } from './helpers';
import { samplePdf } from './live-helpers';

vi.unmock('@activepieces/pieces-common');

const enabled = process.env['ASSINAFY_WEBHOOK_LIVE'] === '1';
const events = [
  'document_contract_updated',
  'document_contract_renewed',
  'document_contract_terminated',
];

describe.skipIf(!enabled)('Assinafy production signed webhook delivery', () => {
  beforeEach(() => vi.unstubAllGlobals());

  test(
    'receives genuine contract events, rejects tampering and removes its resources',
    async () => {
      const required = (name: string) => {
        const value = process.env[name];
        if (!value)
          throw new Error(`${name} is required for the live webhook test.`);
        return value;
      };
      const auth = {
        type: AppConnectionType.CUSTOM_AUTH,
        props: {
          api_key: required('ASSINAFY_API_KEY'),
          account_id: required('ASSINAFY_ACCOUNT_ID'),
          environment: 'production',
        },
      };
      const webhookUrl = new URL(required('ASSINAFY_LIVE_WEBHOOK_URL'));
      if (
        webhookUrl.protocol !== 'https:' ||
        webhookUrl.username ||
        webhookUrl.password
      ) {
        throw new Error(
          'ASSINAFY_LIVE_WEBHOOK_URL must be an HTTPS tunnel URL without credentials.'
        );
      }
      const port = Number(required('ASSINAFY_LIVE_WEBHOOK_PORT'));
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
          'ASSINAFY_LIVE_WEBHOOK_PORT must be an integer from 1 to 65535.'
        );
      }
      const runId = randomUUID();
      const filename = `ap-webhook-live-${runId}.pdf`;
      webhookUrl.pathname = `${webhookUrl.pathname.replace(/\/$/, '')}/ap-live-${runId}`;
      webhookUrl.search = '';
      webhookUrl.hash = '';
      const store = memoryStore();
      const propsValue = {
        events,
        notification_email:
          process.env['ASSINAFY_LIVE_WEBHOOK_EMAIL'] ?? 'ops@example.com',
        replace_existing: false,
      };
      const triggerContext = {
        auth,
        store,
        propsValue,
        webhookUrl: webhookUrl.toString(),
      };
      const run = (props: Record<string, unknown>) =>
        ({ auth, propsValue: props }) as never;
      const client = assinafyApi.forAuth(auth as AssinafyAuthValue);
      const documentIds = new Set<string>();
      const received = new Map<string, Record<string, unknown>>();
      const failures: unknown[] = [];
      const callbackFailures: unknown[] = [];
      let enableAttempted = false;
      let uploadAttempted = false;
      let firstPayload:
        | {
            body: Record<string, unknown>;
            rawBody: Buffer;
            headers: IncomingMessage['headers'];
            queryParams: Record<string, string>;
          }
        | undefined;

      const receive = async (
        request: IncomingMessage,
        response: ServerResponse
      ) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (request.method === 'GET' && url.pathname === '/health') {
          response.writeHead(200).end('ok');
          return;
        }
        if (request.method !== 'POST' || url.pathname !== webhookUrl.pathname) {
          response.writeHead(404).end();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > 1024 * 1024) {
            response.writeHead(413).end();
            request.destroy();
            return;
          }
          chunks.push(bytes);
        }
        const rawBody = Buffer.concat(chunks);
        let body: unknown;
        try {
          body = JSON.parse(rawBody.toString('utf8'));
        } catch {
          response.writeHead(400).end();
          return;
        }
        if (
          !assinafyValues.isRecord(body) ||
          !assinafyValues.isRecord(body['object']) ||
          !documentIds.has(String(body['object']['id']))
        ) {
          response.writeHead(204).end();
          return;
        }
        const payload = {
          body,
          rawBody,
          headers: request.headers,
          queryParams: Object.fromEntries(url.searchParams),
        };
        const output = await newEvent.run({
          ...triggerContext,
          payload,
        } as never);
        if (output.length !== 1)
          throw new Error(
            'A real test delivery did not pass signature verification.'
          );
        const event = output[0] as Record<string, unknown>;
        expect(event['document_id']).toBe(body['object']['id']);
        expect(event['event_id']).toBe(body['id']);
        expect(event[DEDUPE_KEY_PROPERTY]).toBe(request.headers['webhook-id']);
        expect(event[DEDUPE_KEY_PROPERTY]).toBeTruthy();
        expect(request.headers['webhook-signature']).toMatch(/^v1,/);
        for (const [key, value] of Object.entries(
          assinafyValues.isRecord(body['payload']) ? body['payload'] : {}
        )) {
          expect(event[`detail_${key}`]).toEqual(
            value !== null && typeof value === 'object'
              ? JSON.stringify(value)
              : value
          );
        }
        received.set(String(event['event']), event);
        firstPayload ??= payload;
        response.writeHead(204).end();
      };
      const pending = new Set<Promise<void>>();
      const server = createServer((request, response) => {
        const task = receive(request, response)
          .catch((error: unknown) => {
            callbackFailures.push(error);
            if (!response.headersSent) response.writeHead(500);
            response.end();
          })
          .finally(() => pending.delete(task));
        pending.add(task);
      });
      server.requestTimeout = 15_000;
      server.headersTimeout = 10_000;
      try {
        server.listen(port, '127.0.0.1');
        await once(server, 'listening');
        const health = await fetch(new URL('/health', webhookUrl), {
          signal: AbortSignal.timeout(15_000),
        });
        expect(health.status).toBe(200);
        expect(await health.text()).toBe('ok');
        enableAttempted = true;
        await newEvent.onEnable(triggerContext as never);
        expect(await store.get('webhook_endpoint_id')).toBeTruthy();
        const secret = await store.get<string>('webhook_secret');
        expect(typeof secret === 'string' && secret.startsWith('whsec_')).toBe(
          true
        );
        uploadAttempted = true;
        const uploaded = (await uploadDocument.run(
          run({
            file: new ApFile(filename, samplePdf(), 'pdf'),
          })
        )) as { id: string };
        documentIds.add(uploaded.id);
        await assinafyDocuments.waitUntilProcessed({
          client,
          documentId: uploaded.id,
        });
        const date = (days: number) =>
          new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
        const initial = (await setContractTerms.run(
          run({
            document: uploaded.id,
            terms: {
              status: 'active',
              counterparty_name: 'Example Ltd',
              value: 1.23,
              currency: 'BRL',
              start_date: date(0),
              end_date: date(365),
              auto_renew: false,
              renewal_term_months: 12,
              notice_period_days: 0,
              metadata: { test_run: runId },
            },
          })
        )) as ApiContract;
        expect(initial.document_id).toBe(uploaded.id);
        const renewed = (await renewContract.run(
          run({
            document: uploaded.id,
            renewal: {
              term: initial['term'],
              updated_at: initial['updated_at'],
            },
          })
        )) as ApiContract;
        const terminated = (await terminateContract.run(
          run({
            document: uploaded.id,
            reason: 'Temporary integration test completed.',
            updated_at: renewed['updated_at'],
          })
        )) as ApiContract;
        expect(terminated['status']).toBe('terminated');
        await vi.waitFor(
          () => {
            if (callbackFailures.length)
              throw new AggregateError(
                callbackFailures,
                'Webhook callback failed.'
              );
            expect([...received.keys()].sort()).toEqual([...events].sort());
          },
          { timeout: 120_000, interval: 250 }
        );
        expect(firstPayload).toBeDefined();
        const replay = (await newEvent.run({
          ...triggerContext,
          payload: firstPayload,
        } as never)) as Record<string, unknown>[];
        expect(replay[0]?.[DEDUPE_KEY_PROPERTY]).toBe(
          firstPayload!.headers['webhook-id']
        );
        for (const payload of [
          {
            ...firstPayload!,
            rawBody: Buffer.concat([firstPayload!.rawBody, Buffer.from(' ')]),
          },
          {
            ...firstPayload!,
            headers: {
              ...firstPayload!.headers,
              'webhook-signature': 'v1,invalid',
            },
          },
        ]) {
          await expect(
            newEvent.run({ ...triggerContext, payload } as never)
          ).resolves.toEqual([]);
        }
      } catch (error) {
        failures.push(error);
      } finally {
        if (enableAttempted) {
          try {
            await newEvent.onDisable(triggerContext as never);
            const token = await store.get<string>('webhook_token');
            const registered = new URL(webhookUrl);
            if (token) registered.searchParams.set('assinafy_token', token);
            const remaining = await client.list({
              method: HttpMethod.GET,
              path: await client.accountPath('/webhooks/endpoints'),
              queryParams: { url: registered.toString() },
            });
            expect(remaining).toHaveLength(0);
          } catch (error) {
            failures.push(error);
          }
        }
        await Promise.allSettled(pending);
        if (uploadAttempted && documentIds.size === 0) {
          try {
            const documents = await client.listAll<{
              id: string;
              name: string;
            }>({
              request: {
                method: HttpMethod.GET,
                path: await client.accountPath('/documents'),
                queryParams: { search: filename },
              },
              maxItems: 100,
            });
            for (const document of documents)
              if (document.name === filename) documentIds.add(document.id);
          } catch (error) {
            failures.push(error);
          }
        }
        for (const id of documentIds) {
          try {
            const path = `/documents/${assinafyValues.encodeId(id, 'Document')}`;
            await client.find({ method: HttpMethod.DELETE, path });
            expect(
              await client.find({ method: HttpMethod.GET, path })
            ).toBeNull();
          } catch (error) {
            failures.push(error);
          }
        }
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
            server.closeAllConnections();
          }).catch((error: unknown) => failures.push(error));
        }
        failures.push(...callbackFailures);
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          'Live webhook delivery or cleanup failed.'
        );
    },
    15 * 60_000
  );
});
