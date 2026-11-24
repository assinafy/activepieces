import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiEnvelope, assinafyEnvelopes } from '../common/envelopes';
import { assinafyOutputSchemas } from '../output-schemas';

export const createEnvelope = createAction({
  auth: assinafyAuth,
  name: 'create_envelope',
  classification: 'WRITE',
  displayName: 'Create Envelope',
  description:
    'Sends up to 20 processed documents together, with one invitation per signer.',
  audience: 'both',
  aiMetadata: {
    description:
      'Send an envelope using existing signer IDs and metadata_ready documents without assignments. Requires the Envelopes feature. Each call can send invitations and spend credits; do not retry blindly.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.envelope,
  props: {
    envelope: Property.Json({
      displayName: 'Envelope',
      description:
        'Object with name, signers and documents. Each document has id and signer_ids; each signer has id and optional verification_method, notification_methods and embedded. Optional message and max_total_credits. See the README for complete payloads.',
      required: true,
    }),
  },
  async run({ auth, propsValue }) {
    const body = assinafyEnvelopes.parse(propsValue.envelope);
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiEnvelope>({
      method: HttpMethod.POST,
      path: await client.accountPath('/envelopes'),
      body,
    });
  },
});
