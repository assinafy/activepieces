import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiDocument, assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyOutputSchemas } from '../output-schemas';

export const getDocument = createAction({
  auth: assinafyAuth,
  name: 'get_document',
  classification: 'READ',
  displayName: 'Get Document',
  description: 'Gets a document with its status, signers and signing progress.',
  audience: 'both',
  aiMetadata: {
    description:
      'Fetch one Assinafy document by ID to check its status, signers and signing progress, for example before downloading the signed PDF. To search by name or signer use Find Documents.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.document,
  props: {
    document: assinafyProps.document(
      'The document to look up. You can also map a document ID from a previous step.'
    ),
  },
  async run({ auth, propsValue }) {
    const document = await assinafyApi.forAuth(auth).request<ApiDocument>({
      method: HttpMethod.GET,
      path: `/documents/${encodeURIComponent(propsValue.document)}`,
    });
    return assinafyFormat.document(document);
  },
});
