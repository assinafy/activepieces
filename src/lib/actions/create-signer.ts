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
        'CPF required for biometric verification; CPF or CNPJ for ICP-Brasil certificates, e.g. 39053344705.',
      required: false,
      placeholder: '390.533.447-05',
    }),
  },
  async run({ auth, propsValue }) {
    if (!propsValue.full_name?.trim()) {
      throw new Error('Full Name is required to create a signer.');
    }
    assinafyValues.validateContact({
      email: propsValue.email?.trim(),
      whatsapp: propsValue.whatsapp?.trim(),
      label: 'Signer',
    });
    const governmentId = propsValue.government_id?.trim();
    if (governmentId && !assinafyValues.isGovernmentId(governmentId)) {
      throw new Error('A CPF has 11 digits and a CNPJ has 14 characters.');
    }
    const client = assinafyApi.forAuth(auth);
    const signer = await client.request<ApiSigner>({
      method: HttpMethod.POST,
      path: await client.accountPath('/signers'),
      body: assinafyValues.compact({
        full_name: propsValue.full_name.trim(),
        email: propsValue.email?.trim(),
        whatsapp_phone_number: propsValue.whatsapp?.trim(),
        government_id: governmentId,
      }),
    });
    return assinafyFormat.signer(signer);
  },
});
