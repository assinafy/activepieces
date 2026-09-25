import { assinafyFormat } from '../src/lib/common/format';
import {
  apiAssignment,
  apiDocument,
  apiSigner,
  signedDocument,
} from './helpers';

const {
  document: formatDocument,
  signer: formatSigner,
  statusLabel,
} = assinafyFormat;

const expectedSigner = {
  id: 'sig_1',
  full_name: 'Maria Silva',
  email: 'maria@example.com',
  whatsapp_phone_number: null,
  step: 1,
  verification_method: 'Email',
  notification_method: 'Email',
  signed: false,
  signing_url:
    'https://api.assinafy.com.br/v1/sign/doc_1?email=maria@example.com',
};

describe('formatDocument', () => {
  test('flattens a document with its signature request', () => {
    expect(formatDocument(apiDocument)).toEqual({
      id: 'doc_1',
      name: 'Contract.pdf',
      status: 'pending_signature',
      status_label: 'Waiting for signatures',
      is_closed: false,
      account_id: 'acc_1',
      template_id: null,
      page_count: 1,
      tags: 'Contracts',
      available_files: 'original',
      signing_url: 'https://api.assinafy.com.br/v1/sign/doc_1',
      decline_reason: null,
      declined_by_name: null,
      declined_by_email: null,
      created_at: '2026-09-01T12:00:00Z',
      updated_at: '2026-09-01T12:05:00Z',
      assignment_id: 'asg_1',
      signature_method: 'virtual',
      expires_at: null,
      signer_count: 1,
      signed_count: 0,
      signer_emails: 'maria@example.com',
      signers: [expectedSigner],
    });
  });

  test('lists only downloadable files and reports who declined', () => {
    const declined = formatDocument({
      ...signedDocument,
      status: 'rejected_by_signer',
      decline_reason: 'Wrong amount',
      declined_by: apiSigner,
    });
    expect(declined.available_files).toBe(
      'original, certificated, certificate-page, bundle'
    );
    expect(declined.status_label).toBe('Declined by a signer');
    expect(declined.declined_by_name).toBe('Maria Silva');
    expect(declined.declined_by_email).toBe('maria@example.com');
  });

  test('keeps unknown values as null instead of inventing them', () => {
    expect(formatDocument({ id: 'doc_9' })).toEqual({
      id: 'doc_9',
      name: null,
      status: null,
      status_label: null,
      is_closed: null,
      account_id: null,
      template_id: null,
      page_count: null,
      tags: null,
      available_files: null,
      signing_url: null,
      decline_reason: null,
      declined_by_name: null,
      declined_by_email: null,
      created_at: null,
      updated_at: null,
      assignment_id: null,
      signature_method: null,
      expires_at: null,
      signer_count: null,
      signed_count: null,
      signer_emails: null,
      signers: [],
    });
  });

  test('counts signers from the list when the summary is missing', () => {
    const result = formatDocument({
      id: 'doc_3',
      assignment: {
        id: 'asg_3',
        signers: [{ id: 's1' }, { id: 's2', email: 'b@example.com' }],
      },
    });
    expect(result.signer_count).toBe(2);
    expect(result.signed_count).toBeNull();
    expect(result.signer_emails).toBe('b@example.com');
    expect(result.signers[0]).toEqual({
      id: 's1',
      full_name: null,
      email: null,
      whatsapp_phone_number: null,
      step: null,
      verification_method: null,
      notification_method: null,
      signed: null,
      signing_url: null,
    });
  });
});

describe('formatAssignment', () => {
  test('adds the document ID, message and sender', () => {
    expect(
      assinafyFormat.assignment({
        assignment: apiAssignment,
        documentId: 'doc_1',
      })
    ).toEqual({
      document_id: 'doc_1',
      message: 'Please sign',
      sender_email: 'sender@example.com',
      assignment_id: 'asg_1',
      signature_method: 'virtual',
      expires_at: null,
      signer_count: 1,
      signed_count: 0,
      signer_emails: 'maria@example.com',
      signers: [expectedSigner],
    });
    expect(
      assinafyFormat.assignment({
        assignment: { id: 'asg_2' },
        documentId: 'doc_2',
      })
    ).toMatchObject({ message: null, sender_email: null, signers: [] });
  });
});

describe('formatSigner', () => {
  test('flatten signers', () => {
    expect(
      formatSigner({ ...apiSigner, whatsapp_phone_number: '+5548999990000' })
    ).toEqual({
      id: 'sig_1',
      full_name: 'Maria Silva',
      email: 'maria@example.com',
      whatsapp_phone_number: '+5548999990000',
      has_accepted_terms: false,
    });
    expect(formatSigner({ id: 'sig_2' })).toEqual({
      id: 'sig_2',
      full_name: null,
      email: null,
      whatsapp_phone_number: null,
      has_accepted_terms: null,
    });
  });
});

describe('formatEvent', () => {
  test('flattens the webhook envelope, its details and the document into one level', () => {
    const result = assinafyFormat.event({
      event: {
        id: 77,
        event: 'signer_signed_document',
        message: 'Maria Silva signed the document.',
        payload: { signer_full_name: 'Maria Silva', extra: { nested: true } },
        created_at: 1788273130,
        account_id: 'acc_1',
        subject: {
          type: 'Signer',
          id: 'sig_1',
          full_name: 'Maria Silva',
          email: 'maria@example.com',
        },
        object: { type: 'Document', id: 'doc_1', name: 'Contract.pdf' },
      },
      document: apiDocument,
    });
    expect(result).toMatchObject({
      event_id: 77,
      event: 'signer_signed_document',
      message: 'Maria Silva signed the document.',
      occurred_at: '2026-09-01T14:32:10.000Z',
      account_id: 'acc_1',
      actor_type: 'Signer',
      actor_id: 'sig_1',
      actor_name: 'Maria Silva',
      actor_email: 'maria@example.com',
      object_type: 'Document',
      object_id: 'doc_1',
      object_name: 'Contract.pdf',
      detail_signer_full_name: 'Maria Silva',
      detail_extra: '{"nested":true}',
      document_id: 'doc_1',
      document_status: 'pending_signature',
      document_signer_emails: 'maria@example.com',
    });
    for (const [key, value] of Object.entries(result)) {
      if (key !== 'document_signers') {
        expect(value === null || typeof value !== 'object', key).toBe(true);
      }
    }
  });

  test('keeps the same document columns, empty, for events about other things', () => {
    const result = assinafyFormat.event({
      event: {
        event: 'template_created',
        subject: { type: 'User', name: 'Ana' },
      },
      document: null,
    });
    expect(result).toMatchObject({
      event_id: null,
      event: 'template_created',
      message: null,
      occurred_at: null,
      account_id: null,
      actor_type: 'User',
      actor_name: 'Ana',
      actor_email: null,
      object_type: null,
      document_id: null,
      document_status: null,
      document_signers: [],
    });
    expect(
      Object.keys(result)
        .filter((key) => key.startsWith('document_'))
        .sort()
    ).toEqual(
      Object.keys(formatDocument(apiDocument))
        .map((key) => `document_${key}`)
        .sort()
    );
  });
});

describe('statusLabel', () => {
  test('translates known statuses and passes unknown ones through', () => {
    expect(statusLabel('certificated')).toBe('Signed');
    expect(statusLabel('archived')).toBe('archived');
    expect(statusLabel(undefined)).toBeNull();
  });
});
