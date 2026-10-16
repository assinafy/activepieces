function toOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ label, value }));
}

const documentStatusLabels: Record<string, string> = {
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  metadata_processing: 'Processing',
  metadata_ready: 'Ready to send',
  pending_signature: 'Waiting for signatures',
  pending_identity_review: 'Waiting for identity review',
  certificating: 'Signed, certificate being generated',
  certificated: 'Signed',
  rejected_by_signer: 'Declined by a signer',
  rejected_by_user: 'Cancelled',
  expired: 'Expired',
  failed: 'Processing failed',
};

const downloadableFiles: Record<string, { label: string; extension: string }> =
  {
    certificated: {
      label: 'Signed PDF (with signature certificate)',
      extension: 'pdf',
    },
    original: { label: 'Original PDF', extension: 'pdf' },
    'certificate-page': {
      label: 'Signature certificate page only',
      extension: 'pdf',
    },
    bundle: { label: 'All files (ZIP)', extension: 'zip' },
    pades: {
      label: 'Digitally signed PDF (PAdES, ICP-Brasil certificates only)',
      extension: 'pdf',
    },
  };

const signerVerificationMethods: Record<
  string,
  {
    label: string;
    verification_method: string;
    notification_method: 'Email' | 'Whatsapp';
    certificate: boolean;
  }
> = {
  email: {
    label: 'Email code (free)',
    verification_method: 'Email',
    notification_method: 'Email',
    certificate: false,
  },
  whatsapp: {
    label: 'WhatsApp code (paid plans, 0.45 credit per signer)',
    verification_method: 'Whatsapp',
    notification_method: 'Whatsapp',
    certificate: false,
  },
  certificate_email: {
    label:
      'ICP-Brasil digital certificate, invited by email (0.5 credit per signer)',
    verification_method: 'DigitalCertificate',
    notification_method: 'Email',
    certificate: true,
  },
  certificate_whatsapp: {
    label:
      'ICP-Brasil digital certificate, invited by WhatsApp (0.95 credit per signer)',
    verification_method: 'DigitalCertificate',
    notification_method: 'Whatsapp',
    certificate: true,
  },
  biometric_email: {
    label: 'Biometric identity verification, invited by email (paid feature)',
    verification_method: 'IdDocumentFaceMatchBasic',
    notification_method: 'Email',
    certificate: false,
  },
  biometric_whatsapp: {
    label:
      'Biometric identity verification, invited by WhatsApp (paid feature)',
    verification_method: 'IdDocumentFaceMatchBasic',
    notification_method: 'Whatsapp',
    certificate: false,
  },
};

const webhookEventLabels: Record<string, string> = {
  document_ready: 'Document signed by all signers',
  signer_signed_document: 'Signer signed the document',
  signer_rejected_document: 'Signer declined the document',
  user_rejected_document: 'Document cancelled by a workspace user',
  signer_viewed_document: 'Signer opened the document',
  signature_requested: 'Signature requested from a signer',
  assignment_created: 'Signature request created',
  document_uploaded: 'Document uploaded',
  document_metadata_ready: 'Document processed and ready',
  document_prepared: 'Document fields prepared',
  document_processing_failed: 'Document processing failed',
  signer_created: 'Signer created',
  signer_email_verified: 'Signer verified their email',
  signer_whatsapp_verified: 'Signer verified their WhatsApp',
  signer_data_confirmed: 'Signer confirmed their data',
  signer_identity_verified: 'Signer identity verified',
  signer_identity_verification_failed: 'Signer identity verification failed',
  signer_identity_review_required: 'Signer identity review required',
  signer_identity_review_approved: 'Signer identity review approved',
  signer_identity_review_rejected: 'Signer identity review rejected',
  template_created: 'Template created',
  template_processed: 'Template processed and ready',
  template_processing_failed: 'Template processing failed',
};

export const assinafyConstants = {
  documentStatusLabels,
  documentStatusOptions: toOptions(documentStatusLabels),
  downloadableFiles,
  downloadableFileOptions: Object.entries(downloadableFiles).map(
    ([value, { label }]) => ({ label, value })
  ),
  signerVerificationMethods,
  signerVerificationOptions: Object.entries(signerVerificationMethods).map(
    ([value, { label }]) => ({
      label,
      value,
    })
  ),
  webhookEventLabels,
  webhookEventOptions: toOptions(webhookEventLabels),
  maxUploadBytes: 25 * 1024 * 1024,
  pageSize: 50,
  requestTimeoutMs: 120 * 1000,
  triggerRequestTimeoutMs: 15 * 1000,
};
