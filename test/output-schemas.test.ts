import { OutputSchema } from '@activepieces/pieces-framework';
import { assinafy } from '../src/index';
import { downloadDocument } from '../src/lib/actions/download-document';
import { resendSignatureRequest } from '../src/lib/actions/resend-signature-request';
import { assinafyFormat } from '../src/lib/common/format';
import { assinafyValues } from '../src/lib/common/values';
import { assinafyOutputSchemas } from '../src/lib/output-schemas';
import {
  apiAssignment,
  apiDocument,
  apiSigner,
  context,
  replyData,
  replyRaw,
  signedDocument,
} from './helpers';

const keysOf = (value: unknown) =>
  assinafyValues.isRecord(value) ? Object.keys(value) : [];
const paths = (fields: OutputSchema['fields']) =>
  fields.map((field) => field.value ?? field.key);
const itemsOf = ({ schema, key }: { schema: OutputSchema; key: string }) =>
  schema.fields.find((field) => field.key === key)?.listItems ?? [];

describe('output schemas', () => {
  test('describe every step with a stable output', () => {
    const metadata = assinafy.metadata();
    const steps = [
      ...Object.values(metadata.actions),
      ...Object.values(metadata.triggers),
    ];
    expect(
      steps
        .filter((step) => !step.outputSchema)
        .map((step) => step.name)
        .sort()
    ).toEqual(['custom_api_call', 'delete_document', 'new_event']);
  });

  test('list every document field, including each signer', () => {
    const output = assinafyFormat.document(signedDocument);
    const schema = assinafyOutputSchemas.document;
    expect(paths(schema.fields)).toEqual(Object.keys(output));
    expect(paths(itemsOf({ schema, key: 'signers' }))).toEqual(
      Object.keys(output.signers[0])
    );
    const list = assinafyOutputSchemas.documentList;
    expect(list.fields).toHaveLength(1);
    expect(list.fields[0]).toMatchObject({
      value: '',
      listItems: schema.fields,
    });
  });

  test('list every signer and signature request field', () => {
    expect(paths(assinafyOutputSchemas.signer.fields)).toEqual(
      Object.keys(assinafyFormat.signer(apiSigner))
    );
    expect(assinafyOutputSchemas.signerList.fields[0]).toMatchObject({
      value: '',
      listItems: assinafyOutputSchemas.signer.fields,
    });
    expect(paths(assinafyOutputSchemas.signatureRequest.fields)).toEqual(
      Object.keys(
        assinafyFormat.assignment({
          assignment: apiAssignment,
          documentId: 'doc_1',
        })
      )
    );
  });

  test('list every field of the download and resend results', async () => {
    replyData(signedDocument);
    replyRaw(Buffer.from('%PDF'));
    const download = await downloadDocument.run(
      context({ props: { document: 'doc_2', file_type: 'certificated' } })
    );
    expect(paths(assinafyOutputSchemas.download.fields)).toEqual(
      keysOf(download)
    );

    replyData(apiDocument);
    replyData({ is_sent: true });
    const resend = await resendSignatureRequest.run(
      context({ props: { document: 'doc_1', signer: 'sig_1' } })
    );
    expect(paths(assinafyOutputSchemas.resend.fields)).toEqual(keysOf(resend));
  });
});
