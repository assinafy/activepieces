import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyProps } from '../common/props';

export const deleteDocument = createAction({
  auth: assinafyAuth,
  name: 'delete_document',
  classification: 'DESTRUCTIVE',
  displayName: 'Delete Document',
  description: 'Permanently deletes a document that has not been signed.',
  audience: 'both',
  aiMetadata: {
    description:
      'Permanently delete an Assinafy document. Only documents that are ready to send, waiting for signatures, declined, cancelled, expired or failed can be deleted; signed documents are kept. This cannot be undone and a retry fails because the document is gone.',
    idempotent: false,
  },
  props: {
    document: assinafyProps.document(
      'The document to delete. Signed documents cannot be deleted.'
    ),
  },
  async run({ auth, propsValue }) {
    await assinafyApi.forAuth(auth).request<unknown>({
      method: HttpMethod.DELETE,
      path: `/documents/${encodeURIComponent(propsValue.document)}`,
    });
    return { deleted: true, document_id: propsValue.document };
  },
});
