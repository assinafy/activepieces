import { OutputSchema } from '@activepieces/pieces-framework';

const assignmentSignerFields: OutputSchema['fields'] = [
  { key: 'id', label: 'Signer ID' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email', format: 'email' },
  { key: 'whatsapp_phone_number', label: 'WhatsApp Number' },
  { key: 'step', label: 'Signing Order', format: 'number' },
  { key: 'verification_method', label: 'Verification Method' },
  { key: 'notification_method', label: 'Notification Method' },
  { key: 'signed', label: 'Signed', format: 'boolean' },
  { key: 'signing_url', label: 'Signing Link', format: 'url' },
];

const assignmentSummaryFields: OutputSchema['fields'] = [
  { key: 'assignment_id', label: 'Signature Request ID' },
  { key: 'signature_method', label: 'Signature Method' },
  { key: 'expires_at', label: 'Deadline', format: 'datetime' },
  { key: 'signer_count', label: 'Signer Count', format: 'number' },
  { key: 'signed_count', label: 'Signed Count', format: 'number' },
  { key: 'signer_emails', label: 'Signer Emails' },
  {
    key: 'signers',
    label: 'Signers',
    labelKey: 'full_name',
    listItems: assignmentSignerFields,
  },
];

const documentFields: OutputSchema['fields'] = [
  { key: 'id', label: 'Document ID' },
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'status_label', label: 'Status Label' },
  { key: 'is_closed', label: 'Closed', format: 'boolean' },
  { key: 'account_id', label: 'Workspace ID' },
  { key: 'template_id', label: 'Template ID' },
  { key: 'page_count', label: 'Page Count', format: 'number' },
  { key: 'tags', label: 'Tags' },
  { key: 'available_files', label: 'Available Files' },
  { key: 'signing_url', label: 'Signing Link', format: 'url' },
  { key: 'decline_reason', label: 'Decline Reason' },
  { key: 'declined_by_name', label: 'Declined By' },
  { key: 'declined_by_email', label: 'Declined By Email', format: 'email' },
  { key: 'created_at', label: 'Created At', format: 'datetime' },
  { key: 'updated_at', label: 'Updated At', format: 'datetime' },
  ...assignmentSummaryFields,
];

const signerFields: OutputSchema['fields'] = [
  { key: 'id', label: 'Signer ID' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email', format: 'email' },
  { key: 'whatsapp_phone_number', label: 'WhatsApp Number' },
  { key: 'has_accepted_terms', label: 'Accepted Terms', format: 'boolean' },
];

export const assinafyOutputSchemas = {
  document: { fields: documentFields },
  documentList: {
    itemLabel: '{name}',
    fields: [
      {
        key: 'documents',
        label: 'Documents',
        value: '',
        listItems: documentFields,
      },
    ],
  },
  signer: { fields: signerFields },
  signerList: {
    itemLabel: '{full_name}',
    fields: [
      { key: 'signers', label: 'Signers', value: '', listItems: signerFields },
    ],
  },
  signatureRequest: {
    fields: [
      { key: 'document_id', label: 'Document ID' },
      { key: 'message', label: 'Message' },
      { key: 'sender_email', label: 'Sender Email', format: 'email' },
      ...assignmentSummaryFields,
    ],
  },
  download: {
    fields: [
      { key: 'file', label: 'File', format: 'url' },
      { key: 'file_name', label: 'File Name' },
      { key: 'file_type', label: 'File Type' },
      { key: 'size_bytes', label: 'Size', format: 'filesize' },
      { key: 'document_id', label: 'Document ID' },
      { key: 'document_name', label: 'Document Name' },
      { key: 'document_status', label: 'Document Status' },
    ],
  },
  resend: {
    fields: [
      { key: 'sent', label: 'Sent', format: 'boolean' },
      { key: 'document_id', label: 'Document ID' },
      { key: 'assignment_id', label: 'Signature Request ID' },
      { key: 'signer_id', label: 'Signer ID' },
    ],
  },
} satisfies Record<string, OutputSchema>;
