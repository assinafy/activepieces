import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiContract, assinafyContracts } from '../common/contracts';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const renewContract = createAction({
  auth: assinafyAuth,
  name: 'renew_contract',
  classification: 'WRITE',
  displayName: 'Renew Contract',
  description:
    'Starts the next contract term, optionally changing its end date and value.',
  audience: 'both',
  aiMetadata: {
    description:
      'Starts the next contract term, optionally changing its end date and value. Requires a plan with contract tracking. Read the contract first and pass updated_at to detect conflicts.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.contract,
  props: {
    document: assinafyProps.document(
      'The document carrying the contract or amendment.'
    ),
    renewal: Property.Json({
      displayName: 'Renewal',
      description:
        'A JSON object with the current term from Get Contract, or an explicit end_date (YYYY-MM-DD). Optional value (null clears it) and updated_at. Keep term/end_date unchanged when retrying; do not fetch a newer term automatically.',
      required: true,
    }),
  },
  async run({ auth, propsValue }) {
    const documentId = assinafyValues.encodeId(propsValue.document, 'Document');
    const body = assinafyContracts.parse(
      assinafyContracts.renewal,
      propsValue.renewal
    );
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiContract>({
      method: HttpMethod.POST,
      path: await client.accountPath(`/documents/${documentId}/contract/renew`),
      body,
    });
  },
});
