import { readFileSync } from 'node:fs';
import { AppConnectionType } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../src/lib/auth';
import { assinafyApi } from '../src/lib/common/client';
import { findDocuments } from '../src/lib/actions/find-documents';
import { assinafyProps } from '../src/lib/common/props';
import { documentSigned } from '../src/lib/triggers/document-signed';
import { newEvent } from '../src/lib/triggers/new-event';
import { context } from './helpers';

vi.unmock('@activepieces/pieces-common');

const enabled = process.env['ASSINAFY_OAUTH_LIVE'] === '1';
const tokenFile = process.env['ASSINAFY_OAUTH_TOKEN_FILE'];
const auth = {
  type: AppConnectionType.OAUTH2,
  access_token:
    enabled && tokenFile
      ? (
          JSON.parse(readFileSync(tokenFile, 'utf8')) as {
            access_token: string;
          }
        ).access_token
      : (process.env['ASSINAFY_OAUTH_ACCESS_TOKEN'] ?? ''),
  data: {},
};

describe.skipIf(!enabled)('Assinafy production OAuth (read only)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  test('resolves exactly one authorized production workspace and its label', async () => {
    expect(auth.access_token).not.toBe('');
    const client = assinafyApi.forAuth(auth as never);
    expect(client.baseUrl).toBe(assinafyApi.urls.production);
    const accounts = await client.list<{ id: string; name: string }>({
      method: HttpMethod.GET,
      path: '/accounts',
    });
    expect(accounts).toHaveLength(1);
    expect(await client.accountId()).toBe(accounts[0].id);
    expect(
      await assinafyAuth[1].getConnectionIdentifier?.({
        auth: auth as never,
        server: {} as never,
      })
    ).toBe(accounts[0].name);
  });

  test('reads documents, template and signer pickers, and both trigger samples with bearer authentication', async () => {
    expect(
      await findDocuments.run(context({ props: { limit: 2 }, extra: { auth } }))
    ).toBeInstanceOf(Array);
    for (const dropdown of [
      assinafyProps.document('Document'),
      assinafyProps.template('Template'),
      assinafyProps.signer('Signer'),
    ]) {
      const options = await dropdown.options(
        { auth: auth as never },
        {} as never
      );
      expect(options.disabled, options.placeholder).toBe(false);
    }
    expect(
      await documentSigned.test?.(context({ props: {}, extra: { auth } }))
    ).toBeInstanceOf(Array);
    expect(
      await newEvent.test?.(
        context({ props: { events: ['document_ready'] }, extra: { auth } })
      )
    ).toBeInstanceOf(Array);
  });
});
