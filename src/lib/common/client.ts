import {
  AppConnectionType,
  AppConnectionValueForAuthProperty,
  tryCatch,
} from '@activepieces/pieces-framework';
import {
  HttpError,
  HttpMessageBody,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  QueryParams,
  httpClient,
} from '@activepieces/pieces-common';
import type { assinafyAuth } from '../auth';
import { assinafyConstants } from './constants';
import { assinafyValues } from './values';

function apiKeyCredentials(props: {
  api_key: string;
  environment?: string;
  account_id?: string;
}): AssinafyCredentials {
  return {
    baseUrl:
      props.environment === 'sandbox'
        ? ASSINAFY_API_URLS.sandbox
        : ASSINAFY_API_URLS.production,
    headers: { 'X-Api-Key': props.api_key },
    accountId: props.account_id?.trim() || undefined,
  };
}

function oauthCredentials(accessToken: string): AssinafyCredentials {
  return {
    baseUrl: ASSINAFY_API_URLS.production,
    headers: { Authorization: `Bearer ${accessToken}` },
    accountId: undefined,
  };
}

function credentialsFor(auth: AssinafyAuthValue): AssinafyCredentials {
  return auth.type === AppConnectionType.CUSTOM_AUTH
    ? apiKeyCredentials(auth.props)
    : oauthCredentials(auth.access_token);
}

async function send<T extends HttpMessageBody>({
  credentials,
  request,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
}): Promise<HttpResponse<T>> {
  const apiOrigin = new URL(credentials.baseUrl).origin;
  let url = `${credentials.baseUrl}${request.path}`;
  let queryParams = compactQuery(request.queryParams);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { data: response, error } = await tryCatch(() =>
      httpClient.sendRequest<T>({
        method: request.method,
        url,
        headers:
          new URL(url).origin === apiOrigin ? credentials.headers : undefined,
        queryParams,
        body: request.body,
        responseType: request.responseType,
        timeout: credentials.timeoutMs ?? assinafyConstants.requestTimeoutMs,
        followRedirects: false,
      })
    );
    if (error) {
      const failure = await toAssinafyError(error);
      if (
        request.method === HttpMethod.GET ||
        failure instanceof AssinafyApiError
      ) {
        throw failure;
      }
      throw new Error(
        `${failure.message}. Assinafy may have received the request anyway; check Assinafy before running the step again.`
      );
    }
    const location =
      response.status >= 300
        ? headerValue({ headers: response.headers, name: 'location' })
        : undefined;
    if (!location) {
      return response;
    }
    if (request.method !== HttpMethod.GET) {
      throw new AssinafyApiError({
        status: response.status,
        message: `Assinafy API error (HTTP ${response.status}): the request was redirected, which is only followed for downloads and reads.`,
      });
    }
    const next = new URL(location, url);
    if (next.protocol !== 'https:') {
      throw new AssinafyApiError({
        status: response.status,
        message: `Assinafy API error (HTTP ${response.status}): the request was redirected to an address without HTTPS, which is not followed.`,
      });
    }
    url = next.toString();
    queryParams = undefined;
  }
  throw new AssinafyApiError({
    status: 502,
    message: 'Assinafy API error: too many redirects.',
  });
}

async function call<T>({
  credentials,
  request,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
}): Promise<T> {
  const response = await send<ApiEnvelope<T>>({ credentials, request });
  const data = assinafyValues.isRecord(response.body)
    ? response.body['data']
    : undefined;
  if (data === undefined || data === null) {
    throw new AssinafyApiError({
      status: 502,
      message: 'Assinafy returned an empty response.',
    });
  }
  return data;
}

async function callOptional<T>({
  credentials,
  request,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
}): Promise<T | null> {
  const { data: response, error } = await tryCatch(() =>
    send<ApiEnvelope<T | null>>({ credentials, request })
  );
  if (error) {
    if (error instanceof AssinafyApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
  return assinafyValues.isRecord(response.body)
    ? response.body.data ?? null
    : null;
}

async function callList<T>({
  credentials,
  request,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
}): Promise<T[]> {
  const data = await call<unknown>({ credentials, request });
  if (!Array.isArray(data)) {
    throw new AssinafyApiError({
      status: 502,
      message: 'Assinafy returned an unexpected response instead of a list.',
    });
  }
  return data;
}

async function callPage<T>({
  credentials,
  request,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
}): Promise<{ items: T[]; pageCount: number | undefined }> {
  const response = await send<ApiEnvelope<unknown>>({ credentials, request });
  const data = assinafyValues.isRecord(response.body)
    ? response.body['data']
    : undefined;
  if (!Array.isArray(data)) {
    throw new AssinafyApiError({
      status: 502,
      message: 'Assinafy returned an unexpected response instead of a list.',
    });
  }
  const pageCount = Number(
    headerValue({ headers: response.headers, name: 'x-pagination-page-count' })
  );
  return {
    items: data,
    pageCount:
      Number.isInteger(pageCount) && pageCount > 0 ? pageCount : undefined,
  };
}

async function callAll<T extends { id: string }>({
  credentials,
  request,
  maxItems,
  until,
}: {
  credentials: AssinafyCredentials;
  request: AssinafyRequest;
  maxItems: number;
  until?: (item: T) => boolean;
}): Promise<T[]> {
  const pageSize = assinafyConstants.pageSize;
  const found = new Map<string, T>();
  for (let page = 1; found.size < maxItems; page++) {
    const { items, pageCount } = await callPage<T>({
      credentials,
      request: {
        ...request,
        queryParams: { ...request.queryParams, page, 'per-page': pageSize },
      },
    });
    const newItems = items.filter((item) => !found.has(item.id));
    newItems.forEach((item) => found.set(item.id, item));
    const lastPage =
      pageCount === undefined ? items.length < pageSize : page >= pageCount;
    if (lastPage || newItems.length === 0 || (until && newItems.some(until))) {
      break;
    }
  }
  return [...found.values()].slice(0, maxItems);
}

async function resolveWorkspace(
  credentials: AssinafyCredentials
): Promise<ApiAccount> {
  const accounts = await callList<ApiAccount>({
    credentials,
    request: { method: HttpMethod.GET, path: '/accounts' },
  });
  const choices = accounts
    .map((account) => `${account.name ?? 'Unnamed'} (${account.id})`)
    .join(', ');
  if (credentials.accountId) {
    const match = accounts.find(
      (account) => account.id === credentials.accountId
    );
    if (!match) {
      throw new Error(
        `Workspace ID ${
          credentials.accountId
        } is not available to this connection. Available workspaces: ${
          choices || 'none'
        }.`
      );
    }
    return match;
  }
  if (accounts.length === 1) {
    return accounts[0];
  }
  if (accounts.length === 0) {
    throw new Error(
      'This Assinafy connection does not have access to any workspace.'
    );
  }
  throw new Error(
    `This API key can access ${accounts.length} workspaces. Edit the connection and set Workspace ID to one of: ${choices}.`
  );
}

function fromCredentials(credentials: AssinafyCredentials) {
  let accountId = credentials.accountId;
  const getAccountId = async () =>
    (accountId ??= (await resolveWorkspace(credentials)).id);
  return {
    baseUrl: credentials.baseUrl,
    request: <T>(request: AssinafyRequest) => call<T>({ credentials, request }),
    find: <T>(request: AssinafyRequest) =>
      callOptional<T>({ credentials, request }),
    list: <T>(request: AssinafyRequest) =>
      callList<T>({ credentials, request }),
    listPage: <T>(request: AssinafyRequest) =>
      callPage<T>({ credentials, request }),
    listAll: <T extends { id: string }>(options: {
      request: AssinafyRequest;
      maxItems: number;
      until?: (item: T) => boolean;
    }) => callAll<T>({ credentials, ...options }),
    workspace: () => resolveWorkspace(credentials),
    accountId: getAccountId,
    accountPath: async (suffix: string) =>
      `/accounts/${encodeURIComponent(await getAccountId())}${suffix}`,
    download: async (path: string) => {
      const response = await send<ArrayBuffer>({
        credentials,
        request: { method: HttpMethod.GET, path, responseType: 'arraybuffer' },
      });
      return Buffer.from(response.body);
    },
  };
}

function forAuth(auth: AssinafyAuthValue) {
  return fromCredentials(credentialsFor(auth));
}

function forTrigger(auth: AssinafyAuthValue) {
  return fromCredentials({
    ...credentialsFor(auth),
    timeoutMs: assinafyConstants.triggerRequestTimeoutMs,
  });
}

function headerValue({
  headers,
  name,
}: {
  headers: HttpResponse['headers'];
  name: string;
}): string | undefined {
  const value = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name
  )?.[1];
  return Array.isArray(value) ? value[0] : value;
}

function compactQuery(
  query: AssinafyRequest['queryParams']
): QueryParams | undefined {
  if (!query) {
    return undefined;
  }
  const entries = Object.entries(query).filter(
    (entry): entry is [string, string | number] =>
      entry[1] !== undefined && entry[1] !== ''
  );
  return Object.fromEntries(
    entries.map(([key, value]) => [key, String(value)])
  );
}

async function toAssinafyError(error: unknown): Promise<Error> {
  if (!(error instanceof HttpError)) {
    const failure = error instanceof Error ? error : new Error(String(error));
    // fetch reports TLS, DNS and connection failures as "fetch failed", with the reason as the cause.
    return failure.cause instanceof Error
      ? new Error(`${failure.message}: ${failure.cause.message}`, {
          cause: failure,
        })
      : failure;
  }
  const { status, body } = error.response;
  const parsed = await parseJson(body);
  const parts = [
    `Assinafy API error (HTTP ${status})`,
    apiMessage(parsed),
    apiDetails(parsed),
    STATUS_HINTS[status],
  ];
  return new AssinafyApiError({
    status,
    message: parts.filter(Boolean).join(': '),
  });
}

async function parseJson(body: unknown): Promise<unknown> {
  if (typeof body !== 'string') {
    return body;
  }
  const { data, error } = await tryCatch(
    async (): Promise<unknown> => JSON.parse(body)
  );
  return error ? body : data;
}

function apiMessage(body: unknown): string | undefined {
  if (typeof body === 'string') {
    return body.trim().slice(0, 300) || undefined;
  }
  if (!assinafyValues.isRecord(body)) {
    return undefined;
  }
  const candidate = [
    body['message'],
    body['error_description'],
    body['error'],
  ].find(
    (value): value is string => typeof value === 'string' && value.trim() !== ''
  );
  return candidate?.trim();
}

function apiDetails(body: unknown): string | undefined {
  if (!assinafyValues.isRecord(body)) {
    return undefined;
  }
  const data = body['data'];
  if (
    data === null ||
    data === undefined ||
    (Array.isArray(data) && data.length === 0)
  ) {
    return undefined;
  }
  return JSON.stringify(data).slice(0, 500);
}

const MAX_REDIRECTS = 5;

const STATUS_HINTS: Record<number, string> = {
  401: 'check the API key, or reconnect the Assinafy connection',
  403: 'this connection is not allowed to do this (the item may belong to another workspace or need a different Assinafy role; for OAuth connections, also check the approved permissions)',
  404: 'the item was not found in this workspace',
  429: 'too many requests, try again later',
};

const ASSINAFY_API_URLS = {
  production: 'https://api.assinafy.com.br/v1',
  sandbox: 'https://sandbox.assinafy.com.br/v1',
};

export class AssinafyApiError extends Error {
  readonly status: number;

  constructor({ status, message }: { status: number; message: string }) {
    super(message);
    this.name = 'AssinafyApiError';
    this.status = status;
  }
}

export const assinafyApi = {
  urls: ASSINAFY_API_URLS,
  apiKeyCredentials,
  credentialsFor,
  forAuth,
  forTrigger,
  fromCredentials,
  oauthCredentials,
};

export type AssinafyAuthValue = AppConnectionValueForAuthProperty<
  typeof assinafyAuth
>;

export type AssinafyClient = ReturnType<typeof fromCredentials>;

export type AssinafyCredentials = {
  baseUrl: string;
  headers: Record<string, string>;
  accountId: string | undefined;
  timeoutMs?: number;
};

export type AssinafyRequest = {
  method: HttpMethod;
  path: string;
  queryParams?: Record<string, string | number | undefined>;
  body?: HttpRequest['body'];
  responseType?: HttpRequest['responseType'];
};

type ApiEnvelope<T> = { status?: number; message?: string; data: T };

type ApiAccount = { id: string; name?: string };
