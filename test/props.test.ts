import { assinafyProps } from '../src/lib/common/props';
import {
  PRODUCTION,
  apiDocument,
  apiKeyAuth,
  apiSigner,
  apiTemplate,
  replyData,
  replyError,
  sentRequests,
} from './helpers';

const search = (searchValue?: string) => ({ searchValue } as never);
const {
  document: documentDropdown,
  documentSigner: documentSignerDropdown,
  signer: signerDropdown,
  template: templateDropdown,
} = assinafyProps;

describe('document dropdown', () => {
  const dropdown = documentDropdown('Pick one');

  test('is searchable and required', () => {
    expect(dropdown.refreshOnSearch).toBe(true);
    expect(dropdown.required).toBe(true);
    expect(dropdown.description).toBe('Pick one');
  });

  test('lists recent documents with their status', async () => {
    replyData([apiDocument, { id: 'doc_x' }]);
    await expect(
      dropdown.options({ auth: apiKeyAuth as never }, search('contract'))
    ).resolves.toEqual({
      disabled: false,
      placeholder: undefined,
      options: [
        { label: 'Contract.pdf (Waiting for signatures)', value: 'doc_1' },
        { label: 'doc_x (unknown status)', value: 'doc_x' },
      ],
    });
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/documents`,
      queryParams: {
        search: 'contract',
        sort: '-updated_at',
        'per-page': '50',
      },
    });
  });

  test('asks for a connection first', async () => {
    await expect(
      dropdown.options({ auth: undefined }, search())
    ).resolves.toEqual({
      disabled: true,
      options: [],
      placeholder: 'Connect your Assinafy account first.',
    });
  });

  test('explains empty results and failures', async () => {
    replyData([]);
    await expect(
      dropdown.options({ auth: apiKeyAuth as never }, search())
    ).resolves.toMatchObject({
      disabled: false,
      placeholder: 'No documents found.',
    });
    replyError({
      status: 401,
      body: { status: 401, message: 'Invalid credentials', data: null },
    });
    await expect(
      dropdown.options({ auth: apiKeyAuth as never }, search())
    ).resolves.toMatchObject({
      disabled: true,
      options: [],
      placeholder: expect.stringContaining(
        'Could not load documents: Assinafy API error (HTTP 401): Invalid credentials'
      ),
    });
  });

  test('reports non-Error failures', async () => {
    const { sendRequest } = await import('./helpers');
    sendRequest.mockRejectedValueOnce('offline');
    await expect(
      dropdown.options({ auth: apiKeyAuth as never }, search())
    ).resolves.toMatchObject({
      placeholder: 'Could not load documents: offline',
    });
  });
});

describe('template dropdown', () => {
  test('lists templates by name', async () => {
    replyData([
      apiTemplate,
      { id: 'tpl_2', document_name: 'Lease.pdf' },
      { id: 'tpl_3' },
    ]);
    const result = await templateDropdown('Pick').options(
      { auth: apiKeyAuth as never },
      search('nda')
    );
    expect(result.options).toEqual([
      { label: 'NDA template.pdf', value: 'tpl_1' },
      { label: 'Lease.pdf', value: 'tpl_2' },
      { label: 'tpl_3', value: 'tpl_3' },
    ]);
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/templates`,
      queryParams: { search: 'nda', 'per-page': '50' },
    });
  });
});

describe('signer dropdown', () => {
  test('labels signers with their email or number', async () => {
    replyData([
      apiSigner,
      {
        id: 'sig_2',
        full_name: 'João',
        email: null,
        whatsapp_phone_number: '+5548999990000',
      },
      { id: 'sig_3', full_name: 'No Contact' },
      { id: 'sig_4' },
    ]);
    const result = await signerDropdown('Pick').options(
      { auth: apiKeyAuth as never },
      search()
    );
    expect(result.options).toEqual([
      { label: 'Maria Silva (maria@example.com)', value: 'sig_1' },
      { label: 'João (+5548999990000)', value: 'sig_2' },
      { label: 'No Contact', value: 'sig_3' },
      { label: 'sig_4', value: 'sig_4' },
    ]);
    expect(sentRequests()[0].queryParams).toEqual({ 'per-page': '50' });
  });
});

describe('document signer dropdown', () => {
  const dropdown = documentSignerDropdown('Pick');

  test('refreshes when the document changes', () => {
    expect(dropdown.refreshers).toEqual(['document']);
  });

  test('lists the signers of the selected document', async () => {
    replyData(apiDocument);
    const result = await dropdown.options(
      { auth: apiKeyAuth as never, document: 'doc_1' },
      search()
    );
    expect(result.options).toEqual([
      { label: 'Maria Silva (maria@example.com)', value: 'sig_1' },
    ]);
    expect(sentRequests()[0].url).toBe(`${PRODUCTION}/documents/doc_1`);
  });

  test('waits for a document and handles documents never sent', async () => {
    await expect(
      dropdown.options(
        { auth: apiKeyAuth as never, document: undefined },
        search()
      )
    ).resolves.toEqual({
      disabled: true,
      options: [],
      placeholder: 'Select a document first.',
    });
    await expect(
      dropdown.options({ auth: undefined, document: undefined }, search())
    ).resolves.toMatchObject({
      placeholder: 'Connect your Assinafy account first.',
    });
    replyData({ ...apiDocument, assignment: null });
    await expect(
      dropdown.options(
        { auth: apiKeyAuth as never, document: 'doc_1' },
        search()
      )
    ).resolves.toMatchObject({
      options: [],
      placeholder: 'No signers on this document found.',
    });
  });
});
