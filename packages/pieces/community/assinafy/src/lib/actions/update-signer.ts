import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiSigner, assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const updateSigner = createAction({
  auth: assinafyAuth,
  name: 'update_signer',
  classification: 'WRITE',
  displayName: 'Update Signer',
  description:
    'Updates the name, contact details or CPF/CNPJ of a saved signer.',
  audience: 'both',
  aiMetadata: {
    description:
      'Update a saved Assinafy signer; only the fields you fill in change. Email and WhatsApp cannot change while the signer has verified that channel on a document still being signed, and changing an unverified channel invalidates invitations already sent.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.signer,
  props: {
    signer: assinafyProps.signer(
      'The signer to update. You can also map a signer ID from a previous step.'
    ),
    full_name: Property.ShortText({
      displayName: 'Full Name',
      description: 'Leave empty to keep the current name.',
      required: false,
      placeholder: 'Maria Silva',
    }),
    email: Property.ShortText({
      displayName: 'Email',
      description: 'Leave empty to keep the current email.',
      required: false,
      placeholder: 'maria@example.com',
    }),
    whatsapp: Property.ShortText({
      displayName: 'WhatsApp Number',
      description:
        'International format, e.g. +5548999990000. Leave empty to keep the current number.',
      required: false,
      placeholder: '+5548999990000',
    }),
    government_id: Property.ShortText({
      displayName: 'CPF or CNPJ',
      description: 'Leave empty to keep the current value.',
      required: false,
      placeholder: '390.533.447-05',
    }),
  },
  async run({ auth, propsValue }) {
    const changes = assinafyValues.compact({
      full_name: propsValue.full_name?.trim(),
      email: propsValue.email?.trim(),
      whatsapp_phone_number: propsValue.whatsapp?.trim(),
      government_id: propsValue.government_id?.trim(),
    });
    if (Object.keys(changes).length === 0) {
      throw new Error('Fill in at least one field to update.');
    }
    const governmentId = propsValue.government_id?.trim();
    if (governmentId && !assinafyValues.isGovernmentId(governmentId)) {
      throw new Error('A CPF has 11 digits and a CNPJ has 14 digits.');
    }
    const client = assinafyApi.forAuth(auth);
    const signer = await client.request<ApiSigner>({
      method: HttpMethod.PUT,
      path: await client.accountPath(
        `/signers/${encodeURIComponent(propsValue.signer)}`
      ),
      body: changes,
    });
    return assinafyFormat.signer(signer);
  },
});
