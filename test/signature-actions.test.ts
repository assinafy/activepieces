import { HttpMethod } from '@activepieces/pieces-common';
import { requestSignatures } from '../src/lib/actions/request-signatures';
import { resendSignatureRequest } from '../src/lib/actions/resend-signature-request';
import { updateSigningDeadline } from '../src/lib/actions/update-signing-deadline';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  apiAssignment,
  apiDocument,
  apiSigner,
  context,
  replyData,
  sentRequests,
} from './helpers';

const signersUrl = `${PRODUCTION}/accounts/acc_1/signers`;
const assignmentsUrl = `${PRODUCTION}/documents/doc_1/assignments`;
const readyDocument = { ...apiDocument, status: 'metadata_ready' };

describe('Request Signatures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('resolves signers by contact details and creates a virtual assignment', async () => {
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData([]);
    replyData([]);
    replyData({
      ...apiSigner,
      id: 'sig_2',
      full_name: 'João Souza',
      email: null,
      whatsapp_phone_number: '+5548999990000',
    });
    replyData({
      ...apiSigner,
      id: 'sig_3',
      full_name: 'Legal',
      email: 'legal@example.com',
    });
    replyData({ ...apiAssignment, copy_receivers: [{ id: 'sig_3' }] });

    const result = await requestSignatures.run(
      context({
        props: {
          document: 'doc_1',
          signers: [
            { email: 'maria@example.com', step: 1 },
            { full_name: 'João Souza', whatsapp: '+5548999990000', step: '2' },
          ],
          message: ' Please sign ',
          expires_at: '2026-12-31T18:00:00.000Z',
          copy_receivers: [{ full_name: 'Legal', email: 'legal@example.com' }],
        },
      })
    );

    expect(result).toEqual(
      assinafyFormat.assignment({
        assignment: apiAssignment,
        documentId: 'doc_1',
      })
    );
    const requests = sentRequests();
    expect(requests[0]).toMatchObject({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/documents/doc_1`,
    });
    expect(requests[2].queryParams).toEqual({
      search: 'João Souza',
      page: '1',
      'per-page': '50',
    });
    expect(requests.slice(1, 4).map((sent) => sent.method)).toEqual([
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.GET,
    ]);
    expect(requests[4]).toMatchObject({
      method: HttpMethod.POST,
      url: signersUrl,
      body: {
        full_name: 'João Souza',
        whatsapp_phone_number: '+5548999990000',
      },
    });
    expect(requests[6]).toEqual(
      expect.objectContaining({
        method: HttpMethod.POST,
        url: assignmentsUrl,
        body: {
          method: 'virtual',
          signers: [
            {
              id: 'sig_1',
              verification_method: 'Email',
              notification_methods: ['Email'],
              step: 1,
            },
            {
              id: 'sig_2',
              verification_method: 'Whatsapp',
              notification_methods: ['Whatsapp'],
              step: 2,
            },
          ],
          message: 'Please sign',
          expires_at: '2026-12-31T18:00:00.000Z',
          copy_receivers: ['sig_3'],
        },
      })
    );
  });

  test('sends only what was given', async () => {
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData(apiAssignment);
    await requestSignatures.run(
      context({
        props: {
          document: 'doc_1',
          signers: [{ email: 'maria@example.com' }],
          copy_receivers: undefined,
        },
      })
    );
    expect(sentRequests()[2].body).toEqual({
      method: 'virtual',
      signers: [
        {
          id: 'sig_1',
          verification_method: 'Email',
          notification_methods: ['Email'],
        },
      ],
    });
  });

  test('uses the digital certificate method with the CPF', async () => {
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData(apiAssignment);
    await requestSignatures.run(
      context({
        props: {
          document: 'doc_1',
          signers: [
            {
              email: 'maria@example.com',
              verification: 'certificate_email',
              government_id: '390.533.447-05',
            },
          ],
        },
      })
    );
    expect(sentRequests().map((sent) => sent.method)).toEqual([
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.POST,
    ]);
    expect(sentRequests()[2].body).toMatchObject({
      signers: [
        {
          id: 'sig_1',
          verification_method: 'DigitalCertificate',
          notification_methods: ['Email'],
        },
      ],
    });
  });

  test('requires at least one signer', async () => {
    await expect(
      requestSignatures.run(
        context({ props: { document: 'doc_1', signers: [] } })
      )
    ).rejects.toThrow('Add at least one signer.');
    await expect(
      requestSignatures.run(
        context({ props: { document: 'doc_1', signers: undefined } })
      )
    ).rejects.toThrow('Add at least one signer.');
  });

  test('checks every row before creating or changing any signer', async () => {
    const invalid = [
      {
        signers: [{ email: 'maria@example.com' }, { full_name: 'Nobody' }],
        error: 'Signer 2: provide an email address or a WhatsApp number.',
      },
      {
        signers: [{ email: 'maria@example.com', verification: 'whatsapp' }],
        error: 'so a WhatsApp number is required',
      },
      {
        signers: [
          { email: 'a@example.com', step: 1 },
          { email: 'b@example.com' },
        ],
        error: 'Set the signing order on every signer',
      },
      {
        signers: [
          { email: 'a@example.com', step: 1 },
          { email: 'b@example.com', step: 3 },
        ],
        error: 'no signer has step 2',
      },
      {
        signers: [
          { email: 'a@example.com', verification: 'certificate_email' },
          { email: 'b@example.com' },
        ],
        error: 'a digital certificate signer must be the only signer',
      },
      {
        signers: [{ email: 'a@example.com', government_id: '123' }],
        error: 'is not a valid CPF (11 digits) or CNPJ (14 digits)',
      },
      {
        signers: [{ email: 'a@example.com' }, { email: 'A@example.com' }],
        error: 'Signer 2 repeats the email address',
      },
      {
        signers: [
          { email: 'a@example.com', whatsapp: '+5548999990000' },
          { email: 'b@example.com', whatsapp: '48 99999-0000' },
        ],
        error: 'Signer 2 repeats the WhatsApp number 48 99999-0000.',
      },
      {
        signers: [
          { email: 'a@example.com', whatsapp: '48 99999-0000' },
          { full_name: 'B', whatsapp: '+55 48 99999-0000' },
        ],
        error: 'Signer 2 repeats the WhatsApp number',
      },
      {
        signers: ['{"email":"a@example.com"}'],
        error: 'Signer 1 must be a set of fields',
      },
      {
        signers: [{ email: 'a@example.com' }],
        expires_at: 'soon',
        error: 'Deadline must be a valid date and time',
      },
      {
        signers: [{ email: 'a@example.com' }],
        copy_receivers: [{ full_name: 'No email' }],
        error: 'Copy recipient 1: provide an email address',
      },
      {
        signers: [{ email: 'a@example.com' }],
        copy_receivers: [{ email: 'A@example.com' }],
        error: 'Copy recipient 1 repeats the email address A@example.com.',
      },
    ];
    for (const { error, ...props } of invalid) {
      await expect(
        requestSignatures.run(
          context({ props: { document: 'doc_1', ...props } })
        ),
        error
      ).rejects.toThrow(error);
    }
    expect(sentRequests()).toHaveLength(0);
  });

  test('waits for a fresh upload to be processed before changing any signer', async () => {
    vi.useFakeTimers();
    replyData({ ...apiDocument, status: 'uploading' });
    replyData({ ...apiDocument, status: 'uploading' });
    replyData({ ...apiDocument, status: 'uploaded' });
    replyData([apiSigner]);
    replyData(apiAssignment);
    const running = requestSignatures.run(
      context({
        props: { document: 'doc_1', signers: [{ email: 'maria@example.com' }] },
      })
    );
    await vi.advanceTimersByTimeAsync(4000);
    await expect(running).resolves.toMatchObject({ assignment_id: 'asg_1' });
    expect(sentRequests().map((sent) => sent.method)).toEqual([
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.POST,
    ]);
  });

  test('stops before changing signers when processing failed or takes too long', async () => {
    const run = () =>
      requestSignatures.run(
        context({
          props: {
            document: 'doc_1',
            signers: [{ email: 'maria@example.com' }],
          },
        })
      );
    replyData({ ...apiDocument, status: 'failed' });
    await expect(run()).rejects.toThrow(
      'Assinafy could not process this document (status: Processing failed). Upload it again.'
    );
    vi.useFakeTimers();
    for (let check = 0; check <= 15; check++) {
      replyData({ ...apiDocument, status: 'uploading' });
    }
    const slow = run().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30000);
    expect(String(await slow)).toContain(
      'Assinafy is still receiving the file of this document. Try again in a minute.'
    );
    expect(sentRequests()).toHaveLength(17);
    expect(sentRequests().every((sent) => sent.method === HttpMethod.GET)).toBe(
      true
    );
  });

  test('reports copy recipients that Assinafy did not keep, with the request ID', async () => {
    const run = () =>
      requestSignatures.run(
        context({
          props: {
            document: 'doc_1',
            signers: [{ email: 'maria@example.com' }],
            copy_receivers: [{ email: 'legal@example.com' }],
          },
        })
      );
    const legal = { ...apiSigner, id: 'sig_3', email: 'legal@example.com' };
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData([legal]);
    replyData({ ...apiAssignment, copy_receivers: [] });
    await expect(run()).rejects.toThrow(
      'The signature request asg_1 was sent, but Assinafy did not keep these copy recipients: legal@example.com. Copy recipients may not be available on your Assinafy plan. Do not run this step again for the same document, or the signers are invited twice.'
    );
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData([legal]);
    replyData({
      ...apiAssignment,
      copy_receivers: [{ id: 'other', email: 'LEGAL@example.com' }],
    });
    await expect(run()).resolves.toMatchObject({ assignment_id: 'asg_1' });
    replyData(readyDocument);
    replyData([apiSigner]);
    replyData([legal]);
    replyData({
      ...apiAssignment,
      copy_receivers: [{ signer: { id: 'sig_3', full_name: 'Legal' } }],
    });
    await expect(run()).resolves.toMatchObject({ assignment_id: 'asg_1' });
  });

  test('checks copy recipients before creating any signer', async () => {
    replyData(readyDocument);
    replyData([]);
    replyData([]);
    await expect(
      requestSignatures.run(
        context({
          props: {
            document: 'doc_1',
            signers: [{ email: 'new@example.com', full_name: 'New Person' }],
            copy_receivers: [{ email: 'legal@example.com' }],
          },
        })
      )
    ).rejects.toThrow(
      'Copy recipient 1: no signer with legal@example.com exists yet'
    );
    expect(sentRequests().every((sent) => sent.method === HttpMethod.GET)).toBe(
      true
    );
  });

  test('rejects the same person reached through different contact details', async () => {
    replyData(readyDocument);
    replyData([{ ...apiSigner, whatsapp_phone_number: '+5548999990000' }]);
    replyData([{ ...apiSigner, whatsapp_phone_number: '+5548999990000' }]);
    await expect(
      requestSignatures.run(
        context({
          props: {
            document: 'doc_1',
            signers: [
              { email: 'maria@example.com' },
              { full_name: 'Maria Silva', whatsapp: '+5548999990000' },
            ],
          },
        })
      )
    ).rejects.toThrow('Signer 2 is the same person as Signer 1.');
    expect(
      sentRequests().some((request) => request.url === assignmentsUrl)
    ).toBe(false);
  });
});

describe('Resend Signature Request', () => {
  test('resends to the signer on the document assignment', async () => {
    replyData(apiDocument);
    replyData({ is_sent: true, document_id: 'doc_1', signer_id: 'sig_1' });
    await expect(
      resendSignatureRequest.run(
        context({ props: { document: 'doc_1', signer: 'sig_1' } })
      )
    ).resolves.toEqual({
      sent: true,
      document_id: 'doc_1',
      assignment_id: 'asg_1',
      signer_id: 'sig_1',
    });
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${PRODUCTION}/documents/doc_1/assignments/asg_1/signers/sig_1/resend`,
    });
  });

  test('reports an unknown send result as null', async () => {
    replyData(apiDocument);
    replyData({});
    await expect(
      resendSignatureRequest.run(
        context({ props: { document: 'doc_1', signer: 'sig_1' } })
      )
    ).resolves.toMatchObject({
      sent: null,
    });
  });

  test('explains when the document was never sent', async () => {
    replyData({ ...apiDocument, assignment: null });
    await expect(
      resendSignatureRequest.run(
        context({ props: { document: 'doc_1', signer: 'sig_1' } })
      )
    ).rejects.toThrow('This document has no signature request yet.');
  });
});

describe('Update Signing Deadline', () => {
  test('resets the assignment expiration', async () => {
    replyData(apiDocument);
    replyData({ ...apiAssignment, expires_at: '2026-12-31T21:00:00Z' });
    const result = await updateSigningDeadline.run(
      context({
        props: { document: 'doc_1', expires_at: '2026-12-31T18:00:00-03:00' },
      })
    );
    expect(result).toMatchObject({ expires_at: '2026-12-31T21:00:00Z' });
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${PRODUCTION}/documents/doc_1/assignments/asg_1/reset-expiration`,
      body: { expires_at: '2026-12-31T21:00:00.000Z' },
    });
  });

  test('validates the date before calling the API', async () => {
    await expect(
      updateSigningDeadline.run(
        context({ props: { document: 'doc_1', expires_at: 'next week' } })
      )
    ).rejects.toThrow('New Deadline must be a valid date and time');
    expect(sentRequests()).toHaveLength(0);
  });

  test('explains when the document was never sent', async () => {
    replyData({ ...apiDocument, assignment: undefined });
    await expect(
      updateSigningDeadline.run(
        context({
          props: { document: 'doc_1', expires_at: '2026-12-31T18:00:00Z' },
        })
      )
    ).rejects.toThrow('This document has no signature request yet.');
  });
});
