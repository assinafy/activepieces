import { vi } from 'vitest';
import { AppConnectionType } from '@activepieces/pieces-framework';
import { HttpError, HttpMethod } from '@activepieces/pieces-common';
import { sendRequest } from './http-mock';

export { sendRequest };

export const PRODUCTION = 'https://api.assinafy.com.br/v1';
export const SANDBOX = 'https://sandbox.assinafy.com.br/v1';

export const apiKeyAuth = {
  type: AppConnectionType.CUSTOM_AUTH,
  props: {
    api_key: 'test-api-key',
    environment: 'production',
    account_id: 'acc_1',
  },
};

export const oauthAuth = {
  type: AppConnectionType.OAUTH2,
  access_token: 'test-access-token',
  data: {},
};

export function replyData(data: unknown) {
  sendRequest.mockResolvedValueOnce({
    status: 200,
    headers: {},
    body: { status: 200, message: '', data },
  });
}

export function replyPage({
  data,
  pageCount,
}: {
  data: unknown[];
  pageCount?: number;
}) {
  sendRequest.mockResolvedValueOnce({
    status: 200,
    headers:
      pageCount === undefined
        ? {}
        : { 'X-Pagination-Page-Count': String(pageCount) },
    body: { status: 200, message: '', data },
  });
}

export function replyRaw(body: unknown) {
  sendRequest.mockResolvedValueOnce({ status: 200, headers: {}, body });
}

export function replyError({
  status,
  body,
}: {
  status: number;
  body: unknown;
}) {
  sendRequest.mockRejectedValueOnce(
    new HttpError(undefined, { status, responseBody: body })
  );
}

export function sentRequests(): {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: unknown;
  responseType?: string;
  timeout?: number;
  followRedirects?: boolean;
}[] {
  return sendRequest.mock.calls.map((call) => call[0]);
}

export function memoryStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    put: async <T>(key: string, value: T) => {
      values.set(key, value);
      return value;
    },
    get: async <T>(key: string) =>
      values.has(key) ? (values.get(key) as T) : null,
    delete: async (key: string) => {
      values.delete(key);
    },
  };
}

export function context({
  props,
  extra = {},
}: {
  props: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  return {
    auth: apiKeyAuth,
    propsValue: props,
    store: memoryStore(),
    files: {
      write: vi.fn(
        async ({ fileName }: { fileName: string }) =>
          `https://files.example.com/${fileName}`
      ),
    },
    server: {
      apiUrl: 'http://localhost:3000',
      publicUrl: 'http://localhost:4200',
      token: 'test',
    },
    ...extra,
  } as never;
}

export const apiSigner = {
  resource: 'signer',
  id: 'sig_1',
  full_name: 'Maria Silva',
  email: 'maria@example.com',
  whatsapp_phone_number: null,
  has_accepted_terms: false,
};

export const apiAssignment = {
  resource: 'assignment',
  id: 'asg_1',
  sender_email: 'sender@example.com',
  method: 'virtual',
  expires_at: null,
  message: 'Please sign',
  signers: [
    {
      ...apiSigner,
      verification_method: 'Email',
      notification_methods: ['Email'],
      step: 1,
      notified: true,
      completed: false,
    },
  ],
  copy_receivers: [],
  items: [],
  summary: { signer_count: 1, completed_count: 0, signers: [] },
  signing_urls: [
    {
      signer_id: 'sig_1',
      url: 'https://api.assinafy.com.br/v1/sign/doc_1?email=maria@example.com',
    },
  ],
};

export const apiDocument = {
  resource: 'document',
  id: 'doc_1',
  account_id: 'acc_1',
  template_id: null,
  name: 'Contract.pdf',
  status: 'pending_signature',
  artifacts: {
    original:
      'https://api.assinafy.com.br/v1/documents/doc_1/download/original',
    thumbnail: 'https://api.assinafy.com.br/v1/documents/doc_1/thumbnail',
  },
  is_closed: false,
  signing_url: 'https://api.assinafy.com.br/v1/sign/doc_1',
  decline_reason: null,
  declined_by: null,
  tags: [{ id: 'tag_1', name: 'Contracts' }],
  assignment: apiAssignment,
  pages: [
    {
      id: 'page_1',
      number: 1,
      height: 2100,
      width: 1275,
      download_url: 'https://example.com/p1',
    },
  ],
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:05:00Z',
};

export const signedDocument = {
  ...apiDocument,
  id: 'doc_2',
  name: 'Signed contract.pdf',
  status: 'certificated',
  is_closed: true,
  artifacts: {
    original:
      'https://api.assinafy.com.br/v1/documents/doc_2/download/original',
    certificated:
      'https://api.assinafy.com.br/v1/documents/doc_2/download/certificated',
    'certificate-page':
      'https://api.assinafy.com.br/v1/documents/doc_2/download/certificate-page',
    bundle: 'https://api.assinafy.com.br/v1/documents/doc_2/download/bundle',
  },
  updated_at: '2026-09-01T14:00:00Z',
};

export const apiTemplate = {
  resource: 'template',
  id: 'tpl_1',
  name: 'NDA template.pdf',
  document_name: 'NDA.pdf',
  message: null,
  status: 'ready',
  pages: [
    {
      id: 'tpage_1',
      number: 1,
      fields: [
        {
          id: 'pl_1',
          field_id: 'fld_company',
          role_id: 'role_editor',
          label: 'Company name',
        },
        {
          id: 'pl_2',
          field_id: 'fld_sign',
          role_id: 'role_client',
          label: 'Signature',
        },
      ],
    },
  ],
  roles: [
    { id: 'role_editor', name: 'TemplateEditor', assignment_type: 'Editor' },
    { id: 'role_client', name: 'Client', assignment_type: 'Signer' },
  ],
  tags: [{ id: 'tag_1', name: 'Contracts' }],
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-02T10:00:00Z',
};
