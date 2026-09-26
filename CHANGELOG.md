# Changelog

## 0.1.2

- OAuth: the connection dialog and READMEs describe Assinafy's sliding refresh (each renewal keeps a connection valid for another 30 days; it expires only after 30 days without use) instead of a monthly reconnect.
- OAuth: the authorization request names the Assinafy API as the token's resource (`resource=https://api.assinafy.com.br`).
- Redirects to an address without HTTPS are no longer followed.
- Connection errors include their reason, for example a TLS handshake failure, and an HTTP 403 error lists its possible causes.

## 0.1.1

- The package's homepage, repository and issue links point to https://github.com/assinafy/activepieces.

## 0.1.0

First release.

- Connections: API key (production or sandbox, optional workspace ID) and OAuth with PKCE.
- Actions: Upload Document, Request Signatures, Create Document from Template, Get Document, Find Documents, Download Document, Resend Signature Request, Update Signing Deadline, Delete Document, Find Signers, Create Signer, Update Signer and Custom API Call.
- Triggers: Document Signed (checked every few minutes) and New Event (Instant, through the workspace webhook).
- Signers are given by email or WhatsApp number and are reused or created automatically.
- Labelled output fields in the flow builder and data selector.
- Brazilian Portuguese translation.
