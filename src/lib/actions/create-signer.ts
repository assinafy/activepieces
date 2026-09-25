import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiSigner, assinafyFormat } from '../common/format';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const createSigner = createAction({
  auth: assinafyAuth,
  name: 'create_signer',
  classification: 'WRITE',
  displayName: 'Create Signer',
  description: 'Saves a new signer in the workspace.',
  audience: 'both',
  aiMetadata: {
    description:
      'Create a signer (a person who can be asked to sign) in the Assinafy workspace. Request Signatures creates missing signers on its own, so use this only to register people ahead of time. It fails when a signer with the same email already exists.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.signer,
  props: {
    full_name: Property.ShortText({
      displayName: 'Full Name',
      description: 'e.g. "Maria Silva".',
      required: true,
      placeholder: 'Maria Silva',
    }),
    email: Property.ShortText({
      displayName: 'Email',
      description: 'e.g. maria@example.com.',
      required: false,
      placeholder: 'maria@example.com',
    }),
    whatsapp: Property.ShortText({
      displayName: 'WhatsApp Number',
      description: 'International format, e.g. +5548999990000.',
      required: false,
      placeholder: '+5548999990000',
    }),
    government_id: Property.ShortText({
      displayName: 'CPF or CNPJ',
      description:
        'Needed only for ICP-Brasil digital certificate signing, e.g. 39053344705.',
      required: false,
      placeholder: '390.533.447-05',
    }),
  },
  async run({ auth, propsValue }) {
    const governmentId = propsValue.government_id?.trim();
    if (governmentId && !assinafyValues.isGovernmentId(governmentId)) {
      throw new Error('A CPF has 11 digits and a CNPJ has 14 digits.');
    }
    const client = assinafyApi.forAuth(auth);
    const signersPath = await client.accountPath('/signers');
    const signer = await client.request<ApiSigner>({
      method: HttpMethod.POST,
      path: signersPath,
      body: assinafyValues.compact({
        full_name: propsValue.full_name.trim(),
        email: propsValue.email?.trim(),
        whatsapp_phone_number: propsValue.whatsapp?.trim(),
      }),
    });
    if (!governmentId) {
      return assinafyFormat.signer(signer);
    }
    const updated = await client.request<ApiSigner>({
      method: HttpMethod.PUT,
      path: `${signersPath}/${encodeURIComponent(signer.id)}`,
      body: { government_id: governmentId },
    });
    return assinafyFormat.signer(updated);
  },
});
