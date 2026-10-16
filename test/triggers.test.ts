import { createHmac } from 'node:crypto';
import { HttpMethod } from '@activepieces/pieces-common';
import { DEDUPE_KEY_PROPERTY } from '@activepieces/pieces-framework';
import { newEvent } from '../src/lib/triggers/new-event';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  context,
  memoryStore,
  oauthAuth,
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
const notFound = () =>
  replyError({
    status: 404,
    body: { status: 404, message: 'Not found', data: null },
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

describe('New Event (Instant): enabling on a single webhook address', () => {
  beforeEach(notFound);

  test('subscribes this flow with a secret token when the workspace has no subscription, then confirms it', async () => {
    replyError({
      status: 404,
      body: { status: 404, message: 'Not found', data: null },
    });
    replyData({});
    replySaved();
    const store = await enable({ notification_email: ' ops@example.com ' });
    expect(sentRequests()[2]).toEqual(
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
        String((sentRequests()[2].body as { url: string }).url)
      ).searchParams.get('assinafy_token')
    ).toBe(token);
    expect(sentRequests()[3]).toMatchObject({
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
    expect(sentRequests()[2].body).toMatchObject({
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
    notFound();
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
    expect(sentRequests()[2].body).toEqual({
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
    expect(sentRequests()).toHaveLength(2);
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
    expect(sentRequests()[2].body).toMatchObject({
      url: expect.stringMatching(tokenUrl),
      email: 'ops@example.com',
    });
  });

  test('needs a delivery notice email when Assinafy has none', async () => {
    replyData({ is_active: false, url: null, email: null });
    await expect(newEvent.onEnable(webhookContext({}))).rejects.toThrow(
      'Enter a Delivery Notice Email'
    );
    expect(sentRequests()).toHaveLength(2);
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
    notFound();
    replyData(null);
    replyData({});
    replyData(ours);
    await expect(
      enable({ notification_email: 'ops@example.com' })
    ).rejects.toThrow('Another system changed');
  });
});

describe('New Event (Instant): disabling on a single webhook address', () => {
  beforeEach(notFound);

  test('inactivates the subscription it owns', async () => {
    replyData(ours);
    replyData({ is_active: false });
    await newEvent.onDisable(webhookContext({}));
    expect(sentRequests()[2]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${PRODUCTION}/accounts/acc_1/webhooks/inactivate`,
    });
  });

  test('leaves a subscription owned by someone else, an inactive one or a missing one alone', async () => {
    replyData({ is_active: true, url: 'https://erp.example.com/hooks' });
    await newEvent.onDisable(webhookContext({}));
    notFound();
    replyData({ is_active: false, url: WEBHOOK_URL });
    await newEvent.onDisable(webhookContext({}));
    notFound();
    notFound();
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

describe('New Event (Instant): webhook endpoints', () => {
  const endpointsUrl = `${PRODUCTION}/accounts/acc_1/webhooks/endpoints`;
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const other = {
    id: 'ep_erp',
    url: 'https://erp.example.com/hooks',
    email: 'erp@example.com',
    is_active: true,
  };
  const mine = {
    id: 'ep_mine',
    url: `${WEBHOOK_URL}?assinafy_token=earlier`,
    email: 'ops@example.com',
    is_active: true,
  };

  test('creates a signed endpoint for the flow and keeps its signing secret', async () => {
    replyData([other]);
    replyData({ ...mine, id: 'ep_new' });
    replyData({ secret });
    const store = await enable();
    expect(sentRequests()[1]).toEqual(
      expect.objectContaining({
        method: HttpMethod.POST,
        url: endpointsUrl,
        body: {
          name: 'Activepieces',
          url: expect.stringMatching(tokenUrl),
          email: 'erp@example.com',
          events: ['document_ready'],
          is_active: true,
          signing_enabled: true,
        },
      })
    );
    expect(sentRequests()[2]).toMatchObject({
      method: HttpMethod.GET,
      url: `${endpointsUrl}/ep_new/secret`,
    });
    await expect(store.get('webhook_secret')).resolves.toBe(secret);
  });

  test('updates the endpoint already pointing at this flow', async () => {
    replyData([other, mine]);
    replyData(mine);
    replyData({ secret });
    await enable({ notification_email: 'alerts@example.com' });
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${endpointsUrl}/ep_mine`,
      body: { email: 'alerts@example.com', signing_enabled: true },
    });
  });

  test('stores the OAuth create-response secret without calling its restricted secret endpoint', async () => {
    replyData([{ id: 'acc_1', name: 'Acme' }]);
    replyData([]);
    replyData({ ...mine, signing_enabled: true, secret });
    const store = memoryStore({ webhook_secret: 'stale' });
    await newEvent.onEnable(
      webhookContext({
        props: { notification_email: 'ops@example.com' },
        extra: { store, auth: oauthAuth },
      })
    );
    expect(sentRequests()[2].body).toMatchObject({ signing_enabled: true });
    expect(sentRequests()).toHaveLength(3);
    await expect(store.get('webhook_secret')).resolves.toBe(secret);
    await expect(store.get('webhook_endpoint_id')).resolves.toBe(mine.id);
  });

  test('uses the signing secret from an API key create response when provided', async () => {
    replyData([]);
    replyData({ ...mine, secret });
    const store = await enable({ notification_email: 'ops@example.com' });
    expect(sentRequests()).toHaveLength(2);
    await expect(store.get('webhook_secret')).resolves.toBe(secret);
  });

  test('keeps an OAuth endpoint and its stored secret when republishing', async () => {
    const store = memoryStore({
      webhook_secret: secret,
      webhook_endpoint_id: mine.id,
    });
    replyData([{ id: 'acc_1' }]);
    replyData([{ ...mine, signing_enabled: true }]);
    replyData(mine);
    await newEvent.onEnable(
      webhookContext({ extra: { auth: oauthAuth, store } })
    );
    expect(sentRequests().at(-1)).toMatchObject({
      method: HttpMethod.PUT,
      url: `${endpointsUrl}/${mine.id}`,
      body: { signing_enabled: true },
    });
    expect(sentRequests()).toHaveLength(3);
    await expect(store.get('webhook_secret')).resolves.toBe(secret);
  });

  test.each([
    { signing_enabled: false, endpointId: 'ep_mine' },
    { signing_enabled: true, endpointId: 'ep_old' },
    { signing_enabled: true, endpointId: 'ep_mine', lost: true },
  ])(
    'recreates an unsigned OAuth endpoint or one without its own secret (%j)',
    async ({ signing_enabled, endpointId, lost }) => {
      const store = memoryStore({
        webhook_endpoint_id: endpointId,
        ...(lost ? {} : { webhook_secret: secret }),
      });
      replyData([{ id: 'acc_1' }]);
      replyData([{ ...mine, signing_enabled }]);
      replyData([]);
      replyData({ ...mine, id: 'ep_new', secret });
      await newEvent.onEnable(
        webhookContext({ extra: { auth: oauthAuth, store } })
      );
      expect(
        sentRequests()
          .slice(2)
          .map(({ method }) => method)
      ).toEqual([HttpMethod.DELETE, HttpMethod.POST]);
      await expect(store.get('webhook_endpoint_id')).resolves.toBe('ep_new');
      await expect(store.get('webhook_secret')).resolves.toBe(secret);
    }
  );

  test.each([undefined, '', 'whsec_', 'not-a-secret'])(
    'fails setup if OAuth creation returns an unusable secret (%s)',
    async (secret) => {
      replyData([{ id: 'acc_1' }]);
      replyData([]);
      replyData({ ...mine, secret });
      await expect(
        newEvent.onEnable(
          webhookContext({
            props: { notification_email: 'ops@example.com' },
            extra: { auth: oauthAuth },
          })
        )
      ).rejects.toThrow('did not return a webhook signing secret');
      expect(sentRequests()).toHaveLength(3);
    }
  );

  test('replaces the oldest OAuth endpoint only when explicitly allowed and stores a new secret', async () => {
    replyData([{ id: 'acc_1' }]);
    replyData([other]);
    replyError({ status: 403, body: { message: 'Limit reached' } });
    replyData([]);
    replyData({ ...mine, secret });
    await newEvent.onEnable(
      webhookContext({
        props: { replace_existing: true },
        extra: { auth: oauthAuth },
      })
    );
    expect(sentRequests()[3]).toMatchObject({
      method: HttpMethod.DELETE,
      url: `${endpointsUrl}/${other.id}`,
    });
    expect(sentRequests()[4]).toMatchObject({
      method: HttpMethod.POST,
      url: endpointsUrl,
    });
  });

  test('drops deliveries if a signed endpoint loses its stored secret', async () => {
    await expect(
      newEvent.run(
        webhookContext({
          extra: {
            store: memoryStore({
              webhook_token: 'token',
              webhook_endpoint_id: mine.id,
            }),
            payload: {
              body: readyEvent,
              queryParams: { assinafy_token: 'token' },
            },
          },
        })
      )
    ).resolves.toEqual([]);
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test('explains the endpoint limit, and takes over the oldest endpoint only when allowed', async () => {
    const limit = () =>
      replyError({
        status: 403,
        body: { status: 403, message: 'Limit reached', data: null },
      });
    replyData([other]);
    limit();
    await expect(enable()).rejects.toThrow(
      'Every webhook endpoint of this Assinafy workspace is already in use'
    );
    sendRequest.mockReset();
    replyData([other]);
    limit();
    replyData({ ...other, url: mine.url });
    replyData({ secret });
    await enable({ replace_existing: true });
    expect(sentRequests()[2]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${endpointsUrl}/ep_erp`,
    });
  });

  test('passes other API failures through and needs an email when none is known', async () => {
    replyData([]);
    replyError({
      status: 400,
      body: { status: 400, message: 'URL already used', data: null },
    });
    await expect(
      enable({ notification_email: 'ops@example.com' })
    ).rejects.toThrow('URL already used');
    replyData([]);
    await expect(enable()).rejects.toThrow('Enter a Delivery Notice Email');
  });

  test('deletes only its own endpoint on disable and forgets the secret', async () => {
    const store = memoryStore({ webhook_secret: secret });
    replyData([other, mine]);
    replyData([]);
    await newEvent.onDisable(webhookContext({ extra: { store } }));
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.DELETE,
      url: `${endpointsUrl}/ep_mine`,
    });
    await expect(store.get('webhook_secret')).resolves.toBeNull();
    sendRequest.mockReset();
    replyData([other]);
    await newEvent.onDisable(webhookContext({}));
    expect(sentRequests()).toHaveLength(1);
  });
});

describe('New Event (Instant): signed deliveries', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const body = {
    ...readyEvent,
    event: 'template_processed',
    object: { type: 'Template', id: 'tpl_1' },
  };
  const rawBody = JSON.stringify(body);
  const sign = ({ id, timestamp }: { id: string; timestamp: string }) =>
    `v1,${createHmac(
      'sha256',
      Buffer.from(secret.slice('whsec_'.length), 'base64')
    )
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest('base64')}`;
  const now = () => String(Math.floor(Date.now() / 1000));
  const receive = ({
    headers,
    raw = rawBody as unknown,
  }: {
    headers: Record<string, string>;
    raw?: unknown;
  }) =>
    newEvent.run(
      webhookContext({
        props: { events: ['template_processed'] },
        extra: {
          store: memoryStore({
            webhook_token: 'token',
            webhook_secret: secret,
          }),
          payload: {
            body,
            rawBody: raw,
            headers,
            queryParams: { assinafy_token: 'token' },
          },
        },
      })
    );

  test('matches the Standard Webhooks reference signature', () => {
    expect(
      createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
        .update('msg_p5jXN8AQM9LWM0D4loKWxJek.1614265330.{"test": 2432232314}')
        .digest('base64')
    ).toBe('g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  test('accepts a valid signature among several and dedupes by webhook-id', async () => {
    const timestamp = now();
    const headers = {
      'Webhook-Id': 'msg_1',
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,AAAA ${sign({ id: 'msg_1', timestamp })}`,
    };
    await expect(receive({ headers })).resolves.toEqual([
      {
        ...assinafyFormat.event({ event: body, document: null }),
        [DEDUPE_KEY_PROPERTY]: 'msg_1',
      },
    ]);
    await expect(
      receive({ headers, raw: Buffer.from(rawBody) })
    ).resolves.toHaveLength(1);
  });

  test('drops unsigned, tampered, replayed or unreadable deliveries', async () => {
    const timestamp = now();
    const valid = {
      'webhook-id': 'msg_1',
      'webhook-timestamp': timestamp,
      'webhook-signature': sign({ id: 'msg_1', timestamp }),
    };
    const old = String(Number(timestamp) - 600);
    for (const [headers, raw] of [
      [{}, rawBody],
      [{ ...valid, 'webhook-signature': 'v1,AAAA' }, rawBody],
      [
        { ...valid, 'webhook-signature': valid['webhook-signature'].slice(3) },
        rawBody,
      ],
      [{ ...valid, 'webhook-id': 'msg_2' }, rawBody],
      [{ ...valid, 'webhook-timestamp': 'later' }, rawBody],
      [
        {
          ...valid,
          'webhook-timestamp': old,
          'webhook-signature': sign({ id: 'msg_1', timestamp: old }),
        },
        rawBody,
      ],
      [valid, `${rawBody} `],
      [valid, null],
    ] as const) {
      await expect(
        receive({ headers: headers as Record<string, string>, raw })
      ).resolves.toEqual([]);
    }
  });
});
