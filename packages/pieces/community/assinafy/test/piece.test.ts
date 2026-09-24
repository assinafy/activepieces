import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pieceTranslation } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafy } from '../src/index';
import { PRODUCTION, SANDBOX, apiKeyAuth, context, oauthAuth } from './helpers';

const metadata = assinafy.metadata();
const actions = Object.values(metadata.actions);
const triggers = Object.values(metadata.triggers);
const handWritten = actions.filter(
  (action) => action.name !== 'custom_api_call'
);

describe('piece metadata', () => {
  test('registers every action and trigger under a stable snake_case name', () => {
    expect(Object.keys(metadata.actions).sort()).toEqual(
      [
        'create_document_from_template',
        'create_signer',
        'custom_api_call',
        'delete_document',
        'download_document',
        'find_documents',
        'find_signers',
        'get_document',
        'request_signatures',
        'resend_signature_request',
        'update_signer',
        'update_signing_deadline',
        'upload_document',
      ].sort()
    );
    expect(Object.keys(metadata.triggers).sort()).toEqual([
      'document_signed',
      'new_event',
    ]);
    for (const name of [
      ...Object.keys(metadata.actions),
      ...Object.keys(metadata.triggers),
    ]) {
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  test('describes the piece for the catalog', () => {
    expect(metadata.displayName).toBe('Assinafy');
    expect(metadata.logoUrl).toMatch(/^https:\/\/www\.assinafy\.com\.br\//);
    expect(metadata.categories?.length).toBeGreaterThan(0);
    expect(metadata.description).toBeTruthy();
    expect(Array.isArray(metadata.auth)).toBe(true);
  });

  test('tags every hand-written action for people and AI agents', () => {
    for (const action of handWritten) {
      expect(action.audience, action.name).toBe('both');
      expect(action.aiMetadata?.description, action.name).toBeTruthy();
      expect(typeof action.aiMetadata?.idempotent, action.name).toBe('boolean');
      expect(['READ', 'SEARCH', 'WRITE', 'DESTRUCTIVE'], action.name).toContain(
        action.classification
      );
      expect(action.description, action.name).toBeTruthy();
    }
  });

  test('marks only deletion as destructive and reads as idempotent', () => {
    const byName = Object.fromEntries(
      handWritten.map((action) => [action.name, action])
    );
    expect(byName['delete_document'].classification).toBe('DESTRUCTIVE');
    for (const action of handWritten.filter(
      (a) => a.classification === 'READ' || a.classification === 'SEARCH'
    )) {
      expect(action.aiMetadata?.idempotent, action.name).toBe(true);
    }
  });

  test('tags every trigger as a read with an agent description and sample data', () => {
    for (const trigger of triggers) {
      expect(trigger.classification, trigger.name).toBe('READ');
      expect(trigger.aiMetadata?.description, trigger.name).toBeTruthy();
      expect(trigger.sampleData, trigger.name).toBeTruthy();
    }
  });

  test('gives every input a description', () => {
    for (const step of [...actions, ...triggers]) {
      for (const [key, prop] of Object.entries(step.props)) {
        if (prop.type === 'MARKDOWN' || step.name === 'custom_api_call') {
          continue;
        }
        expect(prop.description, `${step.name}.${key}`).toBeTruthy();
      }
    }
  });
});

describe('translations', () => {
  const readLocale = (name: string): Record<string, string> =>
    JSON.parse(
      readFileSync(
        join(__dirname, '..', 'src', 'i18n', `${name}.json`),
        'utf-8'
      )
    );
  const source = readLocale('translation');

  const collect = (value: unknown, path: string[]): string[] => {
    if (path.length === 0) {
      return typeof value === 'string' ? [value] : [];
    }
    if (typeof value !== 'object' || value === null) {
      return [];
    }
    const [head, ...rest] = path;
    const record = value as Record<string, unknown>;
    return head === '*'
      ? Object.values(record).flatMap((item) => collect(item, rest))
      : collect(record[head], rest);
  };

  test('translation.json lists every user-facing string of the piece', () => {
    const strings = pieceTranslation.pathsToValuesToTranslate
      .filter((path) => !path.startsWith('auth.'))
      .flatMap((path) => collect(metadata, path.split('.')))
      .filter(Boolean)
      .map((text) => text.slice(0, 512));
    expect(Object.keys(source).sort()).toEqual([...new Set(strings)].sort());
  });

  test('the Portuguese translation covers every string', () => {
    const portuguese = readLocale('pt');
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(source).sort());
    for (const [key, value] of Object.entries(portuguese)) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  test('the Portuguese translation is applied to the piece', () => {
    const translated = pieceTranslation.translatePiece({
      piece: {
        ...metadata,
        name: '@assinafy/piece-assinafy',
        version: '0.1.0',
        i18n: { pt: readLocale('pt') },
      } as never,
      locale: 'pt' as never,
    }) as unknown as typeof metadata;
    expect(translated.actions['request_signatures'].displayName).toBe(
      'Solicitar Assinaturas'
    );
    expect(translated.triggers['document_signed'].displayName).toBe(
      'Documento Assinado'
    );
  });
});

describe('Custom API Call', () => {
  const customApiCall = assinafy.getAction('custom_api_call');
  const props = {
    method: HttpMethod.GET,
    url: { url: '/accounts' },
    headers: {},
    queryParams: {},
    body: undefined,
    body_type: 'none',
    failsafe: false,
    timeout: undefined,
    response_is_binary: false,
    followRedirects: false,
  };

  const stubFetch = () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 200, message: '', data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const header = (headers: Record<string, string>, name: string) =>
    Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];

  test('calls the API key environment with X-Api-Key', async () => {
    const fetchMock = stubFetch();
    await customApiCall?.run(
      context({
        props,
        extra: {
          auth: {
            ...apiKeyAuth,
            props: { ...apiKeyAuth.props, environment: 'sandbox' },
          },
        },
      })
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> }
    ];
    expect(url).toBe(`${SANDBOX}/accounts`);
    expect(header(init.headers, 'x-api-key')).toBe('test-api-key');
  });

  test('sends the credentials only to the connection Assinafy address', async () => {
    const fetchMock = stubFetch();
    const withUrl = (url: string) =>
      customApiCall?.run(context({ props: { ...props, url: { url } } }));
    await expect(
      withUrl('https://attacker.example.com/collect')
    ).rejects.toThrow(
      `Custom API Call only sends your Assinafy credentials to ${PRODUCTION}.`
    );
    await expect(
      withUrl(`${PRODUCTION}.attacker.example.com/collect`)
    ).rejects.toThrow('only sends your Assinafy credentials');
    await expect(withUrl(`${SANDBOX}/accounts`)).rejects.toThrow(
      'only sends your Assinafy credentials'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await withUrl(`${PRODUCTION}/accounts`);
    expect(fetchMock).toHaveBeenCalledWith(
      `${PRODUCTION}/accounts`,
      expect.anything()
    );
  });

  test('refuses to follow redirects with the credentials, including when the setting is missing', async () => {
    const fetchMock = stubFetch();
    await expect(
      customApiCall?.run(
        context({ props: { ...props, followRedirects: true } })
      )
    ).rejects.toThrow('Turn off "Follow redirects"');
    const withoutSetting = Object.fromEntries(
      Object.entries(props).filter(([key]) => key !== 'followRedirects')
    );
    await expect(
      customApiCall?.run(context({ props: withoutSetting }))
    ).rejects.toThrow('Turn off "Follow redirects"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('calls production with the OAuth bearer token', async () => {
    const fetchMock = stubFetch();
    await customApiCall?.run(context({ props, extra: { auth: oauthAuth } }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> }
    ];
    expect(url).toBe(`${PRODUCTION}/accounts`);
    expect(header(init.headers, 'authorization')).toBe(
      'Bearer test-access-token'
    );
  });

  test('shows production as the default base URL before a connection is chosen', async () => {
    const urlProp = customApiCall?.props['url'] as unknown as {
      props: (value: {
        auth?: unknown;
      }) => Promise<Record<string, { defaultValue?: string }>>;
    };
    await expect(urlProp.props({ auth: undefined })).resolves.toMatchObject({
      url: { defaultValue: '' },
    });
    await expect(urlProp.props({ auth: apiKeyAuth })).resolves.toMatchObject({
      url: { defaultValue: PRODUCTION },
    });
  });
});
