import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiSigner, assinafyFormat } from '../common/format';
import { assinafyOutputSchemas } from '../output-schemas';

export const findSigners = createAction({
  auth: assinafyAuth,
  name: 'find_signers',
  classification: 'SEARCH',
  displayName: 'Find Signers',
  description: 'Finds saved signers by name or email.',
  audience: 'both',
  aiMetadata: {
    description:
      'Search the signers saved in the Assinafy workspace by partial name or email; returns an empty list when nothing matches. Request Signatures already reuses signers by email, so use this only to read or update a signer.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.signerList,
  props: {
    search: Property.ShortText({
      displayName: 'Search',
      description:
        'Part of the signer name or email, e.g. "maria@example.com".',
      required: true,
      placeholder: 'maria@example.com',
    }),
    limit: Property.Number({
      displayName: 'Maximum Results',
      description: 'How many signers to return, from 1 to 100.',
      required: false,
      defaultValue: 25,
      display: 'stepper',
      min: 1,
      max: 100,
      step: 1,
    }),
  },
  async run({ auth, propsValue }) {
    const limit = Math.trunc(propsValue.limit ?? 25);
    if (limit < 1 || limit > 100) {
      throw new Error('Maximum Results must be between 1 and 100.');
    }
    const search = propsValue.search.trim();
    if (!search) {
      throw new Error('Enter part of a name or email to search for.');
    }
    const client = assinafyApi.forAuth(auth);
    const signers = await client.listAll<ApiSigner>({
      request: {
        method: HttpMethod.GET,
        path: await client.accountPath('/signers'),
        queryParams: { search },
      },
      maxItems: limit,
    });
    return signers.map(assinafyFormat.signer);
  },
});
