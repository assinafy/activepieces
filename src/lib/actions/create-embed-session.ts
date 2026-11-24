import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiDocument } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const createEmbedSession = createAction({
  auth: assinafyAuth,
  name: 'create_embed_session',
  classification: 'WRITE',
  displayName: 'Create Embed Session',
  description:
    'Creates a single-use signing URL for an embedded signer, valid for five minutes.',
  audience: 'both',
  aiMetadata: {
    description:
      'Mint an embed session for a signer requested with embedded=true and Email or WhatsApp verification. Requires the Embed plan feature and an allowed origin configured in Assinafy using an API key. Load the returned URL in an iframe within five minutes; mint a fresh one each time the signer opens the page.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.embedSession,
  props: {
    document: assinafyProps.document(
      'The document waiting for this embedded signer.'
    ),
    signer: assinafyProps.documentSigner(
      'The embedded signer who is opening your application.'
    ),
  },
  async run({ auth, propsValue }) {
    const documentId = assinafyValues.encodeId(propsValue.document, 'Document');
    const signerId = assinafyValues.encodeId(propsValue.signer, 'Signer');
    const client = assinafyApi.forAuth(auth);
    const document = await client.request<ApiDocument>({
      method: HttpMethod.GET,
      path: `/documents/${documentId}`,
    });
    if (!document.assignment?.id)
      throw new Error(
        'This document has no signature request yet. Use Request Signatures first.'
      );
    return client.request<{ url: string; expires_at: string }>({
      method: HttpMethod.POST,
      path: `/documents/${documentId}/assignments/${encodeURIComponent(document.assignment.id)}/signers/${signerId}/embed-sessions`,
    });
  },
});
