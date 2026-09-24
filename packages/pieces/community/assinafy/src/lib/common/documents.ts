import { HttpMethod } from '@activepieces/pieces-common';
import { AssinafyClient } from './client';
import { ApiDocument, assinafyFormat } from './format';

async function waitWhile({
  client,
  documentId,
  pending,
  checks,
  intervalMs,
}: {
  client: AssinafyClient;
  documentId: string;
  pending: (document: ApiDocument) => boolean;
  checks: number;
  intervalMs: number;
}): Promise<ApiDocument> {
  const path = `/documents/${encodeURIComponent(documentId)}`;
  let document = await client.request<ApiDocument>({
    method: HttpMethod.GET,
    path,
  });
  for (let attempt = 0; attempt < checks && pending(document); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    document = await client.request<ApiDocument>({
      method: HttpMethod.GET,
      path,
    });
  }
  return document;
}

async function waitUntilProcessed({
  client,
  documentId,
}: {
  client: AssinafyClient;
  documentId: string;
}): Promise<ApiDocument> {
  const document = await waitWhile({
    client,
    documentId,
    pending: (candidate) => PROCESSING.includes(candidate.status ?? ''),
    checks: PROCESSING_CHECKS,
    intervalMs: PROCESSING_CHECK_MS,
  });
  if (PROCESSING.includes(document.status ?? '')) {
    throw new Error(
      'Assinafy is still receiving the file of this document. Try again in a minute.'
    );
  }
  if (document.status === 'failed') {
    throw new Error(
      `Assinafy could not process this document (status: ${assinafyFormat.statusLabel(
        document.status
      )}). Upload it again.`
    );
  }
  return document;
}

const PROCESSING = ['uploading'];
const PROCESSING_CHECKS = 15;
const PROCESSING_CHECK_MS = 2000;

export const assinafyDocuments = {
  waitUntilProcessed,
  waitWhile,
};
