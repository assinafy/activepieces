import { Property, tryCatch } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { AssinafyAuthValue, AssinafyClient, assinafyApi } from './client';
import { assinafyConstants } from './constants';
import { ApiDocument, ApiSigner, ApiTemplate, assinafyFormat } from './format';

async function loadOptions({
  auth,
  what,
  load,
}: {
  auth: AssinafyAuthValue | undefined;
  what: string;
  load: (client: AssinafyClient) => Promise<{ label: string; value: string }[]>;
}) {
  if (!auth) {
    return {
      disabled: true,
      options: [],
      placeholder: 'Connect your Assinafy account first.',
    };
  }
  const { data: options, error } = await tryCatch(() =>
    load(assinafyApi.forAuth(auth))
  );
  if (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      disabled: true,
      options: [],
      placeholder: `Could not load ${what}: ${reason}`,
    };
  }
  return {
    disabled: false,
    options,
    placeholder: options.length ? undefined : `No ${what} found.`,
  };
}

function signerLabel(signer: ApiSigner): string {
  const contact = signer.email ?? signer.whatsapp_phone_number;
  return contact
    ? `${signer.full_name ?? signer.id} (${contact})`
    : signer.full_name ?? signer.id;
}

function documentDropdown(description: string) {
  return Property.Dropdown({
    auth: assinafyAuth,
    displayName: 'Document',
    description,
    required: true,
    refreshers: [],
    refreshOnSearch: true,
    options: async ({ auth }, { searchValue }) =>
      loadOptions({
        auth,
        what: 'documents',
        load: async (client) => {
          const documents = await client.list<ApiDocument>({
            method: HttpMethod.GET,
            path: await client.accountPath('/documents'),
            queryParams: {
              search: searchValue,
              sort: '-updated_at',
              'per-page': assinafyConstants.pageSize,
            },
          });
          return documents.map((document) => ({
            label: `${document.name ?? document.id} (${
              assinafyFormat.statusLabel(document.status) ?? 'unknown status'
            })`,
            value: document.id,
          }));
        },
      }),
  });
}

function templateDropdown(description: string) {
  return Property.Dropdown({
    auth: assinafyAuth,
    displayName: 'Template',
    description,
    required: true,
    refreshers: [],
    refreshOnSearch: true,
    options: async ({ auth }, { searchValue }) =>
      loadOptions({
        auth,
        what: 'templates',
        load: async (client) => {
          const templates = await client.list<ApiTemplate>({
            method: HttpMethod.GET,
            path: await client.accountPath('/templates'),
            queryParams: {
              search: searchValue,
              'per-page': assinafyConstants.pageSize,
            },
          });
          return templates.map((template) => ({
            label: template.name ?? template.document_name ?? template.id,
            value: template.id,
          }));
        },
      }),
  });
}

function signerDropdown(description: string) {
  return Property.Dropdown({
    auth: assinafyAuth,
    displayName: 'Signer',
    description,
    required: true,
    refreshers: [],
    refreshOnSearch: true,
    options: async ({ auth }, { searchValue }) =>
      loadOptions({
        auth,
        what: 'signers',
        load: async (client) => {
          const signers = await client.list<ApiSigner>({
            method: HttpMethod.GET,
            path: await client.accountPath('/signers'),
            queryParams: {
              search: searchValue,
              'per-page': assinafyConstants.pageSize,
            },
          });
          return signers.map((signer) => ({
            label: signerLabel(signer),
            value: signer.id,
          }));
        },
      }),
  });
}

function documentSignerDropdown(description: string) {
  return Property.Dropdown({
    auth: assinafyAuth,
    displayName: 'Signer',
    description,
    required: true,
    refreshers: ['document'],
    options: async ({ auth, document }) => {
      if (auth && typeof document !== 'string') {
        return {
          disabled: true,
          options: [],
          placeholder: 'Select a document first.',
        };
      }
      return loadOptions({
        auth,
        what: 'signers on this document',
        load: async (client) => {
          const found = await client.request<ApiDocument>({
            method: HttpMethod.GET,
            path: `/documents/${encodeURIComponent(String(document))}`,
          });
          return (found.assignment?.signers ?? []).map((signer) => ({
            label: signerLabel(signer),
            value: signer.id,
          }));
        },
      });
    },
  });
}

export const assinafyProps = {
  document: documentDropdown,
  documentSigner: documentSignerDropdown,
  signer: signerDropdown,
  template: templateDropdown,
};
