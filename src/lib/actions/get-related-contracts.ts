import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiContract } from '../common/contracts';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const getRelatedContracts = createAction({
  auth: assinafyAuth,
  name: 'get_related_contracts',
  classification: 'READ',
  displayName: 'Get Related Contracts',
  description:
    'Gets the root contract and every linked amendment, renewal and termination.',
  audience: 'both',
  aiMetadata: {
    description:
      'Gets the root contract and every linked amendment, renewal and termination. A document without terms returns a 404 error.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.contract,
  props: {
    document: assinafyProps.document(
      'The document whose contract or amendment to read.'
    ),
  },
  async run({ auth, propsValue }) {
    const documentId = assinafyValues.encodeId(propsValue.document, 'Document');
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiContract>({
      method: HttpMethod.GET,
      path: await client.accountPath(
        `/documents/${documentId}/contract/related`
      ),
    });
  },
});
