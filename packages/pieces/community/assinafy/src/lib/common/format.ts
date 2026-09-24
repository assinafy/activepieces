import { assinafyConstants } from './constants';
import { assinafyValues } from './values';

function formatDocument(document: ApiDocument) {
  return {
    id: document.id,
    name: document.name ?? null,
    status: document.status ?? null,
    status_label: statusLabel(document.status),
    is_closed: document.is_closed ?? null,
    account_id: document.account_id ?? null,
    template_id: document.template_id ?? null,
    page_count: document.pages ? document.pages.length : null,
    tags: joinNames(document.tags),
    available_files: availableFiles(document),
    signing_url: document.signing_url ?? null,
    decline_reason: document.decline_reason ?? null,
    declined_by_name: document.declined_by?.full_name ?? null,
    declined_by_email: document.declined_by?.email ?? null,
    created_at: assinafyValues.toIsoTimestamp(document.created_at),
    updated_at: assinafyValues.toIsoTimestamp(document.updated_at),
    ...formatAssignmentSummary(document.assignment),
  };
}

function formatAssignment({
  assignment,
  documentId,
}: {
  assignment: ApiAssignment;
  documentId: string;
}) {
  return {
    document_id: documentId,
    message: assignment.message ?? null,
    sender_email: assignment.sender_email ?? null,
    ...formatAssignmentSummary(assignment),
  };
}

function formatAssignmentSummary(assignment: ApiAssignment | null | undefined) {
  const signers = assignment?.signers ?? [];
  const signingUrls = new Map(
    (assignment?.signing_urls ?? []).map((entry) => [
      entry.signer_id,
      entry.url,
    ])
  );
  return {
    assignment_id: assignment?.id ?? null,
    signature_method: assignment?.method ?? null,
    expires_at: assinafyValues.toIsoTimestamp(assignment?.expires_at),
    signer_count:
      assignment?.summary?.signer_count ??
      (assignment?.signers ? signers.length : null),
    signed_count: assignment?.summary?.completed_count ?? null,
    signer_emails: joinValues(signers.map((signer) => signer.email)),
    signers: signers.map((signer) => ({
      id: signer.id,
      full_name: signer.full_name ?? null,
      email: signer.email ?? null,
      whatsapp_phone_number: signer.whatsapp_phone_number ?? null,
      step: signer.step ?? null,
      verification_method: signer.verification_method ?? null,
      notification_method: signer.notification_methods?.[0] ?? null,
      signed: signer.completed ?? null,
      signing_url: signingUrls.get(signer.id) ?? null,
    })),
  };
}

function formatSigner(signer: ApiSigner) {
  return {
    id: signer.id,
    full_name: signer.full_name ?? null,
    email: signer.email ?? null,
    whatsapp_phone_number: signer.whatsapp_phone_number ?? null,
    has_accepted_terms: signer.has_accepted_terms ?? null,
  };
}

function formatEvent({
  event,
  document,
}: {
  event: Record<string, unknown>;
  document: ApiDocument | null;
}) {
  const subject = assinafyValues.isRecord(event['subject'])
    ? event['subject']
    : {};
  const object = assinafyValues.isRecord(event['object'])
    ? event['object']
    : {};
  const details = assinafyValues.isRecord(event['payload'])
    ? event['payload']
    : {};
  const createdAt = event['created_at'];
  const documentFields = document ? formatDocument(document) : EMPTY_DOCUMENT;
  return {
    event_id: event['id'] ?? null,
    event: event['event'] ?? null,
    message: event['message'] ?? null,
    occurred_at:
      typeof createdAt === 'number'
        ? new Date(createdAt * 1000).toISOString()
        : null,
    account_id: event['account_id'] ?? null,
    actor_type: subject['type'] ?? null,
    actor_id: subject['id'] ?? null,
    actor_name: subject['full_name'] ?? subject['name'] ?? null,
    actor_email: subject['email'] ?? null,
    object_type: object['type'] ?? null,
    object_id: object['id'] ?? null,
    object_name: object['full_name'] ?? object['name'] ?? null,
    ...Object.fromEntries(
      Object.entries(details).map(([key, value]) => [
        `detail_${key}`,
        value === null || typeof value !== 'object'
          ? value
          : JSON.stringify(value),
      ])
    ),
    ...Object.fromEntries(
      Object.entries(documentFields).map(([key, value]) => [
        `document_${key}`,
        value,
      ])
    ),
  };
}

function statusLabel(status: string | undefined | null): string | null {
  if (!status) {
    return null;
  }
  return assinafyConstants.documentStatusLabels[status] ?? status;
}

function availableFiles(document: ApiDocument): string | null {
  if (!document.artifacts) {
    return null;
  }
  return Object.keys(document.artifacts)
    .filter((name) => name in assinafyConstants.downloadableFiles)
    .join(', ');
}

function joinNames(items: { name?: string }[] | undefined): string | null {
  return items
    ? items
        .map((item) => item.name)
        .filter(Boolean)
        .join(', ')
    : null;
}

function joinValues(values: (string | null | undefined)[]): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length ? present.join(', ') : null;
}

const EMPTY_DOCUMENT: Record<string, unknown> = Object.fromEntries(
  Object.entries(formatDocument({ id: '' })).map(([key, value]) => [
    key,
    Array.isArray(value) ? [] : null,
  ])
);

export const assinafyFormat = {
  assignment: formatAssignment,
  document: formatDocument,
  event: formatEvent,
  signer: formatSigner,
  statusLabel,
};

export type ApiSigner = {
  id: string;
  full_name?: string;
  email?: string | null;
  whatsapp_phone_number?: string | null;
  has_accepted_terms?: boolean;
};

export type ApiAssignment = {
  id: string;
  method?: string;
  expires_at?: string | number | null;
  message?: string | null;
  sender_email?: string;
  signers?: (ApiSigner & {
    verification_method?: string | null;
    notification_methods?: string[] | null;
    step?: number | null;
    completed?: boolean | null;
  })[];
  summary?: { signer_count?: number; completed_count?: number };
  signing_urls?: { signer_id: string; url: string }[];
  copy_receivers?: unknown[];
};

export type ApiDocument = {
  id: string;
  account_id?: string;
  template_id?: string | null;
  name?: string;
  status?: string;
  artifacts?: Record<string, string>;
  is_closed?: boolean;
  signing_url?: string;
  decline_reason?: string | null;
  declined_by?: ApiSigner | null;
  tags?: { id: string; name?: string }[];
  assignment?: ApiAssignment | null;
  pages?: unknown[];
  created_at?: string | number;
  updated_at?: string | number;
};

export type ApiTemplate = {
  id: string;
  name?: string;
  document_name?: string | null;
  status?: string;
  message?: string | null;
  roles?: { id: string; name?: string; assignment_type?: string }[];
  pages?: {
    fields?: { field_id: string; role_id: string; label?: string }[];
  }[];
  tags?: { id: string; name?: string }[];
  created_at?: string;
  updated_at?: string;
};
