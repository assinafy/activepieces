import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiDocument } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyOutputSchemas } from '../output-schemas';

export const resendSignatureRequest = createAction({
  auth: assinafyAuth,
  name: 'resend_signature_request',
  classification: 'WRITE',
  displayName: 'Resend Signature Request',
  description: 'Sends the signing invitation to a signer again.',
  audience: 'both',
  aiMetadata: {
    description:
      "Send the Assinafy signing invitation again to one signer of a document that is waiting for signatures, using the signer's original channel (email or WhatsApp). WhatsApp resends consume credits. Each call sends another notification.",
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.resend,
  props: {
    document: assinafyProps.document(
      'The document that is waiting for signatures.'
    ),
    signer: assinafyProps.documentSigner('The signer to remind.'),
  },
  async run({ auth, propsValue }) {
    const client = assinafyApi.forAuth(auth);
    const documentPath = `/documents/${encodeURIComponent(
      propsValue.document
    )}`;
    const document = await client.request<ApiDocument>({
      method: HttpMethod.GET,
      path: documentPath,
    });
    const assignmentId = document.assignment?.id;
    if (!assignmentId) {
      throw new Error(
        'This document has no signature request yet. Use Request Signatures first.'
      );
    }
    const result = await client.request<{ is_sent?: boolean }>({
      method: HttpMethod.PUT,
      path: `${documentPath}/assignments/${encodeURIComponent(
        assignmentId
      )}/signers/${encodeURIComponent(propsValue.signer)}/resend`,
    });
    return {
      sent: result.is_sent ?? null,
      document_id: document.id,
      assignment_id: assignmentId,
      signer_id: propsValue.signer,
    };
  },
});
