import { createPiece, PieceCategory } from '@activepieces/pieces-framework';
import { createCustomApiCallAction } from '@activepieces/pieces-common';
import { assinafyAuth } from './lib/auth';
import { assinafyApi } from './lib/common/client';
import { assinafyValues } from './lib/common/values';
import { createDocumentFromTemplate } from './lib/actions/create-document-from-template';
import { createSigner } from './lib/actions/create-signer';
import { deleteDocument } from './lib/actions/delete-document';
import { downloadDocument } from './lib/actions/download-document';
import { findDocuments } from './lib/actions/find-documents';
import { findSigners } from './lib/actions/find-signers';
import { getDocument } from './lib/actions/get-document';
import { requestSignatures } from './lib/actions/request-signatures';
import { resendSignatureRequest } from './lib/actions/resend-signature-request';
import { updateSigner } from './lib/actions/update-signer';
import { updateSigningDeadline } from './lib/actions/update-signing-deadline';
import { uploadDocument } from './lib/actions/upload-document';
import { documentSigned } from './lib/triggers/document-signed';
import { newEvent } from './lib/triggers/new-event';

export const assinafy = createPiece({
  displayName: 'Assinafy',
  description:
    'Brazilian electronic signature platform. Send documents for legally valid signature and get the signed files back.',
  auth: assinafyAuth,
  minimumSupportedRelease: '0.88.2',
  logoUrl:
    'https://www.assinafy.com.br/images/favicons/android-chrome-512x512.png',
  categories: [PieceCategory.CONTENT_AND_FILES, PieceCategory.PRODUCTIVITY],
  authors: ['assinafy'],
  actions: [
    uploadDocument,
    requestSignatures,
    createDocumentFromTemplate,
    getDocument,
    findDocuments,
    downloadDocument,
    resendSignatureRequest,
    updateSigningDeadline,
    deleteDocument,
    findSigners,
    createSigner,
    updateSigner,
    createCustomApiCallAction({
      auth: assinafyAuth,
      baseUrl: (auth) =>
        auth
          ? assinafyApi.credentialsFor(auth).baseUrl
          : assinafyApi.urls.production,
      authMapping: async (auth, propsValue) => {
        const credentials = assinafyApi.credentialsFor(auth);
        const url =
          assinafyValues.readText({ record: propsValue['url'], key: 'url' }) ??
          '';
        const absolute =
          url.startsWith('http://') || url.startsWith('https://');
        if (absolute && !url.startsWith(`${credentials.baseUrl}/`)) {
          throw new Error(
            `Custom API Call only sends your Assinafy credentials to ${credentials.baseUrl}. Enter a path such as /accounts instead of a full URL to another address.`
          );
        }
        if (propsValue['followRedirects'] !== false) {
          throw new Error(
            'Turn off "Follow redirects": a redirect could forward your Assinafy credentials to another address. The response then includes the redirect location instead.'
          );
        }
        return credentials.headers;
      },
      description:
        'Call any Assinafy API endpoint (reference: https://api.assinafy.com.br/v1/docs). Workspace-scoped paths such as /accounts/{accountId}/signers need your workspace ID.',
    }),
  ],
  triggers: [newEvent, documentSigned],
});
