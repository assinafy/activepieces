import { HttpMethod } from '@activepieces/pieces-common';
import { createEnvelope } from '../src/lib/actions/create-envelope';
import { findEnvelopes } from '../src/lib/actions/find-envelopes';
import { getEnvelope } from '../src/lib/actions/get-envelope';
import { cancelEnvelope } from '../src/lib/actions/cancel-envelope';
import { downloadEnvelope } from '../src/lib/actions/download-envelope';
import { createEmbedSession } from '../src/lib/actions/create-embed-session';
import { requestSignatures } from '../src/lib/actions/request-signatures';
import { createDocumentFromTemplate } from '../src/lib/actions/create-document-from-template';
import { assinafyEnvelopes } from '../src/lib/common/envelopes';
import { assinafyOutputSchemas } from '../src/lib/output-schemas';
import {
  PRODUCTION,
  apiAssignment,
  apiDocument,
  apiKeyAuth,
  apiSigner,
  apiTemplate,
  context,
  oauthAuth,
  replyData,
  replyError,
  replyPage,
  replyRaw,
  sendRequest,
  sentRequests,
} from './helpers';

const input = {
  name: 'Agreement',
  signers: [
    {
      id: 's1',
      verification_method: 'Email',
      notification_methods: ['Email'],
      embedded: true,
    },
  ],
  documents: [{ id: 'd1', signer_ids: ['s1'] }],
};
const output = {
  resource: 'envelope',
  id: 'e1',
  name: 'Agreement',
  message: null,
  documents: [
    {
      id: 'd1',
      position: 1,
      name: 'Contract.pdf',
      status: 'pending_signature',
      artifacts: {},
      signers: [
        {
          id: 's1',
          full_name: 'Maria Silva',
          email: 'maria@example.com',
          whatsapp_phone_number: null,
          completed: false,
          signed_at: null,
        },
      ],
    },
  ],
  counts: { pending_signature: 1 },
  signing_urls: [{ signer_id: 's1', url: null, embedded: true }],
  created_at: '2026-11-24T12:00:00Z',
};

describe.each([
  ['API key', apiKeyAuth, { 'X-Api-Key': 'test-api-key' }],
  ['OAuth', oauthAuth, { Authorization: 'Bearer test-access-token' }],
] as const)('%s envelope actions', (_, auth, headers) => {
  const ctx = (props: Record<string, unknown>) =>
    context({ props, extra: { auth } });
  const workspace = () => {
    if (auth === oauthAuth) replyData([{ id: 'acc_1' }]);
  };
  test('creates, reads and cancels with the documented paths and untouched payloads', async () => {
    workspace();
    replyData(output);
    expect(await createEnvelope.run(ctx({ envelope: input }))).toEqual(output);
    expect(sentRequests().at(-1)).toMatchObject({
      method: HttpMethod.POST,
      url: `${PRODUCTION}/accounts/acc_1/envelopes`,
      headers,
      body: input,
      followRedirects: false,
    });
    workspace();
    replyData(output);
    expect(await getEnvelope.run(ctx({ envelope: ' e/1 ' }))).toEqual(output);
    expect(sentRequests().at(-1)?.url).toBe(
      `${PRODUCTION}/accounts/acc_1/envelopes/e%2F1`
    );
    const cancelled = [
      { id: 'd1', status: 'rejected_by_user', cancelled: true },
    ];
    workspace();
    replyData(cancelled);
    expect(await cancelEnvelope.run(ctx({ envelope: 'e1' }))).toEqual(
      cancelled
    );
    expect(sentRequests().at(-1)).toMatchObject({
      method: HttpMethod.PUT,
      url: `${PRODUCTION}/accounts/acc_1/envelopes/e1/cancel`,
      headers,
    });
  });
  test('paginates and deduplicates search results by ID', async () => {
    workspace();
    replyPage({ data: [output], pageCount: 2 });
    replyPage({ data: [output, { ...output, id: 'e2' }], pageCount: 2 });
    expect(
      await findEnvelopes.run(
        ctx({ search: ' Agreement ', status: 'open', limit: 2 })
      )
    ).toEqual([output, { ...output, id: 'e2' }]);
    expect(sentRequests().at(-1)).toMatchObject({
      headers,
      queryParams: {
        search: 'Agreement',
        status: 'open',
        page: '2',
        'per-page': '50',
      },
    });
  });
  test('writes the binary ZIP with its complete output schema', async () => {
    workspace();
    replyRaw(Buffer.from('PK\x03\x04'));
    const result = await downloadEnvelope.run(
      ctx({ envelope: 'e1', file_type: 'original' })
    );
    expect(result).toMatchObject({
      file_name: 'e1-original.zip',
      file_type: 'original',
      envelope_id: 'e1',
      size_bytes: 4,
    });
    expect(Object.keys(result as object)).toEqual(
      assinafyOutputSchemas.envelopeDownload.fields.map((field) => field.key)
    );
    expect(sentRequests().at(-1)).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/envelopes/e1/download/original`,
      responseType: 'arraybuffer',
      headers,
    });
  });
  test('mints an embed URL without exposing a signer access code', async () => {
    replyData(apiDocument);
    replyData({
      url: 'https://example.com/embed/token',
      expires_at: '2026-11-24T12:05:00Z',
    });
    const result = await createEmbedSession.run(
      ctx({ document: ' d/1 ', signer: ' s/1 ' })
    );
    expect(Object.keys(result as object)).toEqual(['url', 'expires_at']);
    expect(sentRequests().at(-1)).toMatchObject({
      method: HttpMethod.POST,
      url: `${PRODUCTION}/documents/d%2F1/assignments/asg_1/signers/s%2F1/embed-sessions`,
      headers,
    });
  });
  test('maps embedded signing from the request form and reports it in the output', async () => {
    replyData({ ...apiDocument, assignment: null });
    workspace();
    replyData([apiSigner]);
    replyData({
      ...apiAssignment,
      signing_urls: [{ signer_id: apiSigner.id, url: null, embedded: true }],
    });
    const result = await requestSignatures.run(
      ctx({
        document: 'd1',
        signers: [{ email: apiSigner.email, embedded: true }],
      })
    );
    expect(result).toMatchObject({
      signers: [{ embedded: true, signing_url: null }],
    });
    expect(sentRequests().at(-1)?.body).toMatchObject({
      signers: [
        {
          id: apiSigner.id,
          embedded: true,
          verification_method: 'Email',
          notification_methods: ['Email'],
        },
      ],
    });
  });
  test('maps embedded template roles before asynchronous generation', async () => {
    workspace();
    replyData([apiTemplate]);
    replyData([apiSigner]);
    replyData({ ...apiDocument, assignment: null });
    await createDocumentFromTemplate.run(
      ctx({
        template: 'tpl_1',
        signers: {
          email_role_client: apiSigner.email,
          embedded_role_client: true,
        },
        editor_fields: { field_fld_company: 'Example' },
      })
    );
    expect(sentRequests().at(-1)?.body).toMatchObject({
      signers: [{ id: apiSigner.id, role_id: 'role_client', embedded: true }],
    });
  });
});

test.each([
  { email: 'maria@example.com', embedded: 'false' },
  {
    email: 'maria@example.com',
    embedded: true,
    verification: 'certificate_email',
  },
  {
    email: 'maria@example.com',
    embedded: true,
    verification: 'biometric_email',
  },
])(
  'rejects incompatible embedded settings before signer mutations: %j',
  async (signer) => {
    await expect(
      requestSignatures.run(
        context({ props: { document: 'd1', signers: [signer] } })
      )
    ).rejects.toThrow(/embedded|Embedded/);
    expect(sendRequest).not.toHaveBeenCalled();
  }
);

test('envelope output schema describes the nested API fields', () => {
  const fields = assinafyOutputSchemas.envelope.fields;
  expect(fields.map((field) => field.key)).toEqual(Object.keys(output));
  for (const key of ['documents', 'signing_urls'] as const) {
    const field = fields.find((field) => field.key === key)!;
    expect(field.listItems?.map((item) => item.key)).toEqual(
      Object.keys(output[key][0])
    );
  }
});

test('keeps default search inputs empty and custom download names', async () => {
  replyData([]);
  expect(await findEnvelopes.run(context({ props: {} }))).toEqual([]);
  replyRaw(Buffer.from('PK'));
  expect(
    await downloadEnvelope.run(
      context({
        props: {
          envelope: 'e1',
          file_type: 'bundle',
          file_name: ' result.zip ',
        },
      })
    )
  ).toMatchObject({ file_name: 'result.zip' });
});

test.each([0, 101, 1.5, NaN, Infinity])(
  'rejects invalid limit %s before the request',
  async (limit) => {
    await expect(
      findEnvelopes.run(context({ props: { limit } }))
    ).rejects.toThrow('Maximum Results');
    expect(sendRequest).not.toHaveBeenCalled();
  }
);

test('rejects invalid IDs, enum values and missing assignments', async () => {
  await expect(
    getEnvelope.run(context({ props: { envelope: '' } }))
  ).rejects.toThrow('Envelope ID');
  await expect(
    cancelEnvelope.run(context({ props: { envelope: ' ' } }))
  ).rejects.toThrow('Envelope ID');
  await expect(
    downloadEnvelope.run(
      context({ props: { envelope: 'e1', file_type: 'constructor' } })
    )
  ).rejects.toThrow('Unknown file type');
  await expect(
    findEnvelopes.run(context({ props: { status: 'constructor' } }))
  ).rejects.toThrow('valid envelope status');
  await expect(
    createEmbedSession.run(context({ props: { document: 'd1', signer: '' } }))
  ).rejects.toThrow('Signer ID');
  expect(sendRequest).not.toHaveBeenCalled();
  replyData({ id: 'd1', assignment: null });
  await expect(
    createEmbedSession.run(context({ props: { document: 'd1', signer: 's1' } }))
  ).rejects.toThrow('no signature request');
  expect(sendRequest).toHaveBeenCalledOnce();
});

test.each([403, 409, 429])(
  'preserves API refusal %s without retrying creation',
  async (status) => {
    replyError({
      status,
      body: { message: 'Refused', code: 'PlanRestricted' },
    });
    await expect(
      createEnvelope.run(context({ props: { envelope: input } }))
    ).rejects.toMatchObject({ status });
    expect(sendRequest).toHaveBeenCalledOnce();
  }
);

describe('envelope preflight', () => {
  test.each([
    null,
    {},
    { ...input, name: '<b>' },
    { ...input, signers: [] },
    { ...input, documents: [] },
    { ...input, max_total_credits: -1 },
    { ...input, extra: true },
    { ...input, signers: [{ id: 's1', step: 1 }] },
    {
      ...input,
      signers: [{ id: 's1', notification_methods: ['Email', 'Whatsapp'] }],
    },
    { ...input, signers: [{ id: 's1' }, { id: 's1' }] },
    { ...input, documents: [input.documents[0], input.documents[0]] },
    { ...input, signers: [{ id: 's1' }, { id: 'unused' }] },
    { ...input, documents: [{ id: 'd1', signer_ids: ['s1', 'missing'] }] },
    {
      ...input,
      signers: [
        {
          id: 's1',
          verification_method: 'Email',
          notification_methods: ['Whatsapp'],
        },
      ],
    },
    {
      ...input,
      signers: [
        { id: 's1', verification_method: 'DigitalCertificate', embedded: true },
      ],
    },
    {
      ...input,
      signers: [
        {
          id: 's1',
          verification_method: 'IdDocumentFaceMatchBasic',
          embedded: true,
        },
      ],
    },
    {
      ...input,
      signers: [
        { id: 's1', verification_method: 'DigitalCertificate' },
        { id: 's2' },
      ],
      documents: [{ id: 'd1', signer_ids: ['s1', 's2'] }],
    },
    {
      ...input,
      signers: [{ id: 's1', verification_method: 'DigitalCertificate' }],
      documents: [{ id: 'd1', method: 'collect', signer_ids: ['s1'] }],
    },
    {
      ...input,
      documents: [{ id: 'd1', method: 'collect', signer_ids: ['s1'] }],
    },
    {
      ...input,
      documents: [{ id: 'd1', signer_ids: ['s1'], expires_at: '2020-01-01' }],
    },
    {
      ...input,
      signers: Array.from({ length: 21 }, (_, i) => ({ id: `s${i}` })),
    },
    {
      ...input,
      documents: Array.from({ length: 21 }, (_, i) => ({
        id: `d${i}`,
        signer_ids: ['s1'],
      })),
    },
  ])('changes nothing for invalid input %#', async (envelope) => {
    await expect(
      createEnvelope.run(context({ props: { envelope } }))
    ).rejects.toThrow();
    expect(sendRequest).not.toHaveBeenCalled();
  });
  test.each([
    ['Email', 'Email'],
    ['Whatsapp', 'Whatsapp'],
    ['DigitalCertificate', 'Email'],
    ['DigitalCertificate', 'Whatsapp'],
    ['IdDocumentFaceMatchBasic', 'Email'],
    ['IdDocumentFaceMatchBasic', 'Whatsapp'],
  ])('supports %s / %s', (verification_method, notification) => {
    const body = {
      ...input,
      signers: [
        { id: 's1', verification_method, notification_methods: [notification] },
      ],
    };
    expect(assinafyEnvelopes.parse(body)).toEqual(body);
  });
  test('preserves null, false and zero; normalizes deadlines and accepts default methods', () => {
    const body = {
      ...input,
      message: null,
      max_total_credits: 0,
      signers: [{ id: 's1', embedded: false }],
      documents: [
        {
          id: 'd1',
          signer_ids: ['s1'],
          expires_at: '2099-12-31',
          copy_receiver_ids: [],
        },
      ],
    };
    expect(assinafyEnvelopes.parse(body)).toEqual({
      ...body,
      documents: [
        { ...body.documents[0], expires_at: '2099-12-31T23:59:00.000Z' },
      ],
    });
  });
  const field = {
    signer_id: 's1',
    field_id: 'f1',
    display_settings: { left: 0, top: 0, width: 100, height: 50, fontSize: 12 },
  };
  test('accepts collect fields owned by exactly the document signers', () => {
    const body = {
      ...input,
      documents: [
        {
          id: 'd1',
          method: 'collect',
          signer_ids: ['s1'],
          entries: [{ page_id: 'p1', fields: [field] }],
        },
      ],
    };
    expect(assinafyEnvelopes.parse(body)).toEqual(body);
  });
  test.each([
    { fields: [] },
    { fields: [{ ...field, signer_id: 'other' }] },
    { fields: [field] },
  ])('rejects incomplete collect ownership %#', ({ fields }) => {
    expect(() =>
      assinafyEnvelopes.parse({
        ...input,
        signers: [{ id: 's1' }, { id: 's2' }],
        documents: [
          {
            id: 'd1',
            method: 'collect',
            signer_ids: ['s1', 's2'],
            entries: [{ page_id: 'p1', fields }],
          },
        ],
      })
    ).toThrow('collect fields');
  });
});
