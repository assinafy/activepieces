import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const cancelEnvelope = createAction({
  auth: assinafyAuth,
  name: 'cancel_envelope',
  classification: 'DESTRUCTIVE',
  displayName: 'Cancel Envelope',
  description:
    'Cancels the envelope documents that can still be cancelled and notifies their recipients.',
  audience: 'both',
  aiMetadata: {
    description:
      'Cancel open envelope documents, notifying their owner, signers and copy recipients. Already closed documents and documents whose signing is complete remain unchanged. Repeating cancels nothing further.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.envelopeCancellation,
  props: { envelope: assinafyProps.envelope },
  async run({ auth, propsValue }) {
    const id = assinafyValues.encodeId(propsValue.envelope, 'Envelope');
    const client = assinafyApi.forAuth(auth);
    return client.list<{ id: string; status: string; cancelled: boolean }>({
      method: HttpMethod.PUT,
      path: await client.accountPath(`/envelopes/${id}/cancel`),
    });
  },
});
