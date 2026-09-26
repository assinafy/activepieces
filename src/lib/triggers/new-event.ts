import {
  createTrigger,
  DEDUPE_KEY_PROPERTY,
  MarkdownVariant,
  Property,
  TriggerStrategy,
} from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
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

function withDedupeKey({
  event,
  output,
}: {
  event: Record<string, unknown>;
  output: Record<string, unknown>;
}) {
  return event['id'] === undefined || event['id'] === null
    ? output
    : { ...output, [DEDUPE_KEY_PROPERTY]: String(event['id']) };
}

const SETUP_NOTE = `Assinafy sends each workspace's events to **one** webhook address. Turning this flow on points that address at Activepieces, and turning it off stops delivery again.

- Use this trigger in only one active flow per Assinafy workspace; add a Router step to handle several event types.
- If the workspace already delivers events elsewhere, this flow will not start unless **Replace Existing Webhook** is on.
- Need several independent flows? Use the **Document Signed** trigger, which checks Assinafy every few minutes instead.`;

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
        'Allow this flow to take over a webhook address that currently delivers to another system.',
      required: false,
      defaultValue: false,
    }),
  },
  sampleData: SAMPLE_EVENT,
  async onEnable(context) {
    const client = assinafyApi.forTrigger(context.auth);
    const current = await readSubscription(client);
    const deliversElsewhere = Boolean(
      current?.is_active &&
        current.url &&
        !sameEndpoint({ url: current.url, webhookUrl: context.webhookUrl })
    );
    if (deliversElsewhere && !context.propsValue.replace_existing) {
      throw new Error(
        `This Assinafy workspace already sends its webhooks to ${hostOf(
          current?.url ?? ''
        )}. A workspace has only one webhook address, so turning this flow on would stop those deliveries. Turn on "Replace Existing Webhook" if that is intended.`
      );
    }
    const email =
      context.propsValue.notification_email?.trim() || current?.email;
    if (!email) {
      throw new Error(
        'Enter a Delivery Notice Email so Assinafy can tell you about delivery problems.'
      );
    }
    const token =
      (await context.store.get<string>(TOKEN_KEY)) ??
      randomBytes(24).toString('hex');
    const url = withToken({ webhookUrl: context.webhookUrl, token });
    await context.store.put(TOKEN_KEY, token);
    await client.request<ApiSubscription>({
      method: HttpMethod.PUT,
      path: await client.accountPath('/webhooks/subscriptions'),
      body: { events: context.propsValue.events, is_active: true, url, email },
    });
    const saved = await readSubscription(client);
    if (!saved?.is_active || saved.url !== url) {
      throw new Error(
        'Another system changed the Assinafy webhook at the same time. Check which system should receive the events, then turn this flow on again.'
      );
    }
  },
  async onDisable(context) {
    const client = assinafyApi.forTrigger(context.auth);
    const current = await readSubscription(client);
    if (
      current?.is_active &&
      sameEndpoint({ url: current.url, webhookUrl: context.webhookUrl })
    ) {
      await client.request<ApiSubscription>({
        method: HttpMethod.PUT,
        path: await client.accountPath('/webhooks/inactivate'),
      });
    }
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
    const body = context.payload.body;
    if (
      !assinafyValues.isRecord(body) ||
      !context.propsValue.events.includes(String(body['event']))
    ) {
      return [];
    }
    const pushed = body['object'];
    if (!isDocument(pushed)) {
      return [
        withDedupeKey({
          event: body,
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
        event: body,
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

type ApiSubscription = {
  events?: string[];
  is_active?: boolean;
  url?: string | null;
  email?: string | null;
};
