# Changelog

## 0.2.4

- Add the public verification code and verification link to document outputs and document webhook fields.
- Allow Update Signing Deadline to remove an existing deadline when New Deadline is empty.
- Allow ICP-Brasil certificate signers on templates whose placed fields belong only to Editor roles; placed signer fields still require a collect assignment and reject certificate signing.

## 0.2.3

- Add Find Contracts, Get Contract, Get Related Contracts, Set Contract Terms, Renew Contract and Terminate Contract, including amendments, external references, field clearing and concurrent-change checks.
- Add all contract lifecycle webhook events, selected-event samples, output fields and the document has_contract flag.
- Recover OAuth webhook secrets through endpoint updates and rotation; reject unsigned deliveries after incomplete signed-endpoint setup.
- Resume paginated signing-activity scans within polling budgets.
- Validate required template editor fields before signer changes, allow empty copy receiver roles and normalize unzoned deadlines to UTC while rejecting impossible calendar dates.
- Preserve structured API errors, enforce response-body timeouts and keep private request bodies out of transport logs.
- Support Node.js 26 LTS while retaining Node.js 24 compatibility, and update Zod and test dependencies.

## 0.2.2

- Digital certificate signers are limited to virtual assignments. Create Document from Template and Custom API Call reject collect certificate requests before signer changes or billable API calls with the stable code `DIGITAL_CERTIFICATE_REQUIRES_VIRTUAL`.

## 0.2.1

- Request Signatures and Create Document from Template support biometric identity verification with email or WhatsApp invitations, including CPF validation before signer changes.
- Document outputs include each signer's identity verification status; document filters and webhook events support identity review.
- OAuth webhook endpoints use signed deliveries, retain their creation secret on republish, and recover a missing secret by recreating the endpoint.
- Digital certificate requests validate the signer's saved or new CPF/CNPJ before signer changes.

## 0.2.0

- New Event (Instant) registers a webhook endpoint of its own for each flow (1 per workspace, or up to 3 on paid plans) and deletes it when the flow is turned off. **Replace Existing Webhook** reuses the oldest endpoint when none is free.
- On API key connections, webhook deliveries are signed (Standard Webhooks) and deliveries with a missing or invalid signature, or a timestamp more than five minutes off, are ignored. The `webhook-id` header is the deduplication key.
- Workspaces with a single webhook address keep using it.
- Create Signer and the signer resolution of Request Signatures and Create Document from Template send the CPF/CNPJ in the create request.
- CPF/CNPJ validation accepts alphanumeric CNPJs.
- Digital certificate verification is labelled with its cost of 0.5 credit per signer (0.95 with a WhatsApp invitation).
- `npm run lint` checks formatting with Prettier, and the publishing workflow runs it.

## 0.1.3

- HTTPS requests preserve Node.js certificate verification.
- Concurrent signer creation validates saved contact details and fills missing WhatsApp numbers.
- Contact details, identifiers, deadlines, result limits and option values are validated before writes.
- Template generation accepts ready templates regardless of status capitalization and excludes copy receivers from signing-order validation.
- Polling reports authorization failures without treating them as completed signatures.
- Node.js 24 LTS builds, Vitest 4 tests and coverage checks in the publishing workflow.
- Complete document flows and action, trigger and OAuth payload reference.

## 0.1.2

- OAuth connections use a sliding refresh window: each renewal keeps access valid for another 30 days; connections expire after 30 days without renewal.
- OAuth: the authorization request names the Assinafy API as the token's resource (`resource=https://api.assinafy.com.br`).
- Redirects are followed only to HTTPS addresses.
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
