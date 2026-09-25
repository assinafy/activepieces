import { createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { assinafyDocuments } from '../common/documents';
import { ApiAssignment, ApiSigner, assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafySigners } from '../common/signers';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

function missingCopyReceivers({
  assignment,
  requested,
}: {
  assignment: ApiAssignment;
  requested: ApiSigner[];
}): string[] {
  const kept = JSON.stringify(assignment.copy_receivers ?? []).toLowerCase();
  const listed = (value: string | null | undefined) =>
    Boolean(value) && kept.includes(JSON.stringify(value?.toLowerCase()));
  return requested
    .filter((signer) => !listed(signer.id) && !listed(signer.email))
    .map((signer) => signer.email ?? signer.id);
}

export const requestSignatures = createAction({
  auth: assinafyAuth,
  name: 'request_signatures',
  classification: 'WRITE',
  displayName: 'Request Signatures',
  description: 'Sends a document to one or more people to sign.',
  audience: 'both',
  aiMetadata: {
    description:
      'Send an uploaded Assinafy document for electronic signature to signers given by email or WhatsApp number, reusing existing workspace signers and creating missing ones. Assinafy notifies signers right away (or by signing order), and WhatsApp or digital-certificate verification consumes credits. Each call creates a new signature request, so do not retry blindly.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.signatureRequest,
  props: {
    document: assinafyProps.document(
      'The document to send. A just-uploaded document can be used right away; Assinafy sends it once processing finishes.'
    ),
    signers: Property.Array({
      displayName: 'Signers',
      description:
        'People who must sign. Each signer needs an email address or a WhatsApp number.',
      required: true,
      properties: {
        full_name: Property.ShortText({
          displayName: 'Full Name',
          description:
            'Required for new signers and for signers given only by WhatsApp number, e.g. "Maria Silva".',
          required: false,
          placeholder: 'Maria Silva',
        }),
        email: Property.ShortText({
          displayName: 'Email',
          description: 'Signer email, e.g. maria@example.com.',
          required: false,
          placeholder: 'maria@example.com',
        }),
        whatsapp: Property.ShortText({
          displayName: 'WhatsApp Number',
          description:
            'International format, e.g. +5548999990000. Required for WhatsApp verification.',
          required: false,
          placeholder: '+5548999990000',
        }),
        verification: Property.StaticDropdown({
          displayName: 'Verification',
          description:
            'How the signer proves their identity and receives the invitation. Defaults to email, or to WhatsApp when only a WhatsApp number is given.',
          required: false,
          options: {
            disabled: false,
            options: assinafyConstants.signerVerificationOptions,
          },
        }),
        government_id: Property.ShortText({
          displayName: 'CPF or CNPJ',
          description:
            'Needed for ICP-Brasil digital certificate signing. Saved only when the signer is created; to change the CPF/CNPJ of an existing signer, use Update Signer.',
          required: false,
          placeholder: '390.533.447-05',
        }),
        step: Property.Number({
          displayName: 'Signing Order',
          description:
            'Optional. Signers with the same number sign in parallel; 2 is invited after everyone in 1 signs. If you use it, set it for every signer, starting at 1.',
          required: false,
        }),
      },
    }),
    message: Property.LongText({
      displayName: 'Message',
      description:
        'Text added to the invitation, e.g. "Please sign the service agreement by Friday."',
      required: false,
      advanced: true,
    }),
    expires_at: Property.DateTime({
      displayName: 'Deadline',
      description:
        'When the request expires, at least one hour from now, e.g. 2026-12-31T18:00:00-03:00. Leave empty for no deadline.',
      required: false,
      advanced: true,
    }),
    copy_receivers: Property.Array({
      displayName: 'Send Copy To',
      description:
        'People who receive a copy of the signed document without signing.',
      required: false,
      advanced: true,
      properties: {
        email: Property.ShortText({
          displayName: 'Email',
          description: 'Email that receives the copy, e.g. legal@example.com.',
          required: true,
          placeholder: 'maria@example.com',
        }),
        full_name: Property.ShortText({
          displayName: 'Full Name',
          description:
            'Required when the person does not exist in Assinafy yet.',
          required: false,
          placeholder: 'Maria Silva',
        }),
      },
    }),
  },
  async run({ auth, propsValue }) {
    const signerRows = propsValue.signers ?? [];
    if (signerRows.length === 0) {
      throw new Error('Add at least one signer.');
    }
    const signerRequests = signerRows.map((row, index) =>
      assinafySigners.requestFromRow({ row, label: `Signer ${index + 1}` })
    );
    const copyRequests = (propsValue.copy_receivers ?? []).map(
      (row, index) => ({
        ...assinafySigners.requestFromRow({
          row,
          label: `Copy recipient ${index + 1}`,
        }),
        verification: 'email',
        step: undefined,
      })
    );
    assinafySigners.validateContacts([...signerRequests, ...copyRequests]);
    assinafySigners.validateSigningOrder(signerRequests);
    const expiresAt = assinafyValues.toIsoDate({
      value: propsValue.expires_at,
      label: 'Deadline',
    });

    const client = assinafyApi.forAuth(auth);
    await assinafyDocuments.waitUntilProcessed({
      client,
      documentId: propsValue.document,
    });
    const resolved = await assinafySigners.resolveAll({
      client,
      requests: [...signerRequests, ...copyRequests],
    });
    const signers = resolved.slice(0, signerRequests.length);
    const copyReceivers = resolved.slice(signerRequests.length);

    const assignment = await client.request<ApiAssignment>({
      method: HttpMethod.POST,
      path: `/documents/${encodeURIComponent(propsValue.document)}/assignments`,
      body: assinafyValues.compact({
        method: 'virtual',
        signers: signers.map(({ request, signer }) => ({
          id: signer.id,
          ...assinafySigners.assignmentFields(request),
        })),
        message: propsValue.message?.trim(),
        expires_at: expiresAt,
        copy_receivers: copyReceivers.map(({ signer }) => signer.id),
      }),
    });
    const missing = missingCopyReceivers({
      assignment,
      requested: copyReceivers.map(({ signer }) => signer),
    });
    if (missing.length > 0) {
      throw new Error(
        `The signature request ${
          assignment.id
        } was sent, but Assinafy did not keep these copy recipients: ${missing.join(
          ', '
        )}. Copy recipients may not be available on your Assinafy plan. Do not run this step again for the same document, or the signers are invited twice.`
      );
    }
    return assinafyFormat.assignment({
      assignment,
      documentId: propsValue.document,
    });
  },
});
