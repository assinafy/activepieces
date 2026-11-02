import { OutputSchema } from '@activepieces/pieces-framework';

const assignmentSignerFields: OutputSchema['fields'] = [
  { key: 'id', label: 'Signer ID' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email', format: 'email' },
  { key: 'whatsapp_phone_number', label: 'WhatsApp Number' },
  { key: 'step', label: 'Signing Order', format: 'number' },
  { key: 'verification_method', label: 'Verification Method' },
  { key: 'notification_method', label: 'Notification Method' },
  {
    key: 'identity_verification_status',
    label: 'Identity Verification Status',
  },
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
  { key: 'has_contract', label: 'Has Contract', format: 'boolean' },
  { key: 'account_id', label: 'Workspace ID' },
  { key: 'template_id', label: 'Template ID' },
  { key: 'page_count', label: 'Page Count', format: 'number' },
  { key: 'tags', label: 'Tags' },
  { key: 'available_files', label: 'Available Files' },
  { key: 'signing_url', label: 'Signing Link', format: 'url' },
  { key: 'verification_code', label: 'Verification Code' },
  { key: 'verification_url', label: 'Verification Link', format: 'url' },
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

const amendmentFields: OutputSchema['fields'] = [
  {
    key: 'resource',
    label: 'Resource Type',
  },
  {
    key: 'document_id',
    label: 'Document ID',
  },
  {
    key: 'document_name',
    label: 'Document Name',
  },
  {
    key: 'parent_document_id',
    label: 'Parent Document ID',
  },
  {
    key: 'relation_type',
    label: 'Relation Type',
  },
  {
    key: 'number',
    label: 'Amendment Number',
    format: 'number',
  },
  {
    key: 'status',
    label: 'Status',
  },
  {
    key: 'document_status',
    label: 'Document Status',
  },
  {
    key: 'apply_error',
    label: 'Apply Error',
  },
  {
    key: 'currency',
    label: 'Currency',
  },
  {
    key: 'terms',
    label: 'Terms',
  },
  {
    key: 'changes',
    label: 'Changes',
  },
  {
    key: 'applied_at',
    label: 'Applied At',
    format: 'datetime',
  },
  {
    key: 'created_at',
    label: 'Created At',
    format: 'datetime',
  },
  {
    key: 'updated_at',
    label: 'Updated At',
    format: 'datetime',
  },
];

const contractFields: OutputSchema['fields'] = [
  {
    key: 'resource',
    label: 'Resource Type',
  },
  {
    key: 'document_id',
    label: 'Document ID',
  },
  {
    key: 'status',
    label: 'Status',
  },
  {
    key: 'counterparty_name',
    label: 'Counterparty Name',
  },
  {
    key: 'counterparty_taxpayer_id',
    label: 'Counterparty CPF/CNPJ',
  },
  {
    key: 'value',
    label: 'Value',
    format: 'number',
  },
  {
    key: 'currency',
    label: 'Currency',
  },
  {
    key: 'start_date',
    label: 'Start Date',
  },
  {
    key: 'end_date',
    label: 'End Date',
  },
  {
    key: 'auto_renew',
    label: 'Auto Renew',
    format: 'boolean',
  },
  {
    key: 'renewal_term_months',
    label: 'Renewal Term Months',
    format: 'number',
  },
  {
    key: 'notice_period_days',
    label: 'Notice Period Days',
    format: 'number',
  },
  {
    key: 'term',
    label: 'Term',
    format: 'number',
  },
  {
    key: 'owner_id',
    label: 'Owner ID',
  },
  {
    key: 'metadata',
    label: 'Metadata',
  },
  {
    key: 'external_references',
    label: 'External References',
    listItems: [
      {
        key: 'system',
        label: 'System',
      },
      {
        key: 'id',
        label: 'External ID',
      },
    ],
  },
  {
    key: 'document',
    label: 'Document',
  },
  {
    key: 'amendments',
    label: 'Amendments',
    listItems: amendmentFields,
  },
  {
    key: 'created_at',
    label: 'Created At',
    format: 'datetime',
  },
  {
    key: 'updated_at',
    label: 'Updated At',
    format: 'datetime',
  },
];

const eventFields: OutputSchema['fields'] = [
  {
    key: 'event_id',
    label: 'Event Id',
  },
  {
    key: 'event',
    label: 'Event',
  },
  {
    key: 'message',
    label: 'Message',
  },
  {
    key: 'occurred_at',
    label: 'Occurred At',
    format: 'datetime',
  },
  {
    key: 'account_id',
    label: 'Account Id',
  },
  {
    key: 'actor_type',
    label: 'Actor Type',
  },
  {
    key: 'actor_id',
    label: 'Actor Id',
  },
  {
    key: 'actor_name',
    label: 'Actor Name',
  },
  {
    key: 'actor_email',
    label: 'Actor Email',
    format: 'email',
  },
  {
    key: 'object_type',
    label: 'Object Type',
  },
  {
    key: 'object_id',
    label: 'Object Id',
  },
  {
    key: 'object_name',
    label: 'Object Name',
  },
  {
    key: 'detail_changed',
    label: 'Changed',
  },
  {
    key: 'detail_changes',
    label: 'Changes',
  },
  {
    key: 'detail_days_before',
    label: 'Days Before',
    format: 'number',
  },
  {
    key: 'detail_document_id',
    label: 'Document Id',
  },
  {
    key: 'detail_end_date',
    label: 'End Date',
  },
  {
    key: 'detail_error_message',
    label: 'Error Message',
  },
  {
    key: 'detail_evidence',
    label: 'Evidence',
  },
  {
    key: 'detail_note',
    label: 'Note',
  },
  {
    key: 'detail_notification_method',
    label: 'Notification Method',
  },
  {
    key: 'detail_number',
    label: 'Number',
    format: 'number',
  },
  {
    key: 'detail_parent_document_id',
    label: 'Parent Document Id',
  },
  {
    key: 'detail_reason',
    label: 'Reason',
  },
  {
    key: 'detail_reason_codes',
    label: 'Reason Codes',
  },
  {
    key: 'detail_relation_type',
    label: 'Relation Type',
  },
  {
    key: 'detail_reviewer_id',
    label: 'Reviewer Id',
  },
  {
    key: 'detail_reviewer_name',
    label: 'Reviewer Name',
  },
  {
    key: 'detail_signer_email',
    label: 'Signer Email',
    format: 'email',
  },
  {
    key: 'detail_signer_full_name',
    label: 'Signer Full Name',
  },
  {
    key: 'detail_signer_whatsapp_phone_number',
    label: 'Signer Whatsapp Phone Number',
  },
  {
    key: 'detail_terms',
    label: 'Terms',
  },
  {
    key: 'detail_user_email',
    label: 'User Email',
    format: 'email',
  },
  {
    key: 'detail_user_name',
    label: 'User Name',
  },
  {
    key: 'detail_user_telephone',
    label: 'User Telephone',
  },
  {
    key: 'detail_verification_method',
    label: 'Verification Method',
  },
];

export const assinafyOutputSchemas = {
  event: {
    fields: [
      ...eventFields,
      ...documentFields.map((field) => ({
        ...field,
        key: `document_${field.key}`,
        label: `Document: ${field.label}`,
      })),
    ],
  },
  contract: {
    fields: [
      ...contractFields,
      ...amendmentFields.filter(
        (field) =>
          !contractFields.some((contract) => contract.key === field.key)
      ),
    ],
  },
  contractList: {
    itemLabel: '{document_id}',
    fields: [
      {
        key: 'contracts',
        label: 'Contracts',
        value: '',
        listItems: contractFields,
      },
    ],
  },
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
