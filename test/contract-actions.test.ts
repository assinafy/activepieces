import { HttpMethod } from '@activepieces/pieces-common';
import { findContracts } from '../src/lib/actions/find-contracts';
import { getContract } from '../src/lib/actions/get-contract';
import { getRelatedContracts } from '../src/lib/actions/get-related-contracts';
import { setContractTerms } from '../src/lib/actions/set-contract-terms';
import { renewContract } from '../src/lib/actions/renew-contract';
import { terminateContract } from '../src/lib/actions/terminate-contract';
import {
  PRODUCTION,
  apiKeyAuth,
  oauthAuth,
  context,
  replyData,
  replyError,
  replyPage,
  sendRequest,
  sentRequests,
} from './helpers';

const updatedAt = '2026-10-23T12:00:00.250Z';
const amendment = {
  resource: 'document_contract_amendment',
  document_id: 'doc_amendment',
  document_name: 'Amendment.pdf',
  parent_document_id: 'doc_1',
  relation_type: 'amendment',
  number: null,
  status: 'pending',
  document_status: 'pending_signature',
  apply_error: null,
  currency: 'BRL',
  terms: { value: 0, auto_renew: false, metadata: { crm_stage: 'won' } },
  changes: { value: { from: 1250.5, to: 0 } },
  applied_at: null,
  created_at: updatedAt,
  updated_at: updatedAt,
};
const contract = {
  resource: 'document_contract',
  document_id: 'doc_1',
  status: 'active',
  counterparty_name: 'Example Ltda',
  counterparty_taxpayer_id: '11222333000181',
  value: 1250.5,
  currency: 'BRL',
  start_date: '2026-11-01',
  end_date: '2027-10-31',
  auto_renew: false,
  renewal_term_months: 12,
  notice_period_days: 0,
  term: 1,
  owner_id: 'user_1',
  metadata: { crm_stage: 'won' },
  external_references: [{ system: 'crm', id: 'deal_1' }],
  amendments: [amendment],
  created_at: updatedAt,
  updated_at: updatedAt,
};
const cases = [
  { action: getContract, props: {}, method: HttpMethod.GET, suffix: '' },
  {
    action: getRelatedContracts,
    props: {},
    method: HttpMethod.GET,
    suffix: '/related',
  },
  {
    action: setContractTerms,
    props: { terms: { value: 0, auto_renew: false, updated_at: updatedAt } },
    method: HttpMethod.PUT,
    suffix: '',
    body: { value: 0, auto_renew: false, updated_at: updatedAt },
  },
  {
    action: renewContract,
    props: { renewal: { term: 1, value: null, updated_at: updatedAt } },
    method: HttpMethod.POST,
    suffix: '/renew',
    body: { term: 1, value: null, updated_at: updatedAt },
  },
  {
    action: terminateContract,
    props: { reason: 'Agreement ended', updated_at: updatedAt },
    method: HttpMethod.POST,
    suffix: '/terminate',
    body: { reason: 'Agreement ended', updated_at: updatedAt },
  },
];

describe.each([
  ['API key', apiKeyAuth],
  ['OAuth', oauthAuth],
] as const)('contract actions with %s', (_, auth) => {
  for (const { action, props, method, suffix, body } of cases) {
    test(`${action.displayName} uses its workspace-scoped endpoint and retains nested outputs`, async () => {
      if (auth === oauthAuth) replyData([{ id: 'acc_1' }]);
      replyData(contract);
      await expect(
        action.run(
          context({
            props: { document: ' doc/1 ', ...props },
            extra: { auth },
          })
        )
      ).resolves.toEqual(contract);
      expect(sentRequests().at(-1)).toMatchObject({
        method,
        url: `${PRODUCTION}/accounts/acc_1/documents/doc%2F1/contract${suffix}`,
        body,
        headers:
          auth === oauthAuth
            ? { Authorization: 'Bearer test-access-token' }
            : { 'X-Api-Key': 'test-api-key' },
        followRedirects: false,
      });
      expect(sentRequests()).toHaveLength(auth === oauthAuth ? 2 : 1);
    });
  }

  test('Find Contracts encodes combined filters and retains expanded documents', async () => {
    if (auth === oauthAuth) replyData([{ id: 'acc_1' }]);
    const expanded = {
      ...contract,
      document: { id: 'doc_1', assignment: { signers: [] }, tags: [] },
    };
    replyData([expanded]);
    await expect(
      findContracts.run(
        context({
          props: {
            search: 'Service',
            status: ['active', 'expired'],
            counterparty: 'Example',
            end_date_from: '2027-01-01',
            end_date_to: '2027-12-31',
            ending_within_days: 0,
            external_system: 'crm',
            external_id: 'deal_1',
            sort: 'end_date',
            expand_document: true,
            limit: 1,
          },
          extra: { auth },
        })
      )
    ).resolves.toEqual([expanded]);
    expect(sentRequests().at(-1)).toMatchObject({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/accounts/acc_1/contracts`,
      queryParams: {
        search: 'Service',
        status: 'active,expired',
        counterparty: 'Example',
        end_date_from: '2027-01-01',
        end_date_to: '2027-12-31',
        ending_within_days: '0',
        external_system: 'crm',
        external_id: 'deal_1',
        sort: 'end_date',
        expand: 'document',
        page: '1',
        'per-page': '50',
      },
    });
  });
});

describe('contract input validation', () => {
  test.each(cases)(
    '$action.displayName validates document IDs before resolving OAuth',
    async ({ action, props }) => {
      await expect(
        action.run(
          context({
            props: { document: ' ', ...props },
            extra: { auth: oauthAuth },
          })
        )
      ).rejects.toThrow('Document ID is required');
      expect(sendRequest).not.toHaveBeenCalled();
    }
  );

  test.each([
    ['missing body', undefined],
    ['null body', null],
    ['array body', []],
    ['text body', '{"value":1}'],
    ['empty body', {}],
    ['unknown term', { term: 1 }],
    ['unknown status', { status: 'pending' }],
    ['null status', { status: null }],
    ['HTML name', { counterparty_name: '<b>Example</b>' }],
    ['long name', { counterparty_name: 'x'.repeat(256) }],
    ['bad taxpayer ID', { counterparty_taxpayer_id: '123' }],
    ['long taxpayer ID', { counterparty_taxpayer_id: '1'.repeat(21) }],
    ['negative value', { value: -1 }],
    ['large value', { value: 1e13 }],
    ['fractional cents', { value: 1.001 }],
    ['NaN', { value: NaN }],
    ['infinite value', { value: Infinity }],
    ['string value', { value: '1.00' }],
    ['currency length', { currency: 'BRAZIL' }],
    ['numeric currency', { currency: '123' }],
    ['impossible date', { start_date: '2027-02-29' }],
    ['before year 1000', { start_date: '0999-12-31' }],
    ['datetime instead of date', { end_date: '2027-01-01T00:00:00Z' }],
    ['end before start', { start_date: '2027-01-02', end_date: '2027-01-01' }],
    ['string boolean', { auto_renew: 'false' }],
    ['zero renewal months', { renewal_term_months: 0 }],
    ['long renewal months', { renewal_term_months: 601 }],
    ['fractional renewal months', { renewal_term_months: 1.5 }],
    ['negative notice days', { notice_period_days: -1 }],
    ['long notice days', { notice_period_days: 3651 }],
    ['empty owner', { owner_id: ' ' }],
    ['metadata list', { metadata: ['text'] }],
    ['metadata list keys', { metadata: { 0: 'one', 1: 'two' } }],
    [
      'long metadata',
      {
        metadata: Object.fromEntries(
          Array.from({ length: 51 }, (_, i) => [`key${i}`, 'x'])
        ),
      },
    ],
    ['invalid metadata key', { metadata: { 'invalid key': 'text' } }],
    ['long metadata key', { metadata: { ['x'.repeat(41)]: 'text' } }],
    ['long metadata value', { metadata: { key: 'x'.repeat(501) } }],
    ['numeric metadata', { metadata: { imported_at: 123 } }],
    ['HTML metadata', { metadata: { key: '<b>text</b>' } }],
    ['nested metadata', { metadata: { key: { nested: 'text' } } }],
    ['references object', { external_references: {} }],
    [
      'too many references',
      {
        external_references: Array.from({ length: 21 }, (_, i) => ({
          system: 'crm',
          id: String(i),
        })),
      },
    ],
    ['reference missing ID', { external_references: [{ system: 'crm' }] }],
    ['reference missing system', { external_references: [{ id: 'deal_1' }] }],
    [
      'reference empty ID',
      { external_references: [{ system: 'crm', id: ' ' }] },
    ],
    [
      'reference long ID',
      { external_references: [{ system: 'crm', id: 'x'.repeat(256) }] },
    ],
    [
      'reference emoji',
      { external_references: [{ system: 'crm', id: 'deal_😀' }] },
    ],
    [
      'reference bad system',
      { external_references: [{ system: 'bad system', id: 'deal_1' }] },
    ],
    [
      'reference long system',
      { external_references: [{ system: 'x'.repeat(65), id: 'deal_1' }] },
    ],
    [
      'reference unknown key',
      {
        external_references: [
          { system: 'crm', id: 'deal_1', url: 'https://example.com' },
        ],
      },
    ],
    ['empty parent', { parent_document_id: '' }],
    ['unknown relation', { relation_type: 'replacement' }],
    ['invalid precondition', { updated_at: '2026-10-23' }],
  ])('rejects %s before any HTTP request', async (_, terms) => {
    await expect(
      setContractTerms.run(
        context({
          props: { document: 'doc_1', terms },
          extra: { auth: oauthAuth },
        })
      )
    ).rejects.toThrow('Invalid contract input');
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test.each<Record<string, unknown>>([
    {
      counterparty_name: null,
      counterparty_taxpayer_id: null,
      value: null,
      currency: null,
      start_date: null,
      end_date: null,
      auto_renew: null,
      renewal_term_months: null,
      notice_period_days: null,
      owner_id: null,
      metadata: null,
      external_references: null,
      updated_at: null,
    },
    {
      value: 0,
      auto_renew: false,
      notice_period_days: 0,
      metadata: {},
      external_references: [],
    },
    {
      value: 9999999999999.99,
      currency: 'usd',
      renewal_term_months: 600,
      notice_period_days: 3650,
      start_date: '1000-01-01',
      end_date: '9999-12-31',
    },
    {
      counterparty_name: 'Example 😀',
      counterparty_taxpayer_id: '12.ABC.345/01DE-35',
      owner_id: 'user_1',
      start_date: '2028-02-29',
      end_date: '2028-02-29',
      auto_renew: true,
      updated_at: '2026-10-23T09:00:00.250-03:00',
    },
    {
      metadata: {
        crm_stage: 'won',
        'crm.id': 'deal_1',
        'cost-center': 'Sales',
        constructor: 'literal',
        '1': 'a named numeric key',
      },
    },
    { metadata: JSON.parse('{"__proto__":"literal","safe":"value"}') },
    {
      external_references: [
        { system: 'CRM', id: ' deal_1 ' },
        { system: 'erp', id: 'café' },
      ],
    },
    {
      parent_document_id: 'doc_parent',
      relation_type: 'amendment',
      value: 0,
      metadata: { crm_stage: 'won' },
    },
    {
      parent_document_id: 'doc_parent',
      relation_type: 'renewal',
      end_date: '2028-12-31',
      value: null,
    },
    {
      parent_document_id: 'doc_parent',
      relation_type: 'termination',
      end_date: '2028-12-31',
    },
    { parent_document_id: null },
  ])(
    'preserves valid terms and explicit clearing values (%j)',
    async (terms) => {
      replyData(amendment);
      await expect(
        setContractTerms.run(context({ props: { document: 'doc_1', terms } }))
      ).resolves.toEqual(amendment);
      expect(sentRequests()[0].body).toEqual(terms);
    }
  );

  test.each([
    {},
    { value: 1 },
    { end_date: null },
    { term: 0 },
    { term: 1.5 },
    { term: '1' },
    { term: 1, unknown: true },
    { term: 1, value: -1 },
    { term: 1, end_date: '2026-02-30' },
    { term: 1, updated_at: 'yesterday' },
  ])('rejects unsafe or invalid renewal input (%j)', async (renewal) => {
    await expect(
      renewContract.run(context({ props: { document: 'doc_1', renewal } }))
    ).rejects.toThrow('Invalid contract input');
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test.each([
    { term: 1 },
    { term: 1, end_date: null, value: null },
    { term: 1, end_date: '', value: 0 },
    { end_date: '2028-02-29', value: 0, updated_at: updatedAt },
  ])('preserves a safe explicit renewal (%j)', async (renewal) => {
    replyData({ ...contract, term: 2 });
    await renewContract.run(context({ props: { document: 'doc_1', renewal } }));
    expect(sentRequests()[0].body).toEqual(renewal);
  });

  test.each([
    { reason: 'x'.repeat(501) },
    { reason: 1 },
    { reason: [] },
    { updated_at: [] },
    { updated_at: 'not a timestamp' },
  ])('rejects invalid termination (%j)', async (props) => {
    await expect(
      terminateContract.run(context({ props: { document: 'doc_1', ...props } }))
    ).rejects.toThrow('Invalid contract input');
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test('termination accepts no reason and leaves HTML handling to the API', async () => {
    replyData({ ...contract, status: 'terminated' });
    await terminateContract.run(context({ props: { document: 'doc_1' } }));
    expect(sentRequests()[0].body).toEqual({});
    replyData({ ...contract, status: 'terminated' });
    await terminateContract.run(
      context({ props: { document: 'doc_1', reason: '<b>Completed</b>' } })
    );
    expect(sentRequests()[1].body).toEqual({ reason: '<b>Completed</b>' });
  });
});

describe('contract listing and conflicts', () => {
  test('defaults filters, omits empty values, and returns an empty list', async () => {
    replyData([]);
    await expect(
      findContracts.run(
        context({ props: { search: '', status: [], expand_document: false } })
      )
    ).resolves.toEqual([]);
    expect(sentRequests()[0].queryParams).toEqual({
      sort: '-updated_at',
      page: '1',
      'per-page': '50',
    });
  });

  test('pages by header and deduplicates contracts by document_id', async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({
      ...contract,
      document_id: `doc_${index}`,
    }));
    replyPage({ data: first, pageCount: 2 });
    replyPage({
      data: [first[49], { ...contract, document_id: 'doc_50' }],
      pageCount: 2,
    });
    const result = await findContracts.run(
      context({ props: { limit: 100, sort: '-end_date' } })
    );
    expect(result).toHaveLength(51);
    expect(
      sentRequests().map((request) => request.queryParams?.['page'])
    ).toEqual(['1', '2']);
  });

  test('stops if the API repeats a page', async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({
      ...contract,
      document_id: `doc_${index}`,
    }));
    replyPage({ data: first, pageCount: 4 });
    replyPage({ data: first, pageCount: 4 });
    await expect(
      findContracts.run(context({ props: { limit: 100 } }))
    ).resolves.toEqual(first);
    expect(sentRequests()).toHaveLength(2);
  });

  test.each([
    { status: ['pending'] },
    { status: 'active' },
    { sort: 'constructor' },
    { ending_within_days: -1 },
    { ending_within_days: 3651 },
    { ending_within_days: 1.5 },
    { end_date_from: '2027-02-29' },
    { end_date_from: '2027-01-02', end_date_to: '2027-01-01' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: NaN },
    { search: ['name'] },
    { counterparty: 123 },
    { external_system: [] },
    { limit: [] },
    { ending_within_days: [] },
    { external_id: 123 },
    { expand_document: 'true' },
    { unsupported: true },
  ])(
    'rejects invalid list filters before OAuth resolution (%j)',
    async (props) => {
      await expect(
        findContracts.run(context({ props, extra: { auth: oauthAuth } }))
      ).rejects.toThrow('Invalid contract input');
      expect(sendRequest).not.toHaveBeenCalled();
    }
  );

  test.each(cases)(
    '$action.displayName preserves server conflict details without retries',
    async ({ action, props }) => {
      const errors = [
        {
          field: 'updated_at',
          code: 'ContractChanged',
          message: 'Read the contract again.',
        },
      ];
      replyError({
        status: 409,
        body: {
          message: 'The contract changed.',
          code: 'ContractChanged',
          errors,
        },
      });
      await expect(
        action.run(context({ props: { document: 'doc_1', ...props } }))
      ).rejects.toMatchObject({ status: 409, code: 'ContractChanged', errors });
      expect(sentRequests()).toHaveLength(1);
    }
  );

  test('a renewal retry reuses the same term and surfaces the API refusal', async () => {
    const props = { document: 'doc_1', renewal: { term: 1, value: 0 } };
    replyData({ ...contract, term: 2 });
    await renewContract.run(context({ props }));
    replyError({
      status: 400,
      body: {
        message: 'Term mismatch.',
        errors: [
          {
            field: 'term',
            code: 'TermMismatch',
            message: 'The contract is already in its next term.',
          },
        ],
      },
    });
    await expect(renewContract.run(context({ props }))).rejects.toMatchObject({
      status: 400,
      errors: [
        {
          field: 'term',
          code: 'TermMismatch',
          message: 'The contract is already in its next term.',
        },
      ],
    });
    expect(
      sentRequests().map(({ method, body }) => ({ method, body }))
    ).toEqual([
      { method: HttpMethod.POST, body: props.renewal },
      { method: HttpMethod.POST, body: props.renewal },
    ]);
  });

  test('missing contract terms remain a 404 error', async () => {
    replyError({ status: 404, body: { message: 'No contract terms.' } });
    await expect(
      getContract.run(context({ props: { document: 'doc_1' } }))
    ).rejects.toMatchObject({ status: 404 });
  });
});
