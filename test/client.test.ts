import { HttpMethod } from '@activepieces/pieces-common';
import { AssinafyApiError, assinafyApi } from '../src/lib/common/client';
import {
  PRODUCTION,
  SANDBOX,
  apiKeyAuth,
  oauthAuth,
  replyData,
  replyError,
  replyPage,
  replyRaw,
  sendRequest,
  sentRequests,
} from './helpers';

const { apiKeyCredentials, credentialsFor, oauthCredentials } = assinafyApi;
const createClient = assinafyApi.fromCredentials;
const assinafyClient = assinafyApi.forAuth;

describe('credentials', () => {
  test('an API key targets production by default and sends X-Api-Key', () => {
    expect(apiKeyCredentials({ api_key: 'k' })).toEqual({
      baseUrl: PRODUCTION,
      headers: { 'X-Api-Key': 'k' },
      accountId: undefined,
    });
  });

  test('the sandbox environment switches the base URL and a blank workspace ID is ignored', () => {
    expect(
      apiKeyCredentials({
        api_key: 'k',
        environment: 'sandbox',
        account_id: '  ',
      })
    ).toEqual({
      baseUrl: SANDBOX,
      headers: { 'X-Api-Key': 'k' },
      accountId: undefined,
    });
  });

  test('a workspace ID is trimmed', () => {
    expect(
      apiKeyCredentials({ api_key: 'k', account_id: ' acc_9 ' }).accountId
    ).toBe('acc_9');
  });

  test('OAuth uses a bearer token against production', () => {
    expect(oauthCredentials('t')).toEqual({
      baseUrl: PRODUCTION,
      headers: { Authorization: 'Bearer t' },
      accountId: undefined,
    });
  });

  test('credentialsFor picks the method from the connection type', () => {
    expect(credentialsFor(apiKeyAuth as never).headers).toEqual({
      'X-Api-Key': 'test-api-key',
    });
    expect(credentialsFor(oauthAuth as never).headers).toEqual({
      Authorization: 'Bearer test-access-token',
    });
  });
});

describe('requests', () => {
  const client = assinafyClient(apiKeyAuth as never);

  test('builds the URL, sends auth headers, drops blank query values and unwraps the envelope', async () => {
    replyData({ id: 'doc_1' });
    const result = await client.request({
      method: HttpMethod.GET,
      path: '/documents/doc_1',
      queryParams: {
        search: '',
        status: undefined,
        page: 2,
        sort: '-updated_at',
      },
    });
    expect(result).toEqual({ id: 'doc_1' });
    expect(sentRequests()[0]).toEqual({
      method: HttpMethod.GET,
      url: `${PRODUCTION}/documents/doc_1`,
      headers: { 'X-Api-Key': 'test-api-key' },
      queryParams: { page: '2', sort: '-updated_at' },
      body: undefined,
      responseType: undefined,
      timeout: 120000,
      followRedirects: false,
    });
  });

  test('omits the query entirely when none is given', async () => {
    replyData({});
    await client.request({ method: HttpMethod.GET, path: '/x' });
    expect(sentRequests()[0].queryParams).toBeUndefined();
  });

  test('a response without data is rejected instead of returned as undefined', async () => {
    replyRaw({ status: 200, message: '' });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('Assinafy returned an empty response.');
    replyRaw('not json');
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toBeInstanceOf(AssinafyApiError);
  });

  test('list rejects a non-array payload so a failed lookup never reads as "no results"', async () => {
    replyData({ id: 'x' });
    await expect(
      client.list({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('instead of a list');
    replyData([{ id: 'a' }]);
    await expect(
      client.list({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toEqual([{ id: 'a' }]);
  });

  test('find returns null for 404 and for an empty payload', async () => {
    replyError({
      status: 404,
      body: { status: 404, message: 'Not found', data: null },
    });
    await expect(
      client.find({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toBeNull();
    replyData(null);
    await expect(
      client.find({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toBeNull();
    replyRaw('');
    await expect(
      client.find({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toBeNull();
    replyData({ id: 'a' });
    await expect(
      client.find({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toEqual({ id: 'a' });
  });

  test('find still surfaces other failures', async () => {
    replyError({
      status: 500,
      body: {
        status: 500,
        message: 'An unexpected error occurred.',
        data: null,
      },
    });
    await expect(
      client.find({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('HTTP 500');
  });

  test('download asks for bytes and returns a Buffer', async () => {
    replyRaw(new Uint8Array([37, 80, 68, 70]).buffer);
    const data = await client.download('/documents/doc_1/download/original');
    expect(Buffer.isBuffer(data)).toBe(true);
    expect(data.toString()).toBe('%PDF');
    expect(sentRequests()[0].responseType).toBe('arraybuffer');
  });

  test('exposes the base URL of the connection', () => {
    expect(
      createClient(apiKeyCredentials({ api_key: 'k', environment: 'sandbox' }))
        .baseUrl
    ).toBe(SANDBOX);
  });
});

describe('redirects', () => {
  const client = assinafyClient(apiKeyAuth as never);
  const redirectTo = (location: string, status = 302) =>
    sendRequest.mockResolvedValueOnce({
      status,
      headers: { Location: location },
      body: '',
    });

  test('follows a same-origin redirect with the credentials', async () => {
    redirectTo('/v1/documents/doc_9');
    replyData({ id: 'doc_9' });
    await expect(
      client.request({
        method: HttpMethod.GET,
        path: '/documents/doc_1',
        queryParams: { page: 1 },
      })
    ).resolves.toEqual({ id: 'doc_9' });
    expect(sentRequests()[1]).toMatchObject({
      url: `${PRODUCTION}/documents/doc_9`,
      headers: { 'X-Api-Key': 'test-api-key' },
      queryParams: undefined,
    });
  });

  test('follows a download to another origin without the credentials', async () => {
    redirectTo('https://storage.example.com/signed.pdf?sig=abc', 307);
    replyRaw(new Uint8Array([37, 80, 68, 70]).buffer);
    const data = await client.download(
      '/documents/doc_1/download/certificated'
    );
    expect(data.toString()).toBe('%PDF');
    expect(sentRequests()[1].url).toBe(
      'https://storage.example.com/signed.pdf?sig=abc'
    );
    expect(sentRequests()[1].headers).toBeUndefined();
  });

  test('refuses a redirect to an address without HTTPS', async () => {
    redirectTo('http://api.assinafy.com.br/v1/x');
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 302): the request was redirected to an address without HTTPS, which is not followed.'
    );
    expect(sentRequests()).toHaveLength(1);
  });

  test('refuses to follow a redirect of a write and stops redirect loops', async () => {
    redirectTo('https://storage.example.com/collect', 307);
    await expect(
      client.request({ method: HttpMethod.POST, path: '/x', body: { a: 1 } })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 307): the request was redirected, which is only followed for downloads and reads.'
    );
    expect(sentRequests()).toHaveLength(1);
    for (let hop = 0; hop <= 5; hop++) {
      redirectTo('/v1/loop');
    }
    await expect(
      client.request({ method: HttpMethod.GET, path: '/loop' })
    ).rejects.toThrow('Assinafy API error: too many redirects.');
    expect(sentRequests()).toHaveLength(7);
  });

  test('returns a created response with a location header as it is', async () => {
    sendRequest.mockResolvedValueOnce({
      status: 201,
      headers: { Location: '/v1/documents/doc_9' },
      body: { data: { id: 'doc_9' } },
    });
    await expect(
      client.request({ method: HttpMethod.POST, path: '/documents', body: {} })
    ).resolves.toEqual({ id: 'doc_9' });
    expect(sentRequests()).toHaveLength(1);
  });

  test('returns a 3xx without a location as it is', async () => {
    sendRequest.mockResolvedValueOnce({
      status: 304,
      headers: {},
      body: { data: { id: 'a' } },
    });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).resolves.toEqual({ id: 'a' });
  });
});

describe('paging', () => {
  const client = assinafyClient(apiKeyAuth as never);
  const items = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `item_${from + i}` }));
  const request = {
    method: HttpMethod.GET,
    path: '/items',
    queryParams: { search: 'x' },
  };

  test('listPage returns the items and the page count header, whatever its case', async () => {
    replyPage({ data: [{ id: 'a' }], pageCount: 3 });
    await expect(client.listPage(request)).resolves.toEqual({
      items: [{ id: 'a' }],
      pageCount: 3,
    });
    replyPage({ data: [{ id: 'a' }] });
    await expect(client.listPage(request)).resolves.toEqual({
      items: [{ id: 'a' }],
      pageCount: undefined,
    });
    sendRequest.mockResolvedValueOnce({
      status: 200,
      headers: { 'x-pagination-page-count': 'abc' },
      body: { data: [] },
    });
    await expect(client.listPage(request)).resolves.toEqual({
      items: [],
      pageCount: undefined,
    });
    replyData({ id: 'a' });
    await expect(client.listPage(request)).rejects.toThrow('instead of a list');
  });

  test('listAll asks for pages of 50 and stops at the last page reported by the API', async () => {
    replyPage({ data: items(0, 50), pageCount: 2 });
    replyPage({ data: items(50, 50), pageCount: 2 });
    const found = await client.listAll({ request, maxItems: 500 });
    expect(found).toHaveLength(100);
    expect(sentRequests().map((sent) => sent.queryParams)).toEqual([
      { search: 'x', page: '1', 'per-page': '50' },
      { search: 'x', page: '2', 'per-page': '50' },
    ]);
  });

  test('listAll stops at a short page, at a repeated page and at the item limit', async () => {
    replyPage({ data: items(0, 50) });
    replyPage({ data: items(50, 10) });
    await expect(
      client.listAll({ request, maxItems: 500 })
    ).resolves.toHaveLength(60);
    sendRequest.mockReset();
    replyPage({ data: items(0, 50) });
    replyPage({ data: items(0, 50) });
    await expect(
      client.listAll({ request, maxItems: 500 })
    ).resolves.toHaveLength(50);
    expect(sentRequests()).toHaveLength(2);
    sendRequest.mockReset();
    replyPage({ data: items(0, 50), pageCount: 9 });
    replyPage({ data: items(50, 50), pageCount: 9 });
    await expect(
      client.listAll({ request, maxItems: 70 })
    ).resolves.toHaveLength(70);
    expect(sentRequests()).toHaveLength(2);
  });

  test('listAll stops as soon as a page holds the item being looked for', async () => {
    replyPage({ data: items(0, 50), pageCount: 5 });
    replyPage({ data: items(50, 50), pageCount: 5 });
    const found = await client.listAll<{ id: string }>({
      request,
      maxItems: 500,
      until: (item) => item.id === 'item_60',
    });
    expect(found.map((item) => item.id)).toContain('item_60');
    expect(sentRequests()).toHaveLength(2);
  });
});

describe('errors', () => {
  const client = assinafyClient(apiKeyAuth as never);

  test('uses the API message, validation details and a hint, never the request body', async () => {
    replyError({
      status: 400,
      body: {
        status: 422,
        message: 'One or more fields failed validation.',
        data: { email: ['Email is not a valid email address.'] },
      },
    });
    const error = await client
      .request({
        method: HttpMethod.POST,
        path: '/x',
        body: { secret: 'value' },
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AssinafyApiError);
    expect((error as AssinafyApiError).status).toBe(400);
    expect((error as Error).message).toBe(
      'Assinafy API error (HTTP 400): One or more fields failed validation.: {"email":["Email is not a valid email address."]}'
    );
    expect((error as Error).message).not.toContain('secret');
  });

  test('parses JSON error bodies that arrive as text and adds status hints', async () => {
    replyError({
      status: 401,
      body: JSON.stringify({
        status: 401,
        message: 'Your request was made with invalid credentials.',
        data: null,
      }),
    });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 401): Your request was made with invalid credentials.: check the API key, or reconnect the Assinafy connection'
    );
  });

  test('reads OAuth-style errors', async () => {
    replyError({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'The code expired.' },
    });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('Assinafy API error (HTTP 400): The code expired.');
  });

  test('keeps short plain-text bodies and tolerates empty ones', async () => {
    replyError({ status: 502, body: 'Bad gateway' });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('Assinafy API error (HTTP 502): Bad gateway');
    replyError({ status: 429, body: '' });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 429): too many requests, try again later'
    );
    replyError({ status: 404, body: undefined });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 404): the item was not found in this workspace'
    );
    replyError({ status: 403, body: { data: [] } });
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow(
      'Assinafy API error (HTTP 403): this connection is not allowed'
    );
  });

  test('passes through network errors and wraps non-Error throws', async () => {
    sendRequest.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('fetch failed');
    sendRequest.mockRejectedValueOnce('boom');
    await expect(
      client.request({ method: HttpMethod.GET, path: '/x' })
    ).rejects.toThrow('boom');
  });

  test('shows why a connection failed, such as a TLS handshake error, and does not retry', async () => {
    sendRequest.mockRejectedValueOnce(
      new TypeError('fetch failed', {
        cause: new Error('ssl_choose_client_version:unsupported protocol'),
      })
    );
    const error = await client
      .request({ method: HttpMethod.GET, path: '/x' })
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AssinafyApiError);
    expect((error as Error).message).toBe(
      'fetch failed: ssl_choose_client_version:unsupported protocol'
    );
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  test('warns that a write cut off by the network may have been processed', async () => {
    sendRequest.mockRejectedValueOnce(new Error('This operation was aborted'));
    await expect(
      client.request({ method: HttpMethod.POST, path: '/x', body: {} })
    ).rejects.toThrow(
      'This operation was aborted. Assinafy may have received the request anyway; check Assinafy before running the step again.'
    );
    replyError({ status: 500, body: { message: 'Server error' } });
    await expect(
      client.request({ method: HttpMethod.POST, path: '/x', body: {} })
    ).rejects.toThrow('Assinafy API error (HTTP 500): Server error');
  });
});

describe('timeouts', () => {
  test('uses a short timeout for triggers and a long one for actions', async () => {
    replyData({});
    replyData({});
    await assinafyApi
      .forTrigger(apiKeyAuth as never)
      .request({ method: HttpMethod.GET, path: '/x' });
    await assinafyClient(apiKeyAuth as never).request({
      method: HttpMethod.GET,
      path: '/x',
    });
    expect(sentRequests().map((sent) => sent.timeout)).toEqual([15000, 120000]);
  });
});

describe('workspace resolution', () => {
  const accounts = [
    { id: 'acc_1', name: 'Acme' },
    { id: 'acc_2', name: 'Beta' },
  ];

  test('a configured workspace ID is used without calling the API', async () => {
    const client = createClient(
      apiKeyCredentials({ api_key: 'k', account_id: 'acc_7' })
    );
    await expect(client.accountPath('/signers')).resolves.toBe(
      '/accounts/acc_7/signers'
    );
    expect(sendRequest).not.toHaveBeenCalled();
  });

  test('the only workspace is discovered once per client and URL-encoded', async () => {
    replyData([{ id: 'acc/1', name: 'Solo' }]);
    const client = createClient(oauthCredentials('t'));
    await expect(client.accountPath('/documents')).resolves.toBe(
      '/accounts/acc%2F1/documents'
    );
    await expect(client.accountId()).resolves.toBe('acc/1');
    expect(sentRequests()).toHaveLength(1);
    expect(sentRequests()[0].url).toBe(`${PRODUCTION}/accounts`);
  });

  test('several workspaces without a configured ID ask the user to choose', async () => {
    replyData(accounts);
    await expect(
      createClient(apiKeyCredentials({ api_key: 'k' })).accountId()
    ).rejects.toThrow(
      'This API key can access 2 workspaces. Edit the connection and set Workspace ID to one of: Acme (acc_1), Beta (acc_2).'
    );
  });

  test('no workspace at all is reported', async () => {
    replyData([]);
    await expect(
      createClient(oauthCredentials('t')).workspace()
    ).rejects.toThrow('does not have access to any workspace');
  });

  test('workspace() checks a configured ID against the API', async () => {
    replyData(accounts);
    await expect(
      createClient(
        apiKeyCredentials({ api_key: 'k', account_id: 'acc_2' })
      ).workspace()
    ).resolves.toEqual(accounts[1]);
    replyData([{ id: 'acc_1' }]);
    await expect(
      createClient(
        apiKeyCredentials({ api_key: 'k', account_id: 'acc_9' })
      ).workspace()
    ).rejects.toThrow(
      'Workspace ID acc_9 is not available to this connection. Available workspaces: Unnamed (acc_1).'
    );
    replyData([]);
    await expect(
      createClient(
        apiKeyCredentials({ api_key: 'k', account_id: 'acc_9' })
      ).workspace()
    ).rejects.toThrow('Available workspaces: none.');
  });
});
