import { PropertyType } from '@activepieces/pieces-framework';
import { assinafyAuth } from '../src/lib/auth';
import {
  PRODUCTION,
  SANDBOX,
  replyData,
  replyError,
  sentRequests,
} from './helpers';

type AuthEntry = (typeof assinafyAuth)[number];
const apiKey = assinafyAuth[0] as Extract<
  AuthEntry,
  { type: PropertyType.CUSTOM_AUTH }
>;
const oauth = assinafyAuth[1] as Extract<
  AuthEntry,
  { type: PropertyType.OAUTH2 }
>;
const server = {
  apiUrl: 'http://localhost:3000',
  publicUrl: 'http://localhost:4200',
} as never;

describe('API key connection', () => {
  test('is a custom auth with key, environment and optional workspace', () => {
    expect(apiKey.type).toBe(PropertyType.CUSTOM_AUTH);
    expect(Object.keys(apiKey.props)).toEqual([
      'api_key',
      'environment',
      'account_id',
    ]);
    expect(apiKey.props.api_key.required).toBe(true);
    expect(apiKey.props.account_id.required).toBe(false);
  });

  test('validates against the chosen environment', async () => {
    replyData([{ id: 'acc_1', name: 'Acme' }]);
    await expect(
      apiKey.validate?.({
        auth: {
          api_key: 'k',
          environment: 'sandbox',
          account_id: undefined,
        } as never,
        server,
      })
    ).resolves.toEqual({ valid: true });
    expect(sentRequests()[0]).toMatchObject({
      url: `${SANDBOX}/accounts`,
      headers: { 'X-Api-Key': 'k' },
    });
  });

  test('reports a rejected key', async () => {
    replyError({
      status: 401,
      body: {
        status: 401,
        message: 'Your request was made with invalid credentials.',
        data: null,
      },
    });
    const result = await apiKey.validate?.({
      auth: {
        api_key: 'bad',
        environment: 'production',
        account_id: undefined,
      } as never,
      server,
    });
    expect(result).toEqual({
      valid: false,
      error:
        'Assinafy API error (HTTP 401): Your request was made with invalid credentials.: check the API key, or reconnect the Assinafy connection',
    });
  });

  test('reports a workspace ID the key cannot reach', async () => {
    replyData([{ id: 'acc_1', name: 'Acme' }]);
    const result = await apiKey.validate?.({
      auth: {
        api_key: 'k',
        environment: 'production',
        account_id: 'acc_2',
      } as never,
      server,
    });
    expect(result).toMatchObject({
      valid: false,
      error: expect.stringContaining('Workspace ID acc_2 is not available'),
    });
  });

  test('labels the connection with the workspace name, best effort', async () => {
    replyData([{ id: 'acc_1', name: 'Acme' }]);
    await expect(
      apiKey.getConnectionIdentifier?.({
        auth: {
          api_key: 'k',
          environment: 'production',
          account_id: undefined,
        } as never,
        server,
      })
    ).resolves.toBe('Acme');
    replyError({ status: 500, body: 'down' });
    await expect(
      apiKey.getConnectionIdentifier?.({
        auth: {
          api_key: 'k',
          environment: 'production',
          account_id: undefined,
        } as never,
        server,
      })
    ).resolves.toBeUndefined();
  });

  test('non-Error failures still produce a readable validation error', async () => {
    const { sendRequest } = await import('./helpers');
    sendRequest.mockRejectedValueOnce('socket hang up');
    await expect(
      apiKey.validate?.({
        auth: {
          api_key: 'k',
          environment: 'production',
          account_id: undefined,
        } as never,
        server,
      })
    ).resolves.toEqual({ valid: false, error: 'socket hang up' });
  });
});

describe('OAuth connection', () => {
  test('uses Assinafy authorization with PKCE, client secret in the body and the needed scopes', () => {
    expect(oauth.type).toBe(PropertyType.OAUTH2);
    expect(oauth.authUrl).toBe('https://auth.assinafy.com.br/oauth/authorize');
    expect(oauth.tokenUrl).toBe('https://api.assinafy.com.br/v1/oauth/token');
    expect(oauth.pkce).toBe(true);
    expect(oauth.pkceMethod).toBe('S256');
    expect(oauth.authorizationMethod).toBe('BODY');
    expect(oauth.scope).toEqual([
      'documents:read',
      'documents:write',
      'templates:read',
      'templates:write',
      'account:read',
      'webhooks:write',
      'offline_access',
    ]);
  });

  test('labels the connection with the consented workspace', async () => {
    replyData([{ id: 'acc_1', name: 'Acme' }]);
    await expect(
      oauth.getConnectionIdentifier?.({
        auth: { access_token: 't', data: {} } as never,
        server,
      })
    ).resolves.toBe('Acme');
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts`,
      headers: { Authorization: 'Bearer t' },
    });
  });
});
