import {
  OAuth2AuthorizationMethod,
  PieceAuth,
  Property,
  tryCatch,
} from '@activepieces/pieces-framework';
import { AssinafyCredentials, assinafyApi } from './common/client';

async function validateCredentials(
  credentials: AssinafyCredentials
): Promise<{ valid: true } | { valid: false; error: string }> {
  const { error } = await tryCatch(() =>
    assinafyApi.fromCredentials(credentials).workspace()
  );
  return error
    ? {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      }
    : { valid: true };
}

async function workspaceName(
  credentials: AssinafyCredentials
): Promise<string | undefined> {
  const { data } = await tryCatch(() =>
    assinafyApi.fromCredentials(credentials).workspace()
  );
  return data?.name;
}

const API_KEY_DESCRIPTION = `Connect with an Assinafy API key.

1. Sign in to [Assinafy](https://app.assinafy.com.br), or to the [Assinafy sandbox](https://app-sandbox.assinafy.com.br) for testing.
2. Open **My Account → API** and create an API key.
3. Paste the key below and choose the environment where you created it.

Tip: create the key for a dedicated Assinafy user so you can control what the automation can access.`;

const OAUTH_DESCRIPTION = `Sign in to Assinafy and approve access to one workspace.

Before connecting, an owner of the Assinafy workspace must register an OAuth application under **Settings → OAuth applications**:

- **Redirect URI**: the redirect URL shown by Activepieces in this dialog.
- **Type**: Confidential.
- **Permissions**: documents:read, documents:write, templates:read, templates:write, account:read, webhooks:write and offline_access.

Then paste the application's Client ID and Client Secret here, connect, and save within a minute: the approval code expires after 60 seconds.

Activepieces renews the access automatically when flows use the connection, and each renewal keeps it valid for another 30 days. A connection that goes 30 days without use expires; reconnect it then.`;

export const assinafyAuth = [
  PieceAuth.CustomAuth({
    displayName: 'API Key',
    description: API_KEY_DESCRIPTION,
    required: true,
    props: {
      api_key: PieceAuth.SecretText({
        displayName: 'API Key',
        description: 'The key created under My Account → API in Assinafy.',
        required: true,
      }),
      environment: Property.StaticDropdown({
        displayName: 'Environment',
        description:
          'Choose Sandbox only for keys created at app-sandbox.assinafy.com.br.',
        required: true,
        defaultValue: 'production',
        options: {
          disabled: false,
          options: [
            { label: 'Production', value: 'production' },
            { label: 'Sandbox (testing)', value: 'sandbox' },
          ],
        },
      }),
      account_id: Property.ShortText({
        displayName: 'Workspace ID',
        description:
          'Needed only when your Assinafy user belongs to more than one workspace. Copy it from My Account → Workspaces, e.g. 6401df46d6a6b0c692d9ec49.',
        required: false,
      }),
    },
    validate: async ({ auth }) =>
      validateCredentials(assinafyApi.apiKeyCredentials(auth)),
    getConnectionIdentifier: async ({ auth }) =>
      workspaceName(assinafyApi.apiKeyCredentials(auth)),
  }),
  PieceAuth.OAuth2({
    displayName: 'Assinafy Account',
    description: OAUTH_DESCRIPTION,
    required: true,
    authUrl: 'https://auth.assinafy.com.br/oauth/authorize',
    tokenUrl: 'https://api.assinafy.com.br/v1/oauth/token',
    scope: [
      'documents:read',
      'documents:write',
      'templates:read',
      'templates:write',
      'account:read',
      'webhooks:write',
      'offline_access',
    ],
    pkce: true,
    pkceMethod: 'S256',
    extra: { resource: 'https://api.assinafy.com.br' },
    authorizationMethod: OAuth2AuthorizationMethod.BODY,
    getConnectionIdentifier: async ({ auth }) =>
      workspaceName(assinafyApi.oauthCredentials(auth.access_token)),
  }),
];
