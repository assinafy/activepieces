import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyApi } from '../src/lib/common/client';
import { SignerRequest, assinafySigners } from '../src/lib/common/signers';
import {
  PRODUCTION,
  apiSigner,
  replyData,
  replyError,
  sendRequest,
  sentRequests,
} from './helpers';

const client = () =>
  assinafyApi.fromCredentials(
    assinafyApi.apiKeyCredentials({ api_key: 'k', account_id: 'acc_1' })
  );
const signersUrl = `${PRODUCTION}/accounts/acc_1/signers`;
const request = (fields: Partial<SignerRequest>): SignerRequest => ({
  label: 'Signer 1',
  ...fields,
});
const resolve = async (fields: Partial<SignerRequest>) =>
  (
    await assinafySigners.resolveAll({
      client: client(),
      requests: [request(fields)],
    })
  )[0].signer;

describe('requestFromRow', () => {
  test('reads the row fields', () => {
    expect(
      assinafySigners.requestFromRow({
        row: {
          full_name: ' Maria ',
          email: 'maria@example.com',
          whatsapp: '',
          government_id: '39053344705',
          verification: 'certificate_email',
          step: '2',
        },
        label: 'Signer 1',
      })
    ).toEqual({
      label: 'Signer 1',
      fullName: 'Maria',
      email: 'maria@example.com',
      whatsapp: undefined,
      governmentId: '39053344705',
      verification: 'certificate_email',
      step: 2,
    });
  });

  test('explains a row that is not a set of fields, such as a list mapped as text', () => {
    expect(() =>
      assinafySigners.requestFromRow({ row: '[', label: 'Signer 1' })
    ).toThrow(
      'Signer 1 must be a set of fields such as Email or WhatsApp Number.'
    );
  });
});

describe('validateContacts', () => {
  const validate = (requests: Partial<SignerRequest>[]) =>
    assinafySigners.validateContacts(
      requests.map((fields, index) => ({
        label: `Signer ${index + 1}`,
        ...fields,
      }))
    );

  test('accepts the common cases', () => {
    expect(() =>
      validate([
        { email: 'maria@example.com' },
        { whatsapp: '+5548999990000' },
        {
          email: 'joao@example.com',
          whatsapp: '+5548999990001',
          verification: 'whatsapp',
        },
        {
          email: 'ana@example.com',
          verification: 'certificate_email',
          governmentId: '390.533.447-05',
        },
      ])
    ).not.toThrow();
  });

  test('requires a contact, and the contact for the chosen channel', () => {
    expect(() => validate([{ fullName: 'Nobody' }])).toThrow(
      'Signer 1: provide an email address or a WhatsApp number.'
    );
    expect(() =>
      validate([{ email: 'maria@example.com', verification: 'whatsapp' }])
    ).toThrow(
      'Signer 1: the chosen verification sends the invitation by WhatsApp, so a WhatsApp number is required.'
    );
    expect(() =>
      validate([
        { whatsapp: '+5548999990000', verification: 'certificate_email' },
      ])
    ).toThrow('so an email address is required');
    expect(() =>
      validate([{ email: 'maria@example.com', verification: 'fax' }])
    ).toThrow('Signer 1: unknown verification method "fax".');
  });

  test('checks the CPF/CNPJ check digits and repeated contacts', () => {
    expect(() =>
      validate([
        { email: 'maria@example.com', governmentId: '11.222.333/0001-81' },
      ])
    ).not.toThrow();
    for (const invalid of [
      '123',
      '390.533.447-06',
      '111.111.111-11',
      '11.222.333/0001-82',
    ]) {
      expect(() =>
        validate([{ email: 'maria@example.com', governmentId: invalid }])
      ).toThrow(
        `Signer 1: ${invalid} is not a valid CPF (11 digits) or CNPJ (14 digits).`
      );
    }
    expect(() =>
      validate([
        { whatsapp: '+55 48 99999-0000' },
        { whatsapp: '5548999990000' },
      ])
    ).toThrow('Signer 2 repeats the WhatsApp number 5548999990000.');
    expect(() =>
      validate([{ email: 'maria@example.com' }, { email: 'MARIA@example.com' }])
    ).toThrow('Signer 2 repeats the email address MARIA@example.com.');
  });
});

describe('validateSigningOrder', () => {
  const validate = (requests: Partial<SignerRequest>[]) =>
    assinafySigners.validateSigningOrder(
      requests.map((fields, index) => ({
        label: `Signer ${index + 1}`,
        email: `s${index}@example.com`,
        ...fields,
      }))
    );

  test('accepts no order, parallel steps and a certificate signer alone in a step', () => {
    expect(() => validate([{}, {}])).not.toThrow();
    expect(() =>
      validate([{ step: 1 }, { step: 1 }, { step: 2 }])
    ).not.toThrow();
    expect(() =>
      validate([{ verification: 'certificate_email' }])
    ).not.toThrow();
    expect(() =>
      validate([{ step: 1 }, { step: 2, verification: 'certificate_email' }])
    ).not.toThrow();
  });

  test('requires the order on every signer, starting at 1 without gaps', () => {
    expect(() => validate([{ step: 1 }, {}])).toThrow(
      'Set the signing order on every signer, or on none of them.'
    );
    expect(() => validate([{ step: 1 }, { step: 3 }])).toThrow(
      'no signer has step 2'
    );
    expect(() => validate([{ step: 2 }])).toThrow('no signer has step 1');
  });

  test('keeps a digital certificate signer alone in their step', () => {
    expect(() => validate([{ verification: 'certificate_email' }, {}])).toThrow(
      'Signer 1: a digital certificate signer must be the only signer in their signing order step.'
    );
    expect(() =>
      validate([
        { step: 1 },
        {
          step: 1,
          verification: 'certificate_whatsapp',
          whatsapp: '+5548999990000',
        },
      ])
    ).toThrow('Signer 2: a digital certificate signer');
  });
});

describe('assignmentFields', () => {
  test('defaults to email, or to WhatsApp when only a number is given', () => {
    expect(
      assinafySigners.assignmentFields(request({ email: 'maria@example.com' }))
    ).toEqual({
      verification_method: 'Email',
      notification_methods: ['Email'],
    });
    expect(
      assinafySigners.assignmentFields(
        request({ whatsapp: '+5548999990000', step: 2 })
      )
    ).toEqual({
      verification_method: 'Whatsapp',
      notification_methods: ['Whatsapp'],
      step: 2,
    });
    expect(
      assinafySigners.assignmentFields(
        request({
          email: 'a@example.com',
          verification: 'certificate_whatsapp',
        })
      )
    ).toEqual({
      verification_method: 'DigitalCertificate',
      notification_methods: ['Whatsapp'],
    });
  });
});

describe('resolve', () => {
  test('reuses the signer with the same email, ignoring case', async () => {
    replyData([
      { ...apiSigner, id: 'other', email: 'maria.other@example.com' },
      apiSigner,
    ]);
    const signer = await resolve({ email: 'MARIA@example.com' });
    expect(signer.id).toBe('sig_1');
    expect(sentRequests()).toHaveLength(1);
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.GET,
      url: signersUrl,
      queryParams: { search: 'MARIA@example.com', page: '1', 'per-page': '50' },
    });
  });

  test('creates the signer when the email is new', async () => {
    replyData([]);
    replyData({ ...apiSigner, id: 'sig_new' });
    const signer = await resolve({
      email: 'new@example.com',
      fullName: 'New Person',
      whatsapp: '+5548999990000',
    });
    expect(signer.id).toBe('sig_new');
    expect(sentRequests()).toHaveLength(2);
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.POST,
      url: signersUrl,
      body: {
        full_name: 'New Person',
        email: 'new@example.com',
        whatsapp_phone_number: '+5548999990000',
      },
    });
  });

  test('a new signer needs a name', async () => {
    replyData([]);
    await expect(
      resolve({ label: 'Signer 2', email: 'new@example.com' })
    ).rejects.toThrow(
      'Signer 2: no signer with new@example.com exists yet, so a full name is required to create one.'
    );
    await expect(resolve({ whatsapp: '+5548999990000' })).rejects.toThrow(
      'Signer 1: add the Full Name. Signers without an email address are found by their name and WhatsApp number.'
    );
  });

  test('matches a WhatsApp-only signer by name and number, including local formats', async () => {
    replyData([
      {
        ...apiSigner,
        id: 'wrong',
        email: null,
        whatsapp_phone_number: '+5548111110000',
      },
      {
        ...apiSigner,
        id: 'right',
        email: null,
        whatsapp_phone_number: '+5548999990000',
      },
    ]);
    const signer = await resolve({
      fullName: 'Maria Silva',
      whatsapp: '(48) 99999-0000',
    });
    expect(signer.id).toBe('right');
    expect(sentRequests()[0].queryParams).toEqual({
      search: 'Maria Silva',
      page: '1',
      'per-page': '50',
    });
  });

  test('searches further pages for common names and stops when pages repeat', async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) => ({
      ...apiSigner,
      id: `p1_${index}`,
      email: null,
    }));
    replyData(fullPage);
    replyData([
      {
        ...apiSigner,
        id: 'found',
        email: null,
        whatsapp_phone_number: '+5548999990000',
      },
    ]);
    await expect(
      resolve({ fullName: 'Maria Silva', whatsapp: '+5548999990000' })
    ).resolves.toMatchObject({ id: 'found' });
    expect(sentRequests()[1].queryParams).toMatchObject({ page: '2' });

    replyData(fullPage);
    replyData(fullPage);
    replyData({ ...apiSigner, id: 'created' });
    await expect(
      resolve({ fullName: 'Maria Silva', whatsapp: '+5548999990000' })
    ).resolves.toMatchObject({ id: 'created' });
    expect(
      sentRequests().filter((sent) => sent.method === HttpMethod.GET)
    ).toHaveLength(4);
  });

  test('gives up after 250 candidates', async () => {
    for (let page = 1; page <= 5; page++) {
      replyData(
        Array.from({ length: 50 }, (_, index) => ({
          ...apiSigner,
          id: `p${page}_${index}`,
          email: null,
        }))
      );
    }
    replyData({ ...apiSigner, id: 'created' });
    await expect(
      resolve({ fullName: 'Maria Silva', whatsapp: '+5548999990000' })
    ).resolves.toMatchObject({ id: 'created' });
    expect(
      sentRequests().filter((sent) => sent.method === HttpMethod.GET)
    ).toHaveLength(5);
  });

  test('reuses a signer that another run created at the same moment', async () => {
    replyData([]);
    replyError({
      status: 400,
      body: { message: 'Um signatário com este e-mail já existe.' },
    });
    replyData([{ ...apiSigner, id: 'sig_race', email: 'new@example.com' }]);
    await expect(
      resolve({ email: 'new@example.com', fullName: 'New Person' })
    ).resolves.toMatchObject({ id: 'sig_race' });
    replyData([]);
    replyError({ status: 400, body: { message: 'Invalid' } });
    replyData([]);
    await expect(
      resolve({ email: 'other@example.com', fullName: 'Other' })
    ).rejects.toThrow('HTTP 400');
    replyData([]);
    replyError({ status: 503, body: { message: 'Unavailable' } });
    await expect(
      resolve({ email: 'third@example.com', fullName: 'Third' })
    ).rejects.toThrow('HTTP 503');
  });

  test('an empty page means no match', async () => {
    replyData([]);
    replyData({ ...apiSigner, id: 'created' });
    await expect(
      resolve({ email: 'x@example.com', fullName: 'X' })
    ).resolves.toMatchObject({ id: 'created' });
  });

  test('refuses to send to a stored WhatsApp number that differs from the one given', async () => {
    replyData([{ ...apiSigner, whatsapp_phone_number: '+5511911110000' }]);
    await expect(
      resolve({ email: 'maria@example.com', whatsapp: '+5548999990000' })
    ).rejects.toThrow(
      'Signer 1: maria@example.com is saved in Assinafy with a different WhatsApp number.'
    );
    expect(sentRequests()).toHaveLength(1);
  });

  test('adds a missing WhatsApp number but never changes the CPF/CNPJ of an existing signer', async () => {
    replyData([apiSigner]);
    replyData({ ...apiSigner, whatsapp_phone_number: '+5548999990000' });
    await resolve({
      email: 'maria@example.com',
      whatsapp: '+5548999990000',
      governmentId: '390.533.447-05',
    });
    expect(sentRequests()[1]).toEqual(
      expect.objectContaining({
        method: HttpMethod.PUT,
        url: `${signersUrl}/sig_1`,
        body: { whatsapp_phone_number: '+5548999990000' },
      })
    );
    sendRequest.mockReset();
    replyData([apiSigner]);
    await resolve({
      email: 'maria@example.com',
      governmentId: '11.222.333/0001-81',
    });
    expect(sentRequests()).toHaveLength(1);
  });

  test('sets the CPF of a new signer with an update after creating it', async () => {
    replyData([]);
    replyData({ ...apiSigner, id: 'sig_new' });
    replyData({ ...apiSigner, id: 'sig_new' });
    await resolve({
      email: 'new@example.com',
      fullName: 'New Person',
      governmentId: '390.533.447-05',
    });
    expect(sentRequests()[1].body).toEqual({
      full_name: 'New Person',
      email: 'new@example.com',
    });
    expect(sentRequests()[2]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${signersUrl}/sig_new`,
      body: { government_id: '390.533.447-05' },
    });
  });

  test('changes nothing when the stored details already match', async () => {
    replyData([
      {
        ...apiSigner,
        whatsapp_phone_number: '+5548999990000',
      },
    ]);
    await resolve({
      email: 'maria@example.com',
      whatsapp: '48 99999-0000',
      governmentId: '390.533.447-05',
    });
    expect(sentRequests()).toHaveLength(1);
  });
});

describe('resolveAll', () => {
  test('resolves in order and rejects the same person twice', async () => {
    replyData([apiSigner]);
    replyData([{ ...apiSigner, id: 'sig_2', email: 'joao@example.com' }]);
    const resolved = await assinafySigners.resolveAll({
      client: client(),
      requests: [
        request({ email: 'maria@example.com' }),
        request({ label: 'Signer 2', email: 'joao@example.com' }),
      ],
    });
    expect(resolved.map(({ signer }) => signer.id)).toEqual(['sig_1', 'sig_2']);

    replyData([
      { ...apiSigner, email: null, whatsapp_phone_number: '+5548999990000' },
    ]);
    replyData([apiSigner]);
    await expect(
      assinafySigners.resolveAll({
        client: client(),
        requests: [
          request({ fullName: 'Maria Silva', whatsapp: '+5548999990000' }),
          request({ label: 'Signer 2', email: 'maria@example.com' }),
        ],
      })
    ).rejects.toThrow('Signer 2 is the same person as Signer 1.');
  });

  test('checks every signer before creating or changing any of them', async () => {
    replyData([]);
    replyData([]);
    await expect(
      assinafySigners.resolveAll({
        client: client(),
        requests: [
          request({ email: 'new@example.com', fullName: 'New Person' }),
          request({ label: 'Signer 2', email: 'other@example.com' }),
        ],
      })
    ).rejects.toThrow('Signer 2: no signer with other@example.com exists yet');
    expect(sentRequests().every((sent) => sent.method === HttpMethod.GET)).toBe(
      true
    );
  });
});
