import { DEDUPE_KEY_PROPERTY } from '@activepieces/pieces-framework';
import { documentSigned } from '../src/lib/triggers/document-signed';
import { assinafyFormat } from '../src/lib/common/format';
import { HttpError } from '@activepieces/pieces-common';
import {
  PRODUCTION,
  apiDocument,
  context,
  memoryStore,
  replyData,
  replyError,
  sendRequest,
  sentRequests,
  signedDocument,
} from './helpers';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse('2026-09-01T12:00:00Z');
const iso = (time: number) => new Date(time).toISOString();

type FakeDocument = { id: string; updatedAt: number; completedAt?: number };

function fakeAssinafy({
  documents,
  pageCountHeader = true,
  onActivities,
  onPage,
}: {
  documents: FakeDocument[];
  pageCountHeader?: boolean;
  onActivities?: (id: string) => void;
  onPage?: () => void;
}) {
  sendRequest.mockImplementation(
    async (request: { url: string; queryParams?: Record<string, string> }) => {
      const url = new URL(request.url);
      const activitiesMatch = /\/documents\/([^/]+)\/activities$/.exec(
        url.pathname
      );
      if (activitiesMatch) {
        const id = decodeURIComponent(activitiesMatch[1]);
        onActivities?.(id);
        const document = documents.find((candidate) => candidate.id === id);
        const data = [
          ...(document?.completedAt
            ? [
                {
                  event: 'document_ready',
                  created_at: iso(document.completedAt),
                },
              ]
            : []),
          { event: 'document_uploaded', created_at: iso(T0 - 600 * MINUTE) },
        ];
        return {
          status: 200,
          headers: {},
          body: { status: 200, message: '', data },
        };
      }
      onPage?.();
      const sorted = [...documents].sort((a, b) => b.updatedAt - a.updatedAt);
      const perPage = Number(request.queryParams?.['per-page']);
      const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
      const page = Math.min(
        Number(request.queryParams?.['page'] ?? 1),
        pageCount
      );
      const data = sorted
        .slice((page - 1) * perPage, page * perPage)
        .map((document) => ({
          ...signedDocument,
          id: document.id,
          updated_at: iso(document.updatedAt),
        }));
      const headers = pageCountHeader
        ? { 'x-pagination-page-count': String(pageCount) }
        : {};
      return { status: 200, headers, body: { status: 200, message: '', data } };
    }
  );
}

function signedAfterEnable({
  count,
  prefix = 'doc',
  start = T0 + 1 * MINUTE,
}: {
  count: number;
  prefix?: string;
  start?: number;
}): FakeDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_${index}`,
    completedAt: start + index * 1000,
    updatedAt: start + index * 1000 + 5000,
  }));
}

function stateStore(state: Record<string, unknown>) {
  return memoryStore({
    document_signed_state: {
      since: T0,
      checkedUntil: T0,
      drain: undefined,
      ledger: [],
      ...state,
    },
  });
}

const enabledAt = (time: number) =>
  stateStore({ since: time, checkedUntil: time });
const savedState = (store: ReturnType<typeof memoryStore>) =>
  store.values.get('document_signed_state');

async function poll({
  store,
  now,
}: {
  store: ReturnType<typeof memoryStore>;
  now: number;
}) {
  vi.setSystemTime(now);
  const emitted = (await documentSigned.run(
    context({ props: {}, extra: { store } })
  )) as { id: string }[];
  return emitted.map((document) => document.id);
}

async function drainAll({
  store,
  from,
}: {
  store: ReturnType<typeof memoryStore>;
  from: number;
}) {
  const emitted: string[] = [];
  for (let check = 0; check < 30; check++) {
    emitted.push(...(await poll({ store, now: from + check * 5 * MINUTE })));
    if ((savedState(store) as { drain?: unknown }).drain === undefined) {
      return { emitted, checks: check + 1 };
    }
  }
  throw new Error('The drain did not finish.');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Document Signed: enabling', () => {
  test('starts from now, keeps its state on republish and leaves it on disable', async () => {
    const store = memoryStore();
    vi.setSystemTime(T0);
    await documentSigned.onEnable(context({ props: {}, extra: { store } }));
    expect(savedState(store)).toEqual({
      since: T0,
      checkedUntil: T0,
      drain: undefined,
      ledger: [],
    });

    const running = {
      since: 1,
      checkedUntil: 2,
      drain: undefined,
      ledger: [['doc_1', 3]],
    };
    store.values.set('document_signed_state', running);
    await documentSigned.onEnable(
      context({ props: {}, extra: { store, isRepublish: true } })
    );
    expect(savedState(store)).toEqual(running);

    await documentSigned.onDisable(context({ props: {}, extra: { store } }));
    expect(savedState(store)).toEqual(running);

    vi.setSystemTime(T0 + MINUTE);
    await documentSigned.onEnable(context({ props: {}, extra: { store } }));
    expect(savedState(store)).toMatchObject({ since: T0 + MINUTE, ledger: [] });
  });
});

describe('Document Signed: polling', () => {
  test('emits a document signed after enabling once, with a dedupe key and the document fields', async () => {
    const documents = signedAfterEnable({ count: 1 });
    fakeAssinafy({ documents });
    const store = enabledAt(T0);
    vi.setSystemTime(T0 + 5 * MINUTE);
    const output = (await documentSigned.run(
      context({ props: {}, extra: { store } })
    )) as Record<string, unknown>[];
    expect(output).toEqual([
      {
        ...assinafyFormat.document({
          ...signedDocument,
          id: 'doc_0',
          updated_at: iso(documents[0].updatedAt),
        }),
        [DEDUPE_KEY_PROPERTY]: 'doc_0',
      },
    ]);
    expect(sentRequests()[0].queryParams).toEqual({
      status: 'certificated',
      sort: '-updated_at',
      page: '1',
      'per-page': '50',
    });
    expect(sentRequests()[1]).toMatchObject({
      url: `${PRODUCTION}/documents/doc_0/activities`,
      queryParams: { 'per-page': '50' },
    });
    await expect(poll({ store, now: T0 + 10 * MINUTE })).resolves.toEqual([]);
  });

  test('ignores documents signed before enabling, even when they are edited later', async () => {
    const documents: FakeDocument[] = [
      {
        id: 'old_edited',
        completedAt: T0 - 24 * 60 * MINUTE,
        updatedAt: T0 + 2 * MINUTE,
      },
      {
        id: 'old_certified_late',
        completedAt: T0 - MINUTE,
        updatedAt: T0 + MINUTE,
      },
      {
        id: 'before_enable',
        completedAt: T0 - 30 * MINUTE,
        updatedAt: T0 - 20 * MINUTE,
      },
    ];
    fakeAssinafy({ documents });
    await expect(
      poll({ store: enabledAt(T0), now: T0 + 5 * MINUTE })
    ).resolves.toEqual([]);
    expect(
      sentRequests().filter((request) => request.url.endsWith('/activities'))
    ).toHaveLength(2);
  });

  test('does not repeat a document edited soon after signing', async () => {
    const documents = signedAfterEnable({ count: 1 });
    fakeAssinafy({ documents });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 5 * MINUTE })).resolves.toEqual([
      'doc_0',
    ]);
    documents[0].updatedAt = T0 + 20 * MINUTE;
    await expect(poll({ store, now: T0 + 25 * MINUTE })).resolves.toEqual([]);
  });

  test('does not repeat a document edited long after its ledger entry expired', async () => {
    const documents = signedAfterEnable({ count: 1 });
    fakeAssinafy({ documents });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 5 * MINUTE })).resolves.toEqual([
      'doc_0',
    ]);
    await poll({ store, now: T0 + 30 * HOUR });
    await poll({ store, now: T0 + 30 * HOUR + 5 * MINUTE });
    expect(savedState(store)).toMatchObject({ ledger: [] });
    documents[0].updatedAt = T0 + 30 * HOUR + 6 * MINUTE;
    await expect(
      poll({ store, now: T0 + 30 * HOUR + 10 * MINUTE })
    ).resolves.toEqual([]);
  });

  test('uses signer activity when there is no completion event, and skips a document without either', async () => {
    sendRequest.mockImplementation(async (request: { url: string }) => {
      const body = request.url.endsWith('/doc_a/activities')
        ? [
            {
              event: 'signer_signed_document',
              created_at: iso(T0 + 2 * MINUTE),
            },
          ]
        : request.url.endsWith('/activities')
        ? []
        : [
            {
              ...signedDocument,
              id: 'doc_a',
              updated_at: iso(T0 + 3 * MINUTE),
            },
            {
              ...signedDocument,
              id: 'doc_b',
              updated_at: iso(T0 + 2 * MINUTE),
            },
          ];
      return {
        status: 200,
        headers: {},
        body: { status: 200, message: '', data: body },
      };
    });
    await expect(
      poll({ store: enabledAt(T0), now: T0 + 5 * MINUTE })
    ).resolves.toEqual(['doc_a']);
  });

  test('looks back ten minutes before the last check', async () => {
    const documents: FakeDocument[] = [
      {
        id: 'inside',
        completedAt: T0 + 50 * MINUTE,
        updatedAt: T0 + 55 * MINUTE,
      },
      {
        id: 'outside',
        completedAt: T0 + 40 * MINUTE,
        updatedAt: T0 + 49 * MINUTE,
      },
    ];
    fakeAssinafy({ documents });
    await expect(
      poll({
        store: stateStore({ checkedUntil: T0 + 60 * MINUTE }),
        now: T0 + 65 * MINUTE,
      })
    ).resolves.toEqual(['inside']);
  });

  test('accepts a document that reaches the signed list up to a day after its last signature', async () => {
    const lastCheck = T0 + 60 * HOUR;
    const documents: FakeDocument[] = [
      {
        id: 'late_certified',
        completedAt: lastCheck - 10 * MINUTE - 23 * HOUR,
        updatedAt: lastCheck + MINUTE,
      },
      {
        id: 'edited_old',
        completedAt: lastCheck - 10 * MINUTE - 25 * HOUR,
        updatedAt: lastCheck + 2 * MINUTE,
      },
    ];
    fakeAssinafy({ documents });
    await expect(
      poll({
        store: stateStore({ checkedUntil: lastCheck }),
        now: lastCheck + 5 * MINUTE,
      })
    ).resolves.toEqual(['late_certified']);
  });

  test('catches up on every signing after a long outage', async () => {
    fakeAssinafy({
      documents: signedAfterEnable({ count: 3, start: T0 + HOUR }),
    });
    await expect(
      poll({ store: enabledAt(T0), now: T0 + 72 * HOUR })
    ).resolves.toEqual(['doc_2', 'doc_1', 'doc_0']);
  });

  test('works on a first run without saved state', async () => {
    fakeAssinafy({ documents: [] });
    await expect(poll({ store: memoryStore(), now: T0 })).resolves.toEqual([]);
  });

  test('reads with the short trigger timeout and treats an empty activity log as no completion', async () => {
    sendRequest.mockImplementation(async (request: { url: string }) => ({
      status: 200,
      headers: {},
      body: {
        status: 200,
        message: '',
        data: request.url.endsWith('/activities')
          ? null
          : [{ ...signedDocument, id: 'doc_a', updated_at: iso(T0 + MINUTE) }],
      },
    }));
    await expect(
      poll({ store: enabledAt(T0), now: T0 + 5 * MINUTE })
    ).resolves.toEqual([]);
    expect(sentRequests().every((sent) => sent.timeout === 15000)).toBe(true);
  });

  test('retries a document whose activity log keeps failing, then treats it as signed at its update time', async () => {
    fakeAssinafy({
      documents: signedAfterEnable({ count: 3 }),
      onActivities: (id) => {
        if (id === 'doc_2') {
          throw new HttpError(undefined, {
            status: 500,
            responseBody: { message: 'Server error' },
          });
        }
      },
    });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 5 * MINUTE })).rejects.toThrow(
      'HTTP 500'
    );
    expect(savedState(store)).toMatchObject({
      stuck: { id: 'doc_2', attempts: 1 },
    });
    await expect(poll({ store, now: T0 + 10 * MINUTE })).rejects.toThrow(
      'HTTP 500'
    );
    await expect(poll({ store, now: T0 + 15 * MINUTE })).resolves.toEqual([
      'doc_2',
      'doc_1',
      'doc_0',
    ]);
    expect(savedState(store)).toMatchObject({
      stuck: undefined,
      drain: undefined,
    });
  });

  test('handles documents that share the same update time', async () => {
    const tied = Array.from({ length: 45 }, (_, index) => ({
      id: `tied_${String(index).padStart(2, '0')}`,
      completedAt: T0 + MINUTE,
      updatedAt: T0 + 2 * MINUTE,
    }));
    fakeAssinafy({ documents: tied });
    const store = enabledAt(T0);
    const first = await poll({ store, now: T0 + 5 * MINUTE });
    const second = await poll({ store, now: T0 + 10 * MINUTE });
    expect([first.length, second.length]).toEqual([40, 5]);
    expect(new Set([...first, ...second]).size).toBe(45);
  });

  test('fails on an error before any document was read, keeping the saved state', async () => {
    replyError({
      status: 401,
      body: { status: 401, message: 'Invalid credentials', data: null },
    });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 5 * MINUTE })).rejects.toThrow(
      'HTTP 401'
    );
    expect(savedState(store)).toEqual({
      since: T0,
      checkedUntil: T0,
      drain: undefined,
      ledger: [],
    });
  });

  test('keeps what it found when an error happens halfway, and resumes from there', async () => {
    const failed = new Set<string>();
    fakeAssinafy({
      documents: signedAfterEnable({ count: 5 }),
      onActivities: (id) => {
        if (id === 'doc_2' && !failed.has(id)) {
          failed.add(id);
          throw new HttpError(undefined, {
            status: 500,
            responseBody: { message: 'Server error' },
          });
        }
      },
    });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 10 * MINUTE })).resolves.toEqual([
      'doc_4',
      'doc_3',
    ]);
    expect(savedState(store)).toMatchObject({
      checkedUntil: T0,
      drain: { page: 1 },
    });
    await expect(poll({ store, now: T0 + 15 * MINUTE })).resolves.toEqual([
      'doc_2',
      'doc_1',
      'doc_0',
    ]);
    expect(savedState(store)).toMatchObject({
      checkedUntil: T0 + 10 * MINUTE,
      drain: undefined,
    });
  });
});

describe('Document Signed: backlog', () => {
  test('drains more than one check can handle, emitting each document exactly once', async () => {
    fakeAssinafy({ documents: signedAfterEnable({ count: 501 }) });
    const store = enabledAt(T0);
    const { emitted, checks } = await drainAll({
      store,
      from: T0 + 600 * MINUTE,
    });
    expect(emitted).toHaveLength(501);
    expect(new Set(emitted).size).toBe(501);
    expect(checks).toBe(13);
  });

  test('keeps its checkpoint until the drain finishes', async () => {
    fakeAssinafy({ documents: signedAfterEnable({ count: 250 }) });
    const store = enabledAt(T0);
    await poll({ store, now: T0 + 600 * MINUTE });
    expect(savedState(store)).toMatchObject({
      checkedUntil: T0,
      drain: { startedAt: T0 + 600 * MINUTE, page: 1, handledIds: ['doc_210'] },
    });
    await drainAll({ store, from: T0 + 605 * MINUTE });
    expect(savedState(store)).toMatchObject({
      checkedUntil: T0 + 600 * MINUTE,
      drain: undefined,
    });
  });

  test('resumes after new documents push the backlog down the list, without skips or repeats', async () => {
    const documents = signedAfterEnable({ count: 250 });
    fakeAssinafy({ documents });
    const store = enabledAt(T0);
    const emitted = await poll({ store, now: T0 + 600 * MINUTE });
    documents.push(
      ...signedAfterEnable({
        count: 70,
        prefix: 'new',
        start: T0 + 601 * MINUTE,
      })
    );
    emitted.push(
      ...(await drainAll({ store, from: T0 + 605 * MINUTE })).emitted
    );
    expect(emitted.filter((id) => id.startsWith('doc_'))).toHaveLength(250);
    emitted.push(
      ...(await drainAll({ store, from: T0 + 800 * MINUTE })).emitted
    );
    expect(emitted.filter((id) => id.startsWith('new_'))).toHaveLength(70);
    expect(new Set(emitted).size).toBe(320);
  });

  test('reads at most ten pages per check', async () => {
    fakeAssinafy({
      documents: Array.from({ length: 1500 }, (_, index) => ({
        id: `old_${index}`,
        updatedAt: T0 + 60 * MINUTE - index,
      })),
    });
    const store = stateStore({ since: T0 + 61 * MINUTE });
    await poll({ store, now: T0 + 600 * MINUTE });
    expect(sentRequests()).toHaveLength(10);
    expect(savedState(store)).toMatchObject({ drain: { page: 11 } });
    await expect(
      drainAll({ store, from: T0 + 605 * MINUTE })
    ).resolves.toMatchObject({ checks: 2 });
  });

  test('ends at the last page, with or without the page count header', async () => {
    const old = Array.from({ length: 100 }, (_, index) => ({
      id: `old_${index}`,
      updatedAt: T0 + 60 * MINUTE - index,
    }));
    fakeAssinafy({ documents: old });
    await poll({
      store: stateStore({ since: T0 + 61 * MINUTE }),
      now: T0 + 600 * MINUTE,
    });
    expect(sentRequests()).toHaveLength(2);

    sendRequest.mockReset();
    fakeAssinafy({ documents: old, pageCountHeader: false });
    const store = stateStore({ since: T0 + 61 * MINUTE });
    await poll({ store, now: T0 + 600 * MINUTE });
    expect(sentRequests().map((sent) => sent.queryParams?.['page'])).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(savedState(store)).toMatchObject({
      drain: undefined,
      checkedUntil: T0 + 600 * MINUTE,
    });
  });

  test('finishes when every document left was already handled', async () => {
    fakeAssinafy({ documents: signedAfterEnable({ count: 3 }) });
    const store = stateStore({
      drain: {
        startedAt: T0 + 600 * MINUTE,
        page: 2,
        lastUpdatedAt: T0,
        handledIds: ['gone'],
      },
    });
    await expect(poll({ store, now: T0 + 605 * MINUTE })).resolves.toEqual([]);
    expect(savedState(store)).toMatchObject({
      drain: undefined,
      checkedUntil: T0 + 600 * MINUTE,
    });
  });

  test('stops within its time budget and continues on the next check', async () => {
    fakeAssinafy({
      documents: signedAfterEnable({ count: 5 }),
      onActivities: () => vi.setSystemTime(Date.now() + 10 * 1000),
    });
    const store = enabledAt(T0);
    await expect(poll({ store, now: T0 + 10 * MINUTE })).resolves.toHaveLength(
      3
    );
    await expect(poll({ store, now: T0 + 15 * MINUTE })).resolves.toHaveLength(
      2
    );
  });

  test('stops reading pages when the time budget runs out', async () => {
    fakeAssinafy({
      documents: Array.from({ length: 1500 }, (_, index) => ({
        id: `old_${index}`,
        updatedAt: T0 + 60 * MINUTE - index,
      })),
      onPage: () => vi.setSystemTime(Date.now() + 16 * 1000),
    });
    const store = stateStore({ since: T0 + 61 * MINUTE });
    await poll({ store, now: T0 + 600 * MINUTE });
    expect(sentRequests()).toHaveLength(2);
    expect(savedState(store)).toMatchObject({ drain: { page: 3 } });
  });

  test('forgets completions older than it can see again and caps the ledger size', async () => {
    fakeAssinafy({ documents: [] });
    const pruned = stateStore({
      checkedUntil: T0 + 48 * HOUR,
      ledger: [
        ['recent', T0 + 47 * HOUR],
        ['old', T0 + MINUTE],
      ],
    });
    await poll({ store: pruned, now: T0 + 48 * HOUR + 5 * MINUTE });
    expect(savedState(pruned)).toMatchObject({
      ledger: [['recent', T0 + 47 * HOUR]],
    });

    const ledger = Array.from(
      { length: 6000 },
      (_, index): [string, number] => [
        `seen_${index}`,
        T0 + 10 * MINUTE + index,
      ]
    );
    const capped = stateStore({ checkedUntil: T0 + 20 * MINUTE, ledger });
    await poll({ store: capped, now: T0 + 20 * MINUTE });
    const kept = (savedState(capped) as { ledger: [string, number][] }).ledger;
    expect(kept).toHaveLength(5000);
    expect(kept[0][0]).toBe('seen_5999');
  });
});

describe('Document Signed: sample data', () => {
  test('returns recent signed documents without touching the store', async () => {
    replyData(
      Array.from({ length: 7 }, (_, index) => ({
        ...apiDocument,
        id: `doc_${index}`,
        status: 'certificated',
      }))
    );
    const store = memoryStore();
    const result = await documentSigned.test?.(
      context({ props: {}, extra: { store } })
    );
    expect(result).toHaveLength(5);
    expect(sentRequests()[0].queryParams).toEqual({
      status: 'certificated',
      sort: '-updated_at',
      'per-page': '5',
    });
    expect(store.values.size).toBe(0);
  });
});
