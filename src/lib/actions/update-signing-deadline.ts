import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiAssignment, ApiDocument, assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const updateSigningDeadline = createAction({
  auth: assinafyAuth,
  name: 'update_signing_deadline',
  classification: 'WRITE',
  displayName: 'Update Signing Deadline',
  description: 'Sets or removes the deadline for a signature request.',
  audience: 'both',
  aiMetadata: {
    description:
      'Set a new expiration date on the signature request of an Assinafy document, or remove its deadline. A new deadline must be at least one hour in the future. Repeating the same change is safe.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.signatureRequest,
  props: {
    document: assinafyProps.document(
      'The document whose signature request should get a new deadline.'
    ),
    expires_at: Property.DateTime({
      displayName: 'New Deadline',
      description:
        'At least one hour from now, e.g. 2026-12-31T18:00:00-03:00. Leave empty to remove the deadline.',
      required: false,
    }),
  },
  async run({ auth, propsValue }) {
    const expiresAt = assinafyValues.toIsoDate({
      value: propsValue.expires_at,
      label: 'New Deadline',
    });
    const client = assinafyApi.forAuth(auth);
    const documentPath = `/documents/${assinafyValues.encodeId(propsValue.document, 'Document')}`;
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
    const assignment = await client.request<ApiAssignment>({
      method: HttpMethod.PUT,
      path: `${documentPath}/assignments/${encodeURIComponent(
        assignmentId
      )}/reset-expiration`,
      body: { expires_at: expiresAt ?? null },
    });
    return assinafyFormat.assignment({ assignment, documentId: document.id });
  },
});
