import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { ApiDocument, assinafyFormat } from '../common/format';
import { assinafyOutputSchemas } from '../output-schemas';

export const findDocuments = createAction({
  auth: assinafyAuth,
  name: 'find_documents',
  classification: 'SEARCH',
  displayName: 'Find Documents',
  description:
    'Finds documents by name, signer or status, most recently updated first.',
  audience: 'both',
  aiMetadata: {
    description:
      'Search Assinafy documents by partial document name, signer name or signer email, optionally filtered by status, newest update first; returns an empty list when nothing matches. Use Get Document when you already have the document ID.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.documentList,
  props: {
    search: Property.ShortText({
      displayName: 'Search',
      description:
        'Part of the document name, signer name or signer email, e.g. "contract" or "maria@example.com". Leave empty to list all documents.',
      required: false,
      placeholder: 'contract',
    }),
    status: Property.StaticDropdown({
      displayName: 'Status',
      description: 'Only return documents in this status.',
      required: false,
      options: {
        disabled: false,
        options: assinafyConstants.documentStatusOptions,
      },
    }),
    limit: Property.Number({
      displayName: 'Maximum Results',
      description: 'How many documents to return, from 1 to 100.',
      required: false,
      defaultValue: 25,
      display: 'stepper',
      min: 1,
      max: 100,
      step: 1,
    }),
  },
  async run({ auth, propsValue }) {
    const limit = Math.trunc(propsValue.limit ?? 25);
    if (limit < 1 || limit > 100) {
      throw new Error('Maximum Results must be between 1 and 100.');
    }
    const client = assinafyApi.forAuth(auth);
    const documents = await client.listAll<ApiDocument>({
      request: {
        method: HttpMethod.GET,
        path: await client.accountPath('/documents'),
        queryParams: {
          search: propsValue.search?.trim(),
          status: propsValue.status,
          sort: '-updated_at',
        },
      },
      maxItems: limit,
    });
    return documents.map(assinafyFormat.document);
  },
});
