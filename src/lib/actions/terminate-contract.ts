import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiContract, assinafyContracts } from '../common/contracts';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const terminateContract = createAction({
  auth: assinafyAuth,
  name: 'terminate_contract',
  classification: 'DESTRUCTIVE',
  displayName: 'Terminate Contract',
  description: 'Closes a contract and stops its lifecycle alerts.',
  audience: 'both',
  aiMetadata: {
    description:
      'Terminate a tracked contract. A terminated contract cannot be renewed. Requires contract tracking on the workspace plan. Map updated_at to reject concurrent changes.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.contract,
  props: {
    document: assinafyProps.document(
      'The document carrying the contract to terminate.'
    ),
    reason: Property.LongText({
      displayName: 'Reason',
      description:
        'Reason recorded in the termination event, at most 500 characters.',
      required: false,
    }),
    updated_at: Property.ShortText({
      displayName: 'Last Updated At',
      description:
        'Map updated_at from Get Contract. If the contract changed meanwhile, the API rejects the write with 409.',
      required: false,
    }),
  },
  async run({ auth, propsValue }) {
    const documentId = assinafyValues.encodeId(propsValue.document, 'Document');
    const body = assinafyContracts.parse(
      assinafyContracts.termination,
      Object.fromEntries(
        Object.entries({
          reason: propsValue.reason,
          updated_at: propsValue.updated_at,
        }).filter(
          ([, value]) => value !== undefined && value !== null && value !== ''
        )
      )
    );
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiContract>({
      method: HttpMethod.POST,
      path: await client.accountPath(
        `/documents/${documentId}/contract/terminate`
      ),
      body,
    });
  },
});
