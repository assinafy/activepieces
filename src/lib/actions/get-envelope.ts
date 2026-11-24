import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiEnvelope } from '../common/envelopes';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const getEnvelope = createAction({
  auth: assinafyAuth,
  name: 'get_envelope',
  classification: 'READ',
  displayName: 'Get Envelope',
  description:
    'Gets an envelope with its documents, signers, status counts and signing links.',
  audience: 'both',
  aiMetadata: {
    description:
      'Read an envelope by its ID. Each document keeps its own status; an envelope has status counts instead of a single status.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.envelope,
  props: { envelope: assinafyProps.envelope },
  async run({ auth, propsValue }) {
    const id = assinafyValues.encodeId(propsValue.envelope, 'Envelope');
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiEnvelope>({
      method: HttpMethod.GET,
      path: await client.accountPath(`/envelopes/${id}`),
    });
  },
});
