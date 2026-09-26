import {
  createTrigger,
  DEDUPE_KEY_PROPERTY,
  TriggerStrategy,
  tryCatch,
} from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { AssinafyClient, assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { ApiDocument, assinafyFormat } from '../common/format';
import { assinafySample } from '../common/sample';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

function updatedAt(document: ApiDocument): number {
  return (
    Date.parse(assinafyValues.toIsoTimestamp(document.updated_at) ?? '') || 0
  );
}

async function completedAt({
  client,
  document,
}: {
  client: AssinafyClient;
  document: ApiDocument;
}): Promise<number | undefined> {
  const response = await client.find<unknown>({
    method: HttpMethod.GET,
    path: `/documents/${encodeURIComponent(document.id)}/activities`,
    queryParams: { 'per-page': assinafyConstants.pageSize },
  });
  const activities = Array.isArray(response)
    ? response.filter(assinafyValues.isRecord)
    : [];
  const latest = (event: string) =>
    Math.max(
      0,
      ...activities
        .filter((activity) => activity['event'] === event)
        .map((activity) => Date.parse(String(activity['created_at'])) || 0)
    );
  return (
    latest('document_ready') || latest('signer_signed_document') || undefined
  );
}

function initialState(now: number): SignedState {
  return { since: now, checkedUntil: now, drain: undefined, ledger: [] };
}

async function poll({
  client,
  state,
  now,
}: {
  client: AssinafyClient;
  state: SignedState;
  now: number;
}): Promise<{
  emitted: ApiDocument[];
  state: SignedState;
  error: Error | undefined;
}> {
  const drain = state.drain ?? {
    startedAt: now,
    page: 1,
    lastUpdatedAt: undefined,
    handledIds: [],
  };
  const windowStart = state.checkedUntil - LOOKBACK_MS;
  const threshold = Math.max(
    state.since,
    windowStart - COMPLETION_TOLERANCE_MS
  );
  const ledger = new Map(state.ledger);
  const emitted: ApiDocument[] = [];
  let { page, lastUpdatedAt } = drain;
  let handledIds = new Set(drain.handledIds);
  let finished = false;
  let checks = 0;
  let pagesRead = 0;
  let examined = 0;
  let previousPage: string | undefined;
  let stuck = state.stuck;

  const { error } = await tryCatch(async () => {
    const path = await client.accountPath('/documents');
    scan: while (!finished) {
      if (pagesRead === PAGES_PER_RUN || Date.now() - now >= TIME_BUDGET_MS) {
        break;
      }
      const { items, pageCount } = await client.listPage<ApiDocument>({
        method: HttpMethod.GET,
        path,
        queryParams: {
          status: 'certificated',
          sort: '-updated_at',
          page,
          'per-page': assinafyConstants.pageSize,
        },
      });
      pagesRead++;
      for (const document of items) {
        const updated = updatedAt(document);
        const alreadyScanned =
          lastUpdatedAt !== undefined &&
          (updated > lastUpdatedAt ||
            (updated === lastUpdatedAt && handledIds.has(document.id)));
        if (alreadyScanned) {
          continue;
        }
        if (updated < windowStart) {
          finished = true;
          break scan;
        }
        if (!ledger.has(document.id) && updated >= threshold) {
          if (checks === CHECKS_PER_RUN || Date.now() - now >= TIME_BUDGET_MS) {
            break scan;
          }
          checks++;
          const check = await tryCatch(() => completedAt({ client, document }));
          if (check.error) {
            const attempts = stuck?.id === document.id ? stuck.attempts + 1 : 1;
            if (attempts < MAX_CHECK_ATTEMPTS) {
              stuck = { id: document.id, attempts };
              throw check.error;
            }
          }
          if (stuck?.id === document.id) {
            stuck = undefined;
          }
          const completed = check.error ? updated : check.data;
          if (completed !== undefined && completed >= threshold) {
            emitted.push(document);
            ledger.set(document.id, completed);
          }
        }
        if (updated !== lastUpdatedAt) {
          lastUpdatedAt = updated;
          handledIds = new Set();
        }
        handledIds.add(document.id);
        examined++;
      }
      const pageIds = items.map((document) => document.id).join(',');
      const lastPage =
        pageCount === undefined
          ? items.length < assinafyConstants.pageSize
          : page >= pageCount;
      if (items.length === 0 || lastPage || pageIds === previousPage) {
        finished = true;
      } else {
        previousPage = pageIds;
        page++;
      }
    }
  });
  if (error && examined === 0) {
    return { emitted, state: { ...state, stuck }, error };
  }

  return {
    emitted,
    error: undefined,
    state: {
      since: state.since,
      stuck,
      checkedUntil: finished ? drain.startedAt : state.checkedUntil,
      drain: finished
        ? undefined
        : {
            startedAt: drain.startedAt,
            page,
            lastUpdatedAt,
            handledIds: [...handledIds],
          },
      ledger: [...ledger]
        .filter(([, completed]) => completed >= threshold)
        .sort((a, b) => b[1] - a[1])
        .slice(0, LEDGER_LIMIT),
    },
  };
}

const SAMPLE_DOCUMENT = assinafySample.document;

export const documentSigned = createTrigger({
  auth: assinafyAuth,
  name: 'document_signed',
  classification: 'READ',
  displayName: 'Document Signed',
  description:
    'Triggers when every signer has signed a document and the signed PDF is ready. Checked every few minutes.',
  aiMetadata: {
    description:
      'Fires once per Assinafy document whose signing completes after the flow is turned on, when every signer has signed and the signed PDF with its certificate can be downloaded. Checked every few minutes; each payload is one document. Several flows can use it at the same time.',
  },
  type: TriggerStrategy.POLLING,
  outputSchema: assinafyOutputSchemas.document,
  props: {},
  sampleData: SAMPLE_DOCUMENT,
  async onEnable(context) {
    if (
      context.isRepublish &&
      (await context.store.get<SignedState>(STATE_KEY))
    ) {
      return;
    }
    await context.store.put(STATE_KEY, initialState(Date.now()));
  },
  async onDisable() {
    return;
  },
  async test(context) {
    const client = assinafyApi.forTrigger(context.auth);
    const documents = await client.list<ApiDocument>({
      method: HttpMethod.GET,
      path: await client.accountPath('/documents'),
      queryParams: {
        status: 'certificated',
        sort: '-updated_at',
        'per-page': 5,
      },
    });
    return documents.slice(0, 5).map(assinafyFormat.document);
  },
  async run(context) {
    const now = Date.now();
    const state =
      (await context.store.get<SignedState>(STATE_KEY)) ?? initialState(now);
    const result = await poll({
      client: assinafyApi.forTrigger(context.auth),
      state,
      now,
    });
    await context.store.put(STATE_KEY, result.state);
    if (result.error) {
      throw result.error;
    }
    return result.emitted.map((document) => ({
      ...assinafyFormat.document(document),
      [DEDUPE_KEY_PROPERTY]: document.id,
    }));
  },
});

const STATE_KEY = 'document_signed_state';
const PAGES_PER_RUN = 10;
const CHECKS_PER_RUN = 40;
const TIME_BUDGET_MS = 30 * 1000;
const LOOKBACK_MS = 10 * 60 * 1000;
const COMPLETION_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const LEDGER_LIMIT = 5000;
const MAX_CHECK_ATTEMPTS = 3;

type SignedState = {
  since: number;
  checkedUntil: number;
  drain:
    | {
        startedAt: number;
        page: number;
        lastUpdatedAt: number | undefined;
        handledIds: string[];
      }
    | undefined;
  ledger: [string, number][];
  stuck?: { id: string; attempts: number };
};
