import { createAction, Property } from '@activepieces/pieces-framework';
import { assinafyAuth } from '../auth';
import { assinafyApi } from '../common/client';
import { assinafyConstants } from '../common/constants';
import { assinafyProps } from '../common/props';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

export const downloadEnvelope = createAction({
  auth: assinafyAuth,
  name: 'download_envelope',
  classification: 'READ',
  displayName: 'Download Envelope',
  description:
    'Downloads a ZIP of an artifact from the envelope documents that have it available.',
  audience: 'both',
  aiMetadata: {
    description:
      'Download a ZIP of envelope originals or signed artifacts. Signed artifacts include only documents already certified; PAdES includes only certificate signatures. A partial archive does not mean the whole envelope is signed.',
    idempotent: true,
  },
  outputSchema: assinafyOutputSchemas.envelopeDownload,
  props: {
    envelope: assinafyProps.envelope,
    file_type: Property.StaticDropdown({
      displayName: 'File',
      description:
        'Which artifact to collect into the ZIP. Only documents with that artifact are included.',
      required: true,
      defaultValue: 'certificated',
      options: { options: assinafyConstants.downloadableFileOptions },
    }),
    file_name: Property.ShortText({
      displayName: 'File Name',
      description:
        'ZIP file name. Defaults to the envelope ID and artifact name.',
      required: false,
    }),
  },
  async run({ auth, propsValue, files }) {
    const id = assinafyValues.encodeId(propsValue.envelope, 'Envelope');
    const type = propsValue.file_type;
    if (!Object.hasOwn(assinafyConstants.downloadableFiles, type))
      throw new Error(`Unknown file type "${type}".`);
    const client = assinafyApi.forAuth(auth);
    const data = await client.download(
      await client.accountPath(
        `/envelopes/${id}/download/${encodeURIComponent(type)}`
      )
    );
    const fileName =
      propsValue.file_name?.trim() ||
      `${propsValue.envelope.trim()}-${type}.zip`;
    return {
      file: await files.write({ fileName, data }),
      file_name: fileName,
      file_type: type,
      size_bytes: data.length,
      envelope_id: propsValue.envelope.trim(),
    };
  },
});
