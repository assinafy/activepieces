import { beforeEach, vi } from 'vitest';

vi.mock('@activepieces/pieces-common', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@activepieces/pieces-common')
  >();
  const { sendRequest } = await import('./http-mock');
  return {
    ...actual,
    httpClient: { sendRequest: (...args: unknown[]) => sendRequest(...args) },
  };
});

beforeEach(async () => {
  const { sendRequest } = await import('./http-mock');
  sendRequest.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      throw new Error(
        `Unit tests must not reach the network: ${String(input)}`
      );
    })
  );
});
