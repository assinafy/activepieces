import { ApFile, createAction, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import FormData from 'form-data';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { ApiDocument, assinafyFormat } from '../common/format';
import { assinafyOutputSchemas } from '../output-schemas';

function uploadFileName({
  file,
  name,
}: {
  file: ApFile;
  name: string | undefined;
}): string {
  const chosen = name?.trim() || file.filename || 'document';
  const extension = (file.extension || 'pdf').toLowerCase();
  return chosen.toLowerCase().endsWith(`.${extension}`)
    ? chosen
    : `${chosen}.${extension}`;
}

export const uploadDocument = createAction({
  auth: assinafyAuth,
  name: 'upload_document',
  classification: 'WRITE',
  displayName: 'Upload Document',
  description: 'Uploads a PDF to Assinafy so you can request signatures on it.',
  audience: 'both',
  aiMetadata: {
    description:
      'Upload a PDF (up to 25 MB) to the Assinafy workspace as the first step before Request Signatures; to generate a document from a saved template use Create Document from Template instead. Each call creates a new document, so retries create duplicates.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.document,
  props: {
    file: Property.File({
      displayName: 'File',
      description:
        'The PDF to upload, up to 25 MB. Use a file from a previous step, a public URL or a base64 data URL.',
      required: true,
    }),
    name: Property.ShortText({
      displayName: 'Document Name',
      description:
        'Name shown in Assinafy, e.g. "Service agreement.pdf". Defaults to the file name.',
      required: false,
      placeholder: 'Service agreement.pdf',
      advanced: true,
    }),
  },
  async run({ auth, propsValue }) {
    const { file, name } = propsValue;
    if (file.data.length > assinafyConstants.maxUploadBytes) {
      const megabytes = (file.data.length / (1024 * 1024)).toFixed(1);
      throw new Error(
        `The file is ${megabytes} MB. Assinafy accepts files up to 25 MB.`
      );
    }
    const client = assinafyApi.forAuth(auth);
    const fileName = uploadFileName({ file, name });
    const form = new FormData();
    form.append('file', file.data, {
      filename: fileName,
      contentType: fileName.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'application/octet-stream',
    });
    const document = await client.request<ApiDocument>({
      method: HttpMethod.POST,
      path: await client.accountPath('/documents'),
      body: form,
    });
    return assinafyFormat.document(document);
  },
});
