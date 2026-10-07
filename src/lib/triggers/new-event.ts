import {
  AppConnectionType,
  createTrigger,
  DEDUPE_KEY_PROPERTY,
  MarkdownVariant,
  Property,
  TriggerStrategy,
} from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assinafyAuth } from '../auth';
import {
  AssinafyApiError,
  AssinafyClient,
  assinafyApi,
} from '../common/client';
import { assinafyConstants } from '../common/constants';
import { ApiDocument, assinafyFormat } from '../common/format';
import { assinafySample } from '../common/sample';
import { assinafyValues } from '../common/values';

function isDocument(value: unknown): value is ApiDocument {
  return (
    assinafyValues.isRecord(value) &&
    String(value['type']).toLowerCase() === 'document' &&
    typeof value['id'] === 'string'
  );
}

function sameEndpoint({
  url,
  webhookUrl,
}: {
  url: string | null | undefined;
  webhookUrl: string;
}): boolean {
  if (!url || !URL.canParse(url)) {
    return false;
  }
  const registered = new URL(url);
  const ours = new URL(webhookUrl);
  return (
    registered.origin === ours.origin && registered.pathname === ours.pathname
  );
}

function withToken({
  webhookUrl,
  token,
}: {
  webhookUrl: string;
  token: string;
}): string {
  const url = new URL(webhookUrl);
  url.searchParams.set(TOKEN_PARAM, token);
  return url.toString();
}

function tokenMatches({
  expected,
  given,
}: {
  expected: string | null;
  given: unknown;
}): boolean {
  if (!expected || typeof given !== 'string') {
    return false;
  }
  const givenBytes = Buffer.from(given);
  const expectedBytes = Buffer.from(expected);
  return (
    givenBytes.length === expectedBytes.length &&
    timingSafeEqual(givenBytes, expectedBytes)
  );
}

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : 'another address';
}

async function readSubscription(
  client: AssinafyClient
): Promise<ApiSubscription | null> {
  return client.find<ApiSubscription>({
    method: HttpMethod.GET,
    path: await client.accountPath('/webhooks/subscriptions'),
  });
}

async function listEndpoints(
  client: AssinafyClient
): Promise<ApiEndpoint[] | null> {
  const path = await client.accountPath('/webhooks/endpoints');
  return client
    .list<ApiEndpoint>({ method: HttpMethod.GET, path })
    .catch((error: unknown) => {
      if (error instanceof AssinafyApiError && error.status === 404) {
        return null;
      }
      throw error;
    });
}

async function endpointPath({
  client,
  id,
  suffix = '',
}: {
  client: AssinafyClient;
  id: string;
  suffix?: string;
}): Promise<string> {
  return client.accountPath(
    `/webhooks/endpoints/${encodeURIComponent(id)}${suffix}`
  );
}

function signatureValid({
  secret,
  headers,
  rawBody,
}: {
  secret: string;
  headers: Record<string, string> | undefined;
  rawBody: unknown;
}): boolean {
  const id = assinafyApi.headerValue({ headers, name: 'webhook-id' });
  const timestamp = assinafyApi.headerValue({
    headers,
    name: 'webhook-timestamp',
  });
  const signatures = assinafyApi.headerValue({
    headers,
    name: 'webhook-signature',
  });
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !(typeof rawBody === 'string' || rawBody instanceof Uint8Array)
  ) {
    return false;
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!(age <= SIGNATURE_TOLERANCE_SECONDS)) {
    return false;
  }
  const expected = createHmac(
    'sha256',
    Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  )
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest('base64');
  return signatures
    .split(' ')
    .some(
      (entry) =>
        entry.startsWith('v1,') &&
        tokenMatches({ expected, given: entry.slice(3) })
    );
}

async function subscribe({
  client,
  url,
  webhookUrl,
  events,
  notificationEmail,
  replace,
}: {
  client: AssinafyClient;
  url: string;
  webhookUrl: string;
  events: string[];
  notificationEmail: string | undefined;
  replace: boolean;
}): Promise<void> {
  const current = await readSubscription(client);
  const deliversElsewhere = Boolean(
    current?.is_active &&
    current.url &&
    !sameEndpoint({ url: current.url, webhookUrl })
  );
  if (deliversElsewhere && !replace) {
    throw new Error(
      `This Assinafy workspace already sends its webhooks to ${hostOf(
        current?.url ?? ''
      )}. The workspace has only one webhook address, so turning this flow on would stop those deliveries. Turn on "Replace Existing Webhook" if that is intended.`
    );
  }
  const email = notificationEmail || current?.email;
  if (!email) {
    throw new Error(
      'Enter a Delivery Notice Email so Assinafy can tell you about delivery problems.'
    );
  }
  await client.request<ApiSubscription>({
    method: HttpMethod.PUT,
    path: await client.accountPath('/webhooks/subscriptions'),
    body: { events, is_active: true, url, email },
  });
  const saved = await readSubscription(client);
  if (!saved?.is_active || saved.url !== url) {
    throw new Error(
      'Another system changed the Assinafy webhook at the same time. Check which system should receive the events, then turn this flow on again.'
    );
  }
}

async function unsubscribe({
  client,
  webhookUrl,
}: {
  client: AssinafyClient;
  webhookUrl: string;
}): Promise<void> {
  const current = await readSubscription(client);
  if (current?.is_active && sameEndpoint({ url: current.url, webhookUrl })) {
    await client.request<ApiSubscription>({
      method: HttpMethod.PUT,
      path: await client.accountPath('/webhooks/inactivate'),
    });
  }
}

async function saveEndpoint({
  client,
  body,
  target,
  oldest,
}: {
  client: AssinafyClient;
  body: Record<string, unknown>;
  target: ApiEndpoint | undefined;
  oldest: ApiEndpoint | undefined;
}): Promise<ApiEndpoint> {
  if (target) {
    return client.request<ApiEndpoint>({
      method: HttpMethod.PUT,
      path: await endpointPath({ client, id: target.id }),
      body,
    });
  }
  try {
    return await client.request<ApiEndpoint>({
      method: HttpMethod.POST,
      path: await client.accountPath('/webhooks/endpoints'),
      body,
    });
  } catch (error) {
    if (!(error instanceof AssinafyApiError) || error.status !== 403) {
      throw error;
    }
    if (!oldest) {
      throw new Error(
        'Every webhook endpoint of this Assinafy workspace is already in use (1 endpoint, or up to 3 on paid plans). Remove one in Assinafy, turn on "Replace Existing Webhook" to take over the oldest one, or use the Document Signed trigger.',
        { cause: error }
      );
    }
    return saveEndpoint({ client, body, target: oldest, oldest: undefined });
  }
}

function withDedupeKey({
  key,
  output,
}: {
  key: unknown;
  output: Record<string, unknown>;
}) {
  return key === undefined || key === null || key === ''
    ? output
    : { ...output, [DEDUPE_KEY_PROPERTY]: String(key) };
}

const SETUP_NOTE = `Turning this flow on registers a webhook endpoint for it in Assinafy, and turning it off removes that endpoint.

- An Assinafy workspace has **1** webhook endpoint, or up to **3** on paid plans. When every endpoint is taken, this flow will not start unless **Replace Existing Webhook** is on, which reuses the oldest endpoint.
- With an API key connection, Assinafy signs every delivery and the flow rejects deliveries whose signature does not match.
- Where a workspace supports only its single webhook address, the flow uses that address, and **Replace Existing Webhook** allows taking it over from another system.
- Need more independent flows than endpoints? Use the **Document Signed** trigger, which checks Assinafy every few minutes instead.`;

const SAMPLE_DOCUMENT = assinafySample.document;

const SAMPLE_EVENT = {
  event_id: 4821,
  event: 'document_ready',
  message: 'The document was signed by all signers.',
  occurred_at: '2026-09-01T14:32:10.000Z',
  account_id: 'd199996981dbd199996981db',
  actor_type: 'Account',
  actor_id: 'd199996981dbd199996981db',
  actor_name: 'Example Workspace',
  actor_email: null,
  object_type: 'Document',
  object_id: '615601fab04c0a3147bb1246',
  object_name: 'Service agreement.pdf',
  ...Object.fromEntries(
    Object.entries(SAMPLE_DOCUMENT).map(([key, value]) => [
      `document_${key}`,
      value,
    ])
  ),
};

export const newEvent = createTrigger({
  auth: assinafyAuth,
  name: 'new_event',
  classification: 'READ',
  displayName: 'New Event (Instant)',
  description:
    'Triggers instantly when a signing event happens, such as a document signed or declined.',
  aiMetadata: {
    description:
      'Fires once per Assinafy webhook event of the selected types, delivered instantly: for example document_ready when every signer has signed, or signer_rejected_document when someone declines. Each payload is one event with its actor, event details and, for document events, the current state of the document.',
  },
  type: TriggerStrategy.WEBHOOK,
  props: {
    setup: Property.MarkDown({
      value: SETUP_NOTE,
      variant: MarkdownVariant.WARNING,
    }),
    events: Property.StaticMultiSelectDropdown({
      displayName: 'Events',
      description:
        'Which events start the flow. "Document signed by all signers" is the usual choice.',
      required: true,
      defaultValue: ['document_ready'],
      options: {
        disabled: false,
        options: assinafyConstants.webhookEventOptions,
      },
    }),
    notification_email: Property.ShortText({
      displayName: 'Delivery Notice Email',
      description:
        'Assinafy emails this address about webhook delivery problems. Leave empty to keep the address already set in Assinafy.',
      required: false,
      placeholder: 'ops@example.com',
    }),
    replace_existing: Property.Checkbox({
      displayName: 'Replace Existing Webhook',
      description:
        'When no webhook endpoint is free, allow this flow to take over the oldest one, which then stops delivering to its current system.',
      required: false,
      defaultValue: false,
    }),
  },
  sampleData: SAMPLE_EVENT,
  async onEnable(context) {
    if (
      !context.propsValue.events?.length ||
      context.propsValue.events.some(
        (event) => !Object.hasOwn(assinafyConstants.webhookEventLabels, event)
      )
    ) {
      throw new Error('Select at least one valid webhook event.');
    }
    assinafyValues.validateContact({
      email: context.propsValue.notification_email?.trim(),
      label: 'Delivery Notice Email',
    });
    const client = assinafyApi.forTrigger(context.auth);
    const token =
      (await context.store.get<string>(TOKEN_KEY)) ??
      randomBytes(24).toString('hex');
    const url = withToken({ webhookUrl: context.webhookUrl, token });
    await context.store.put(TOKEN_KEY, token);
    const notificationEmail = context.propsValue.notification_email?.trim();
    const endpoints = await listEndpoints(client);
    if (endpoints === null) {
      await subscribe({
        client,
        url,
        webhookUrl: context.webhookUrl,
        events: context.propsValue.events,
        notificationEmail,
        replace: Boolean(context.propsValue.replace_existing),
      });
      await context.store.delete(SECRET_KEY);
      return;
    }
    const ours = endpoints.find((endpoint) =>
      sameEndpoint({ url: endpoint.url, webhookUrl: context.webhookUrl })
    );
    const email = notificationEmail || ours?.email || endpoints[0]?.email;
    if (!email) {
      throw new Error(
        'Enter a Delivery Notice Email so Assinafy can tell you about delivery problems.'
      );
    }
    const signs = context.auth.type === AppConnectionType.CUSTOM_AUTH;
    const body = {
      name: ENDPOINT_NAME,
      url,
      email,
      events: context.propsValue.events,
      is_active: true,
      signing_enabled: signs,
    };
    const saved = await saveEndpoint({
      client,
      body,
      target: ours,
      oldest: context.propsValue.replace_existing ? endpoints[0] : undefined,
    });
    if (!signs) {
      await context.store.delete(SECRET_KEY);
      return;
    }
    const { secret } = await client.request<{ secret: string }>({
      method: HttpMethod.GET,
      path: await endpointPath({ client, id: saved.id, suffix: '/secret' }),
    });
    await context.store.put(SECRET_KEY, secret);
  },
  async onDisable(context) {
    const client = assinafyApi.forTrigger(context.auth);
    const endpoints = await listEndpoints(client);
    if (endpoints === null) {
      await unsubscribe({ client, webhookUrl: context.webhookUrl });
      return;
    }
    const ours = endpoints.find((endpoint) =>
      sameEndpoint({ url: endpoint.url, webhookUrl: context.webhookUrl })
    );
    if (ours) {
      await client.find({
        method: HttpMethod.DELETE,
        path: await endpointPath({ client, id: ours.id }),
      });
    }
    await context.store.delete(SECRET_KEY);
  },
  async test(context) {
    const client = assinafyApi.forTrigger(context.auth);
    const deliveries = await client.list<{ payload?: unknown }>({
      method: HttpMethod.GET,
      path: await client.accountPath('/webhooks'),
      queryParams: { 'per-page': 50 },
    });
    const events = deliveries
      .map((delivery) => delivery.payload)
      .filter(assinafyValues.isRecord)
      .filter((payload) =>
        context.propsValue.events.includes(String(payload['event']))
      )
      .slice(0, 5)
      .map((payload) =>
        assinafyFormat.event({
          event: payload,
          document: isDocument(payload['object']) ? payload['object'] : null,
        })
      );
    return events.length > 0 ? events : [SAMPLE_EVENT];
  },
  async run(context) {
    const expected = await context.store.get<string>(TOKEN_KEY);
    if (
      !tokenMatches({
        expected,
        given: context.payload.queryParams?.[TOKEN_PARAM],
      })
    ) {
      return [];
    }
    const secret = await context.store.get<string>(SECRET_KEY);
    if (
      secret &&
      !signatureValid({
        secret,
        headers: context.payload.headers,
        rawBody: context.payload.rawBody,
      })
    ) {
      return [];
    }
    const body = context.payload.body;
    if (
      !assinafyValues.isRecord(body) ||
      !context.propsValue.events.includes(String(body['event']))
    ) {
      return [];
    }
    const dedupeKey =
      assinafyApi.headerValue({
        headers: context.payload.headers,
        name: 'webhook-id',
      }) ?? body['id'];
    const pushed = body['object'];
    if (!isDocument(pushed)) {
      return [
        withDedupeKey({
          key: dedupeKey,
          output: assinafyFormat.event({ event: body, document: null }),
        }),
      ];
    }
    const current = await assinafyApi
      .forTrigger(context.auth)
      .find<ApiDocument>({
        method: HttpMethod.GET,
        path: `/documents/${encodeURIComponent(pushed.id)}`,
      })
      .catch((error: unknown) => {
        if (
          error instanceof AssinafyApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          throw error;
        }
        return null;
      });
    return [
      withDedupeKey({
        key: dedupeKey,
        output: assinafyFormat.event({
          event: body,
          document: current ?? pushed,
        }),
      }),
    ];
  },
});

const TOKEN_KEY = 'webhook_token';
const TOKEN_PARAM = 'assinafy_token';
const SECRET_KEY = 'webhook_secret';
const ENDPOINT_NAME = 'Activepieces';
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

type ApiSubscription = {
  events?: string[];
  is_active?: boolean;
  url?: string | null;
  email?: string | null;
};

type ApiEndpoint = {
  id: string;
  name?: string | null;
  url?: string | null;
  email?: string | null;
  events?: string[];
  is_active?: boolean;
  signing_enabled?: boolean;
};
