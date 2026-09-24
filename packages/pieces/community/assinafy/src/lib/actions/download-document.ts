import { createAction, Property } from '@activepieces/pieces-framework';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { assinafyDocuments } from '../common/documents';
import { assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafyOutputSchemas } from '../output-schemas';

export const downloadDocument = createAction({
  auth: assinafyAuth,
  name: 'download_document',
  classification: 'READ',
  displayName: 'Download Document',
  description: 'Downloads the signed PDF or another file of a document.',
  audience: 'both',
  aiMetadata: {
    description:
      'Download a file of an Assinafy document (the signed PDF by default, or the original, certificate page, ZIP bundle or PAdES version) as a file for later steps. The signed PDF exists only after every signer has signed; while certification is still running it waits up to a minute.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.download,
  props: {
    document: assinafyProps.document(
      'The document to download. You can also map a document ID from a previous step.'
    ),
    file_type: Property.StaticDropdown({
      displayName: 'File',
      description:
        'Which file to download. The signed PDF is available once the document status is "Signed".',
      required: true,
      defaultValue: 'certificated',
      options: {
        disabled: false,
        options: assinafyConstants.downloadableFileOptions,
      },
    }),
    file_name: Property.ShortText({
      displayName: 'File Name',
      description:
        'Name for the downloaded file, e.g. "signed-contract.pdf". Defaults to the document name.',
      required: false,
      placeholder: 'signed-contract.pdf',
      advanced: true,
    }),
  },
  async run({ auth, propsValue, files }) {
    const { file_type: fileType } = propsValue;
    const file = assinafyConstants.downloadableFiles[fileType];
    if (!file) {
      throw new Error(`Unknown file type "${fileType}".`);
    }
    const client = assinafyApi.forAuth(auth);
    const documentPath = `/documents/${encodeURIComponent(
      propsValue.document
    )}`;
    const document = await assinafyDocuments.waitWhile({
      client,
      documentId: propsValue.document,
      pending: (candidate) =>
        candidate.status === 'certificating' &&
        !candidate.artifacts?.[fileType],
      checks: CERTIFICATION_CHECKS,
      intervalMs: CERTIFICATION_CHECK_MS,
    });
    if (!document.artifacts?.[fileType]) {
      throw new Error(
        `"${file.label}" is not available for this document yet (status: ${
          assinafyFormat.statusLabel(document.status) ?? 'unknown'
        }). Available files: ${
          Object.keys(document.artifacts ?? {})
            .filter((name) => name in assinafyConstants.downloadableFiles)
            .join(', ') || 'none'
        }.`
      );
    }
    const data = await client.download(
      `${documentPath}/download/${encodeURIComponent(fileType)}`
    );
    const baseName = (document.name ?? document.id).replace(/\.pdf$/i, '');
    const fileName =
      propsValue.file_name?.trim() ||
      `${baseName}-${fileType}.${file.extension}`;
    return {
      file: await files.write({ fileName, data }),
      file_name: fileName,
      file_type: fileType,
      size_bytes: data.length,
      document_id: document.id,
      document_name: document.name ?? null,
      document_status: document.status ?? null,
    };
  },
});

const CERTIFICATION_CHECKS = 12;
const CERTIFICATION_CHECK_MS = 5000;
