import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { ApiContract, assinafyContracts } from '../common/contracts';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const setContractTerms = createAction({
  auth: assinafyAuth,
  name: 'set_contract_terms',
  classification: 'WRITE',
  displayName: 'Set Contract Terms',
  description:
    'Sets contract terms or links an amendment, renewal or termination document.',
  audience: 'both',
  aiMetadata: {
    description:
      'Sets contract terms or links an amendment, renewal or termination document. Requires a plan with contract tracking. Read the contract first and pass updated_at to detect conflicts.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.contract,
  props: {
    document: assinafyProps.document(
      'The document carrying the contract or amendment.'
    ),
    terms: Property.Json({
      displayName: 'Contract Terms',
      description:
        'A JSON object containing only the terms to change. Null clears a term; external_references replaces the list. To link an instrument, include parent_document_id and relation_type. Map updated_at from Get Contract to reject concurrent changes. See the README for every field.',
      required: true,
    }),
  },
  async run({ auth, propsValue }) {
    const documentId = assinafyValues.encodeId(propsValue.document, 'Document');
    const body = assinafyContracts.parse(
      assinafyContracts.terms,
      propsValue.terms
    );
    const client = assinafyApi.forAuth(auth);
    return client.request<ApiContract>({
      method: HttpMethod.PUT,
      path: await client.accountPath(`/documents/${documentId}/contract`),
      body,
    });
  },
});
