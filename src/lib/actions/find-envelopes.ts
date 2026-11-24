import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiEnvelope } from '../common/envelopes';
import { assinafyOutputSchemas } from '../output-schemas';

export const findEnvelopes = createAction({
  auth: assinafyAuth,
  name: 'find_envelopes',
  classification: 'SEARCH',
  displayName: 'Find Envelopes',
  description:
    'Finds envelopes by name and whether their documents are open or closed.',
  audience: 'both',
  aiMetadata: {
    description:
      'Search envelopes by partial name, newest first. Open means at least one document is still open; closed means all are closed. Returns an empty list when nothing matches.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.envelopeList,
  props: {
    search: Property.ShortText({
      displayName: 'Search',
      description: 'Part of the envelope name. Leave empty to list envelopes.',
      required: false,
    }),
    status: Property.StaticDropdown({
      displayName: 'Status',
      description: 'Filter by whether the envelope has open documents.',
      required: false,
      options: {
        options: [
          { label: 'Open', value: 'open' },
          { label: 'Closed', value: 'closed' },
        ],
      },
    }),
    limit: Property.Number({
      displayName: 'Maximum Results',
      description: 'How many envelopes to return, from 1 to 100.',
      required: false,
      defaultValue: 25,
      min: 1,
      max: 100,
      step: 1,
    }),
  },
  async run({ auth, propsValue }) {
    const limit = propsValue.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('Maximum Results must be between 1 and 100.');
    if (propsValue.status && !['open', 'closed'].includes(propsValue.status))
      throw new Error('Select a valid envelope status.');
    const client = assinafyApi.forAuth(auth);
    return client.listAll<ApiEnvelope>({
      request: {
        method: HttpMethod.GET,
        path: await client.accountPath('/envelopes'),
        queryParams: {
          search: propsValue.search?.trim(),
          status: propsValue.status,
        },
      },
      maxItems: limit,
    });
  },
});
