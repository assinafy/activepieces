import { assinafyFormat } from './format';

const SAMPLE_DOCUMENT = {
  id: '615601fab04c0a3147bb1246',
  name: 'Service agreement.pdf',
  status: 'certificated',
  status_label: 'Signed',
  is_closed: true,
  has_contract: null,
  account_id: 'd199996981dbd199996981db',
  template_id: null,
  page_count: 2,
  tags: 'Contracts',
  available_files: 'original, certificated, certificate-page, bundle',
  signing_url: 'https://api.assinafy.com.br/v1/sign/615601fab04c0a3147bb1246',
  decline_reason: null,
  declined_by_name: null,
  declined_by_email: null,
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T14:32:10Z',
  assignment_id: '615606ef81d199996981dbce',
  signature_method: 'virtual',
  expires_at: null,
  signer_count: 1,
  signed_count: 1,
  signer_emails: 'maria@example.com',
  signers: [
    {
      id: '62d6ee35c7741ca4006b9e11',
      full_name: 'Maria Silva',
      email: 'maria@example.com',
      whatsapp_phone_number: null,
      step: 1,
      verification_method: 'Email',
      notification_method: 'Email',
      identity_verification_status: null,
      signed: true,
      signing_url: null,
    },
  ],
};

const signer = {
  type: 'Signer',
  id: 'signer_example',
  full_name: 'Maria Silva',
  email: 'maria@example.com',
};
const user = {
  type: 'User',
  id: 'user_example',
  name: 'Ana Costa',
  email: 'ana@example.com',
};
const account = {
  type: 'Account',
  id: SAMPLE_DOCUMENT.account_id,
  name: 'Example Workspace',
};
const signerName = { signer_full_name: signer.full_name };
const userName = { user_name: user.name };
const endDate = { end_date: '2027-10-31' };
const reasonCodes = ['NAME_MISMATCH', 'LIVENESS_UNCERTAIN'];
const reviewer = { reviewer_id: user.id, reviewer_name: user.name };
const eventPayloads: Record<string, Record<string, unknown>> = {
  assignment_created: {
    ...userName,
    user_email: user.email,
    user_telephone: '+5548999990000',
  },
  signature_requested: {
    ...signerName,
    signer_email: signer.email,
    signer_whatsapp_phone_number: null,
    notification_method: 'Email',
  },
  signer_created: signerName,
  signer_email_verified: { ...signerName, signer_email: signer.email },
  signer_whatsapp_verified: {
    ...signerName,
    signer_whatsapp_phone_number: '+5548999990000',
  },
  signer_data_confirmed: {
    ...signerName,
    signer_email: signer.email,
    signer_whatsapp_phone_number: null,
    verification_method: 'Email',
  },
  signer_viewed_document: signerName,
  signer_signed_document: signerName,
  signer_rejected_document: signerName,
  signer_identity_verified: {
    ...signerName,
    evidence: {
      document_type: 'CNH',
      document_name: 'MARIA SILVA',
      cpf_match: true,
      name_similarity: 1,
      checks: [{ name: 'face_match', result: 'pass', score: 0.94 }],
      evidence_sha256: 'a'.repeat(64),
    },
  },
  signer_identity_verification_failed: {
    ...signerName,
    reason: 'provider_declined',
  },
  signer_identity_review_required: { ...signerName, reason_codes: reasonCodes },
  signer_identity_review_approved: {
    ...signerName,
    ...reviewer,
    reason_codes: reasonCodes,
  },
  signer_identity_review_rejected: {
    ...signerName,
    ...reviewer,
    note: 'The document photo does not match the recipient.',
  },
  user_rejected_document: userName,
  document_processing_failed: { error_message: 'The PDF could not be read.' },
  template_processing_failed: { error_message: 'The PDF could not be read.' },
  document_contract_updated: {
    ...userName,
    ...endDate,
    changed: ['value', 'end_date', 'term'],
  },
  document_contract_renewal_notice: endDate,
  document_contract_expiring: { ...endDate, days_before: 30 },
  document_contract_expired: { ...endDate, changed: ['status'] },
  document_contract_renewed: {
    ...userName,
    ...endDate,
    changed: ['end_date', 'term'],
  },
  document_contract_terminated: {
    ...userName,
    ...endDate,
    reason: 'Service completed.',
    changed: ['status'],
  },
  document_contract_amended: {
    ...endDate,
    document_id: 'document_amendment',
    relation_type: 'amendment',
    number: 1,
    changes: { value: { from: 10000, to: 12000 } },
    changed: ['value'],
  },
  document_contract_amendment_updated: {
    ...userName,
    parent_document_id: 'document_parent',
    relation_type: 'amendment',
    terms: { value: 12000, ...endDate },
    changed: ['parent_document_id', 'relation_type', 'terms'],
  },
};

function sampleEvent(event: string) {
  const subject = [
    'document_ready',
    'document_processing_failed',
    'template_processing_failed',
    'document_contract_renewal_notice',
    'document_contract_expiring',
    'document_contract_expired',
    'document_contract_amended',
  ].includes(event)
    ? account
    : event.startsWith('signer_') && event !== 'signer_created'
      ? signer
      : user;
  const object = event.startsWith('template_')
    ? { type: 'Template', id: 'template_example', name: 'Service agreement' }
    : event === 'signer_created'
      ? signer
      : {
          type: 'Document',
          id: SAMPLE_DOCUMENT.id,
          name: SAMPLE_DOCUMENT.name,
          account_id: SAMPLE_DOCUMENT.account_id,
        };
  const output = assinafyFormat.event({
    event: {
      id: 4821,
      event,
      message: null,
      created_at: '2026-09-01T14:32:10.000Z',
      account_id: SAMPLE_DOCUMENT.account_id,
      subject,
      object,
      payload: eventPayloads[event] ?? null,
    },
    document: object.type === 'Document' ? object : null,
  });
  return event === 'document_ready' || event.startsWith('document_contract_')
    ? {
        ...output,
        ...Object.fromEntries(
          Object.entries(SAMPLE_DOCUMENT).map(([key, value]) => [
            `document_${key}`,
            value,
          ])
        ),
      }
    : output;
}

export const assinafySample = {
  document: SAMPLE_DOCUMENT,
  event: sampleEvent,
};
