import { HttpMethod } from '@activepieces/pieces-common';
import { DEDUPE_KEY_PROPERTY } from '@activepieces/pieces-framework';
import { newEvent } from '../src/lib/triggers/new-event';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  context,
  memoryStore,
  replyData,
  replyError,
  sendRequest,
  sentRequests,
  signedDocument,
} from './helpers';

const WEBHOOK_URL = 'https://automations.example.com/api/v1/webhooks/flow_1';
const subscriptionUrl = `${PRODUCTION}/accounts/acc_1/webhooks/subscriptions`;
const webhookProps = {
  events: ['document_ready'],
  notification_email: undefined,
  replace_existing: false,
};
const webhookContext = ({
  props = {},
  extra = {},
}: {
  props?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) =>
  context({
    props: { ...webhookProps, ...props },
    extra: { webhookUrl: WEBHOOK_URL, ...extra },
  });
const ours = {
  is_active: true,
  url: `${WEBHOOK_URL}?assinafy_token=earlier`,
  email: 'ops@example.com',
  events: ['document_ready'],
};
const tokenUrl = new RegExp(`^${WEBHOOK_URL}\\?assinafy_token=[0-9a-f]{48}$`);
const replySaved = () =>
  sendRequest.mockImplementationOnce(async () => {
    const saved = sentRequests().find(
      (sent) => sent.method === HttpMethod.PUT
    )?.body;
    return {
      status: 200,
      headers: {},
      body: { data: { ...ours, ...(saved as object) } },
    };
  });
const enable = async (props: Record<string, unknown> = {}) => {
  const store = memoryStore();
  await newEvent.onEnable(webhookContext({ props, extra: { store } }));
  return store;
};

const readyEvent = {
  id: 91,
  event: 'document_ready',
  message: 'The document was signed.',
  payload: null,
  created_at: 1788273130,
  account_id: 'acc_1',
  subject: { type: 'Account', id: 'acc_1', name: 'Acme' },
  object: {
    type: 'Document',
    id: 'doc_2',
    name: 'Signed contract.pdf',
    status: 'certificating',
  },
};

describe('New Event (Instant): enabling', () => {
  test('subscribes this flow with a secret token when the workspace has no subscription, then confirms it', async () => {
    replyError({
      status: 404,
      body: { status: 404, message: 'Not found', data: null },
    });
    replyData({});
    replySaved();
    const store = await enable({ notification_email: ' ops@example.com ' });
    expect(sentRequests()[1]).toEqual(
      expect.objectContaining({
        method: HttpMethod.PUT,
        url: subscriptionUrl,
        body: {
          events: ['document_ready'],
          is_active: true,
          url: expect.stringMatching(tokenUrl),
          email: 'ops@example.com',
        },
      })
    );
    const token = await store.get<string>('webhook_token');
    expect(
      new URL(
        String((sentRequests()[1].body as { url: string }).url)
      ).searchParams.get('assinafy_token')
    ).toBe(token);
    expect(sentRequests()[2]).toMatchObject({
      method: HttpMethod.GET,
      url: subscriptionUrl,
    });
  });

  test('keeps its token when enabled again, so deliveries already on the way still count', async () => {
    const token = 'a'.repeat(48);
    const store = memoryStore({ webhook_token: token });
    replyData(ours);
    replyData({});
    replySaved();
    await newEvent.onEnable(webhookContext({ extra: { store } }));
    expect(sentRequests()[1].body).toMatchObject({
      url: `${WEBHOOK_URL}?assinafy_token=${token}`,
    });
    await expect(store.get('webhook_token')).resolves.toBe(token);
  });

  test('gives each new flow its own token', async () => {
    replyData(null);
    replyData({});
    replySaved();
    const first = await (
      await enable({ notification_email: 'ops@example.com' })
    ).get('webhook_token');
    sendRequest.mockReset();
    replyData(null);
    replyData({});
    replySaved();
    const second = await (
      await enable({ notification_email: 'ops@example.com' })
    ).get('webhook_token');
    expect(first).not.toEqual(second);
  });

  test('keeps the email already configured and takes back its own address with an older token', async () => {
    replyData(ours);
    replyData({});
    replySaved();
    await enable({ events: ['document_ready', 'signer_rejected_document'] });
    expect(sentRequests()[1].body).toEqual({
      events: ['document_ready', 'signer_rejected_document'],
      is_active: true,
      url: expect.stringMatching(tokenUrl),
      email: 'ops@example.com',
    });
  });

  test('refuses to take over another active destination, showing only its host', async () => {
    replyData({
      is_active: true,
      url: 'https://erp.example.com/hooks/assinafy?token=secret',
      email: 'ops@example.com',
    });
    const error = await newEvent.onEnable(webhookContext({})).then(
      () => undefined,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'already sends its webhooks to erp.example.com'
    );
    expect((error as Error).message).not.toContain('secret');
    expect(sentRequests()).toHaveLength(1);
  });

  test('describes an unparseable existing destination without echoing it', async () => {
    replyData({ is_active: true, url: 'not a url', email: 'ops@example.com' });
    await expect(newEvent.onEnable(webhookContext({}))).rejects.toThrow(
      'already sends its webhooks to another address'
    );
  });

  test('takes over another destination when explicitly allowed', async () => {
    replyData({
      is_active: true,
      url: 'https://erp.example.com/hooks',
      email: 'ops@example.com',
    });
    replyData({});
    replySaved();
    await enable({ replace_existing: true });
    expect(sentRequests()[1].body).toMatchObject({
      url: expect.stringMatching(tokenUrl),
      email: 'ops@example.com',
    });
  });

  test('needs a delivery notice email when Assinafy has none', async () => {
    replyData({ is_active: false, url: null, email: null });
    await expect(newEvent.onEnable(webhookContext({}))).rejects.toThrow(
      'Enter a Delivery Notice Email'
    );
    expect(sentRequests()).toHaveLength(1);
  });

  test('fails when another system changed the subscription at the same moment', async () => {
    replyData(null);
    replyData({});
    replyData({ is_active: true, url: 'https://erp.example.com/hooks' });
    await expect(
      newEvent.onEnable(
        webhookContext({ props: { notification_email: 'ops@example.com' } })
      )
    ).rejects.toThrow(
      'Another system changed the Assinafy webhook at the same time.'
    );
    replyData(null);
    replyData({});
    replyData(ours);
    await expect(
      enable({ notification_email: 'ops@example.com' })
    ).rejects.toThrow('Another system changed');
  });
});

describe('New Event (Instant): disabling', () => {
  test('inactivates the subscription it owns', async () => {
    replyData(ours);
    replyData({ is_active: false });
    await newEvent.onDisable(webhookContext({}));
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${PRODUCTION}/accounts/acc_1/webhooks/inactivate`,
    });
  });

  test('leaves a subscription owned by someone else, an inactive one or a missing one alone', async () => {
    replyData({ is_active: true, url: 'https://erp.example.com/hooks' });
    await newEvent.onDisable(webhookContext({}));
    replyData({ is_active: false, url: WEBHOOK_URL });
    await newEvent.onDisable(webhookContext({}));
    replyError({
      status: 404,
      body: { status: 404, message: 'Not found', data: null },
    });
    await newEvent.onDisable(webhookContext({}));
    expect(
      sentRequests().every((request) => request.method === HttpMethod.GET)
    ).toBe(true);
  });
});

describe('New Event (Instant): sample data', () => {
  test('uses recent deliveries of the selected events', async () => {
    replyData([
      { event: 'document_ready', payload: readyEvent },
      {
        event: 'signer_created',
        payload: {
          ...readyEvent,
          event: 'signer_created',
          object: { type: 'Signer', id: 's' },
        },
      },
      { event: 'document_ready', payload: null },
    ]);
    const result = await newEvent.test?.(webhookContext({}));
    expect(result).toEqual([
      assinafyFormat.event({
        event: readyEvent,
        document: readyEvent.object as never,
      }),
    ]);
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/webhooks`,
      queryParams: { 'per-page': '50' },
    });
  });

  test('falls back to the static sample when nothing was delivered yet', async () => {
    replyData([]);
    await expect(newEvent.test?.(webhookContext({}))).resolves.toEqual([
      newEvent.sampleData,
    ]);
  });
});

describe('New Event (Instant): receiving', () => {
  const receive = ({
    body,
    props = {},
    queryParams = { assinafy_token: 'secret' },
  }: {
    body: unknown;
    props?: Record<string, unknown>;
    queryParams?: Record<string, string>;
  }) =>
    newEvent.run(
      webhookContext({
        props,
        extra: {
          store: memoryStore({ webhook_token: 'secret' }),
          payload: { body, headers: {}, queryParams },
        },
      })
    );

  test("drops deliveries without this flow's token", async () => {
    await expect(
      receive({ body: readyEvent, queryParams: { assinafy_token: 'guess' } })
    ).resolves.toEqual([]);
    await expect(
      receive({ body: readyEvent, queryParams: { assinafy_token: 'secreT' } })
    ).resolves.toEqual([]);
    await expect(
      receive({ body: readyEvent, queryParams: { assinafy_token: 'sécret' } })
    ).resolves.toEqual([]);
    await expect(
      receive({ body: readyEvent, queryParams: {} })
    ).resolves.toEqual([]);
    await expect(
      newEvent.run(
        webhookContext({
          props: {},
          extra: {
            payload: {
              body: readyEvent,
              headers: {},
              queryParams: { assinafy_token: 'x' },
            },
          },
        })
      )
    ).resolves.toEqual([]);
    expect(sentRequests()).toHaveLength(0);
  });

  test('returns the event with the document re-read from the API and a dedupe key', async () => {
    replyData(signedDocument);
    const [event] = await receive({ body: readyEvent });
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/documents/doc_2`,
    });
    expect(event).toEqual({
      ...assinafyFormat.event({ event: readyEvent, document: signedDocument }),
      [DEDUPE_KEY_PROPERTY]: '91',
    });
    expect(event).toMatchObject({ document_status: 'certificated' });
  });

  test('recognizes a document whatever the casing of its type', async () => {
    replyData(signedDocument);
    const [event] = await receive({
      body: {
        ...readyEvent,
        object: { ...readyEvent.object, type: 'document' },
      },
    });
    expect(sentRequests()[0].url).toBe(`${PRODUCTION}/documents/doc_2`);
    expect(event).toMatchObject({ document_status: 'certificated' });
  });

  test('ignores unselected events and malformed bodies', async () => {
    await expect(
      receive({ body: { ...readyEvent, event: 'document_uploaded' } })
    ).resolves.toEqual([]);
    await expect(receive({ body: 'not json' })).resolves.toEqual([]);
    await expect(receive({ body: [readyEvent] })).resolves.toEqual([]);
    expect(sentRequests()).toHaveLength(0);
  });

  test('passes non-document events through without an API call', async () => {
    const templateEvent = {
      ...readyEvent,
      event: 'template_processed',
      object: { type: 'Template', id: 'tpl_1' },
    };
    const [event] = await receive({
      body: templateEvent,
      props: { events: ['template_processed'] },
    });
    expect(event).toEqual({
      ...assinafyFormat.event({ event: templateEvent, document: null }),
      [DEDUPE_KEY_PROPERTY]: '91',
    });
    const withoutId = { ...templateEvent, id: undefined };
    await expect(
      receive({ body: withoutId, props: { events: ['template_processed'] } })
    ).resolves.toEqual([
      assinafyFormat.event({ event: withoutId, document: null }),
    ]);
    expect(sentRequests()).toHaveLength(0);
  });

  test('keeps the pushed document when it can no longer be read', async () => {
    replyError({
      status: 404,
      body: { status: 404, message: 'Not found', data: null },
    });
    const [missing] = await receive({ body: readyEvent });
    expect(missing).toMatchObject({
      document_id: 'doc_2',
      document_status: 'certificating',
    });
    replyError({
      status: 429,
      body: { status: 429, message: 'Too many requests', data: null },
    });
    const [limited] = await receive({ body: readyEvent });
    expect(limited).toMatchObject({
      document_id: 'doc_2',
      document_status: 'certificating',
    });
  });

  test('fails on a revoked connection instead of emitting stale data', async () => {
    replyError({
      status: 401,
      body: { status: 401, message: 'Invalid credentials', data: null },
    });
    await expect(receive({ body: readyEvent })).rejects.toThrow('HTTP 401');
    replyError({
      status: 403,
      body: { status: 403, message: 'Forbidden', data: null },
    });
    await expect(receive({ body: readyEvent })).rejects.toThrow('HTTP 403');
  });
});
