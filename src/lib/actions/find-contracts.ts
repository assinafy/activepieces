import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiContract, assinafyContracts } from '../common/contracts';
import { assinafyOutputSchemas } from '../output-schemas';

export const findContracts = createAction({
  auth: assinafyAuth,
  name: 'find_contracts',
  classification: 'SEARCH',
  displayName: 'Find Contracts',
  description:
    'Finds tracked contracts by status, counterparty, dates or external reference.',
  audience: 'both',
  aiMetadata: {
    description:
      'Search workspace contracts. Combine filters to narrow results; ending_within_days uses the Brasília calendar day. Returns an empty list when nothing matches.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.contractList,
  props: {
    search: Property.ShortText({
      displayName: 'Search',
      description:
        'Part of the document name. Leave empty to list all tracked contracts.',
      required: false,
    }),
    status: Property.StaticMultiSelectDropdown({
      displayName: 'Contract Status',
      description:
        'Return contracts with any of these statuses. Leave empty for every status.',
      required: false,
      options: {
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Active', value: 'active' },
          { label: 'Expired', value: 'expired' },
          { label: 'Terminated', value: 'terminated' },
        ],
      },
    }),
    counterparty: Property.ShortText({
      displayName: 'Counterparty',
      description: 'Part of the counterparty name or its exact CPF/CNPJ.',
      required: false,
    }),
    end_date_from: Property.ShortText({
      displayName: 'End Date From',
      description:
        'Contracts ending on or after this calendar date (YYYY-MM-DD).',
      required: false,
    }),
    end_date_to: Property.ShortText({
      displayName: 'End Date To',
      description:
        'Contracts ending on or before this calendar date (YYYY-MM-DD).',
      required: false,
    }),
    ending_within_days: Property.Number({
      displayName: 'Ending Within Days',
      description:
        'End dates from today through this many days later, in Brasília time; 0 means today. From 0 to 3650.',
      required: false,
      min: 0,
      max: 3650,
      step: 1,
    }),
    external_system: Property.ShortText({
      displayName: 'External System',
      description: 'System of the external reference, e.g. hubspot.',
      required: false,
    }),
    external_id: Property.ShortText({
      displayName: 'External ID',
      description: 'Contract ID in the external system, e.g. deal_123.',
      required: false,
    }),
    sort: Property.StaticDropdown({
      displayName: 'Sort',
      description: 'Order of results. Contracts without an end date come last.',
      required: false,
      defaultValue: '-updated_at',
      options: {
        options: [
          { label: 'Most recently updated', value: '-updated_at' },
          { label: 'Least recently updated', value: 'updated_at' },
          { label: 'Earliest end date', value: 'end_date' },
          { label: 'Latest end date', value: '-end_date' },
        ],
      },
    }),
    expand_document: Property.Checkbox({
      displayName: 'Include Document',
      description:
        'Include the original API document object with each contract.',
      required: false,
      defaultValue: false,
    }),
    limit: Property.Number({
      displayName: 'Maximum Results',
      description: 'How many contracts to return, from 1 to 100.',
      required: false,
      defaultValue: 25,
      min: 1,
      max: 100,
      step: 1,
    }),
  },
  async run({ auth, propsValue }) {
    const {
      status,
      expand_document,
      limit = 25,
      ...filters
    } = assinafyContracts.parse(
      assinafyContracts.filters,
      Object.fromEntries(
        Object.entries(propsValue).filter(
          ([, value]) => value !== undefined && value !== null && value !== ''
        )
      )
    );
    const client = assinafyApi.forAuth(auth);
    return client.listAll<ApiContract>({
      request: {
        method: HttpMethod.GET,
        path: await client.accountPath('/contracts'),
        queryParams: {
          ...filters,
          sort: filters.sort ?? '-updated_at',
          status: status?.join(','),
          expand: expand_document ? 'document' : undefined,
        },
      },
      maxItems: limit,
    });
  },
});
