import { ApFile } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import FormData from 'form-data';
import { deleteDocument } from '../src/lib/actions/delete-document';
import { downloadDocument } from '../src/lib/actions/download-document';
import { findDocuments } from '../src/lib/actions/find-documents';
import { getDocument } from '../src/lib/actions/get-document';
import { uploadDocument } from '../src/lib/actions/upload-document';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  apiDocument,
  context,
  replyData,
  replyError,
  replyRaw,
  sentRequests,
  signedDocument,
} from './helpers';

const formatDocument = assinafyFormat.document;
const uploadedFile = (body: unknown) => {
  const form = body as FormData;
  const text = form.getBuffer().toString('latin1');
  return {
    name: /filename="([^"]*)"/.exec(text)?.[1],
    type: /Content-Type: ([^\r\n]+)/.exec(text)?.[1],
    text,
  };
};

const pdf = (
  name = 'contract.pdf',
  extension: string | undefined = 'pdf',
  size?: number
) =>
  new ApFile(
    name,
    size ? Buffer.alloc(size) : Buffer.from('%PDF-1.4 test'),
    extension
  );

describe('Upload Document', () => {
  test('posts the file as multipart to the workspace and returns the flattened document', async () => {
    replyData(apiDocument);
    const result = await uploadDocument.run(
      context({ props: { file: pdf(), name: undefined } })
    );
    expect(result).toEqual(formatDocument(apiDocument));
    const request = sentRequests()[0];
    expect(request).toMatchObject({
      method: HttpMethod.POST,
      url: `${PRODUCTION}/accounts/acc_1/documents`,
    });
    expect(request.body).toBeInstanceOf(FormData);
    const file = uploadedFile(request.body);
    expect(file.name).toBe('contract.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.text).toContain('name="file"');
    expect(file.text).toContain('%PDF-1.4 test');
  });

  test('uses the chosen name and adds the extension only when it is missing', async () => {
    replyData(apiDocument);
    await uploadDocument.run(
      context({ props: { file: pdf(), name: ' Service agreement ' } })
    );
    expect(uploadedFile(sentRequests()[0].body).name).toBe(
      'Service agreement.pdf'
    );
    replyData(apiDocument);
    await uploadDocument.run(
      context({ props: { file: pdf(), name: 'Final.PDF' } })
    );
    expect(uploadedFile(sentRequests()[1].body).name).toBe('Final.PDF');
    replyData(apiDocument);
    await uploadDocument.run(
      context({ props: { file: pdf(), name: 'Contrato J.Silva' } })
    );
    const dotted = uploadedFile(sentRequests()[2].body);
    expect(dotted.name).toBe('Contrato J.Silva.pdf');
    expect(dotted.type).toBe('application/pdf');
  });

  test('falls back to a default name and a generic type for non-PDF files', async () => {
    replyData(apiDocument);
    await uploadDocument.run(
      context({ props: { file: pdf('', undefined), name: undefined } })
    );
    expect(uploadedFile(sentRequests()[0].body).name).toBe('document.pdf');
    replyData(apiDocument);
    await uploadDocument.run(
      context({ props: { file: pdf('scan', 'docx'), name: undefined } })
    );
    const file = uploadedFile(sentRequests()[1].body);
    expect(file.name).toBe('scan.docx');
    expect(file.type).toBe('application/octet-stream');
  });

  test('rejects files over 25 MB before uploading', async () => {
    await expect(
      uploadDocument.run(
        context({
          props: { file: pdf('big.pdf', 'pdf', 25 * 1024 * 1024 + 1) },
        })
      )
    ).rejects.toThrow(
      'The file is 25.0 MB. Assinafy accepts files up to 25 MB.'
    );
    expect(sentRequests()).toHaveLength(0);
  });

  test('reaches the wire as multipart with a boundary through the real Activepieces HTTP client', async () => {
    const { httpClient: realClient } = await vi.importActual<
      typeof import('@activepieces/pieces-common')
    >('@activepieces/pieces-common');
    const { sendRequest } = await import('./helpers');
    sendRequest.mockImplementationOnce((request) =>
      realClient.sendRequest(request)
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ status: 200, message: '', data: apiDocument }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    await uploadDocument.run(
      context({ props: { file: pdf(), name: undefined } })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string>; body: Buffer }
    ];
    const contentType = Object.entries(init.headers).find(
      ([key]) => key.toLowerCase() === 'content-type'
    )?.[1];
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(Buffer.from(init.body).toString('latin1')).toContain(
      'filename="contract.pdf"'
    );
  });
});

describe('Get Document', () => {
  test('reads the document by encoded ID', async () => {
    replyData(apiDocument);
    await expect(
      getDocument.run(context({ props: { document: 'doc/1' } }))
    ).resolves.toEqual(formatDocument(apiDocument));
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/documents/doc%2F1`,
    });
  });
});

describe('Find Documents', () => {
  test('searches newest first with the given filters', async () => {
    replyData([apiDocument, signedDocument]);
    const result = await findDocuments.run(
      context({
        props: { search: ' contract ', status: 'certificated', limit: 1 },
      })
    );
    expect(result).toEqual([formatDocument(apiDocument)]);
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/documents`,
      queryParams: {
        search: 'contract',
        status: 'certificated',
        sort: '-updated_at',
        page: '1',
        'per-page': '50',
      },
    });
  });

  test('reads further pages of 50 to return up to 100 documents', async () => {
    const page = (from: number) =>
      Array.from({ length: 50 }, (_, i) => ({
        ...apiDocument,
        id: `doc_${from + i}`,
      }));
    replyData(page(0));
    replyData(page(50));
    const result = await findDocuments.run(context({ props: { limit: 100 } }));
    expect(result).toHaveLength(100);
    expect(sentRequests().map((sent) => sent.queryParams?.['page'])).toEqual([
      '1',
      '2',
    ]);
  });

  test('defaults to 25 results and no filters', async () => {
    replyData([]);
    await expect(
      findDocuments.run(
        context({
          props: { search: undefined, status: undefined, limit: undefined },
        })
      )
    ).resolves.toEqual([]);
    expect(sentRequests()[0].queryParams).toEqual({
      sort: '-updated_at',
      page: '1',
      'per-page': '50',
    });
  });

  test('validates the limit', async () => {
    await expect(
      findDocuments.run(context({ props: { limit: 0 } }))
    ).rejects.toThrow('between 1 and 100');
    await expect(
      findDocuments.run(context({ props: { limit: 101 } }))
    ).rejects.toThrow('between 1 and 100');
  });
});

describe('Download Document', () => {
  const certificating = {
    ...signedDocument,
    status: 'certificating',
    artifacts: { original: signedDocument.artifacts.original },
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  test('waits while certification is still running, then downloads the signed PDF', async () => {
    vi.useFakeTimers();
    replyData(certificating);
    replyData(certificating);
    replyData(signedDocument);
    replyRaw(Buffer.from('%PDF signed'));
    const running = downloadDocument.run(
      context({ props: { document: 'doc_2', file_type: 'certificated' } })
    );
    await vi.advanceTimersByTimeAsync(10000);
    await expect(running).resolves.toMatchObject({
      document_status: 'certificated',
      size_bytes: 11,
    });
    expect(sentRequests()).toHaveLength(4);
  });

  test('stops waiting for certification after a minute', async () => {
    vi.useFakeTimers();
    for (let check = 0; check <= 12; check++) {
      replyData(certificating);
    }
    const running = downloadDocument
      .run(context({ props: { document: 'doc_2', file_type: 'certificated' } }))
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(60000);
    expect(String(await running)).toContain(
      'is not available for this document yet'
    );
    expect(sentRequests()).toHaveLength(13);
  });

  test('does not wait for a file that certification does not produce', async () => {
    replyData(certificating);
    replyRaw(Buffer.from('%PDF'));
    await expect(
      downloadDocument.run(
        context({ props: { document: 'doc_2', file_type: 'original' } })
      )
    ).resolves.toMatchObject({ document_status: 'certificating' });
    expect(sentRequests()).toHaveLength(2);
  });

  test('downloads the signed PDF and stores it as a flow file', async () => {
    replyData(signedDocument);
    replyRaw(Buffer.from('%PDF signed'));
    const ctx = context({
      props: {
        document: 'doc_2',
        file_type: 'certificated',
        file_name: undefined,
      },
    });
    const result = await downloadDocument.run(ctx);
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/documents/doc_2/download/certificated`,
      responseType: 'arraybuffer',
    });
    expect(result).toEqual({
      file: 'https://files.example.com/Signed contract-certificated.pdf',
      file_name: 'Signed contract-certificated.pdf',
      file_type: 'certificated',
      size_bytes: 11,
      document_id: 'doc_2',
      document_name: 'Signed contract.pdf',
      document_status: 'certificated',
    });
    const write = (
      ctx as unknown as { files: { write: ReturnType<typeof vi.fn> } }
    ).files.write;
    expect(write.mock.calls[0][0].data.toString()).toBe('%PDF signed');
  });

  test('uses a custom file name and the ZIP extension for the bundle', async () => {
    replyData({ ...signedDocument, name: undefined });
    replyRaw(Buffer.from('PK'));
    const result = await downloadDocument.run(
      context({
        props: { document: 'doc_2', file_type: 'bundle', file_name: ' ' },
      })
    );
    expect(result).toMatchObject({ file_name: 'doc_2-bundle.zip' });
    replyData(signedDocument);
    replyRaw(Buffer.from('PK'));
    const named = await downloadDocument.run(
      context({
        props: { document: 'doc_2', file_type: 'bundle', file_name: 'all.zip' },
      })
    );
    expect(named).toMatchObject({ file_name: 'all.zip' });
  });

  test('explains when the requested file does not exist yet', async () => {
    replyData(apiDocument);
    await expect(
      downloadDocument.run(
        context({ props: { document: 'doc_1', file_type: 'certificated' } })
      )
    ).rejects.toThrow(
      '"Signed PDF (with signature certificate)" is not available for this document yet (status: Waiting for signatures). Available files: original.'
    );
    replyData({ id: 'doc_3' });
    await expect(
      downloadDocument.run(
        context({ props: { document: 'doc_3', file_type: 'original' } })
      )
    ).rejects.toThrow('(status: unknown). Available files: none.');
  });

  test('rejects an unknown file type without calling the API', async () => {
    await expect(
      downloadDocument.run(
        context({ props: { document: 'doc_1', file_type: 'thumbnail' } })
      )
    ).rejects.toThrow('Unknown file type "thumbnail".');
    expect(sentRequests()).toHaveLength(0);
  });
});

describe('Delete Document', () => {
  test('deletes by ID', async () => {
    replyData([]);
    await expect(
      deleteDocument.run(context({ props: { document: 'doc_1' } }))
    ).resolves.toEqual({
      deleted: true,
      document_id: 'doc_1',
    });
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.DELETE,
      url: `${PRODUCTION}/documents/doc_1`,
    });
  });

  test('surfaces the API reason when the document cannot be deleted', async () => {
    replyError({
      status: 400,
      body: {
        status: 400,
        message: 'The document cannot be deleted in its current status.',
        data: null,
      },
    });
    await expect(
      deleteDocument.run(context({ props: { document: 'doc_2' } }))
    ).rejects.toThrow('The document cannot be deleted in its current status.');
  });
});
