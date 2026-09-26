# Assinafy for Activepieces

[Português (Brasil)](README.pt-BR.md)

Send documents for legally valid electronic signature with [Assinafy](https://www.assinafy.com.br) and act on the result in [Activepieces](https://www.activepieces.com) flows: upload a PDF, invite signers by email or WhatsApp, wait for the signatures and store the signed PDF wherever you need it.

- Package: `@assinafy/piece-assinafy`
- Requires Activepieces 0.88.2 or later
- Assinafy accepts only HTTPS with TLS 1.2 or higher, which the Node.js runtime of Activepieces uses by default
- API reference: <https://api.assinafy.com.br/v1/docs>

## Install

As a platform admin of your Activepieces instance:

1. Open **Platform Admin → Setup → Pieces** and click **Install Piece**.
2. Choose **NPM Registry**, enter the package name `@assinafy/piece-assinafy` and the version, for example `0.1.0`.
3. The piece appears as **Assinafy** in the flow builder.

To update, install the new version the same way.

## Connect your Assinafy account

The piece offers two connection types. Use **API Key** to automate your own workspace, and **Assinafy Account (OAuth)** when other people connect their own workspaces.

### API Key

1. Sign in to [Assinafy](https://app.assinafy.com.br) (or the [sandbox](https://app-sandbox.assinafy.com.br) for testing).
2. Open **My Account → API** and create an API key. A dedicated Assinafy user for automations keeps its access easy to control.
3. In Activepieces, create an Assinafy connection of type **API Key**:
   - **API Key**: the key you created.
   - **Environment**: **Production**, or **Sandbox** for keys created in the sandbox.
   - **Workspace ID**: only needed when your user belongs to more than one workspace. Copy it from **My Account → Workspaces**.

The connection is checked against `GET /v1/accounts` when you save it, and it is labelled with the workspace name.

### Assinafy Account (OAuth)

An owner of the Assinafy workspace registers an OAuth application once, under **Settings → OAuth applications**:

| Field | Value |
|---|---|
| Redirect URI | The redirect URL shown by Activepieces in the connection dialog, for example `https://automations.example.com/redirect` |
| Type | Confidential |
| Permissions | `documents:read`, `documents:write`, `templates:read`, `templates:write`, `account:read`, `webhooks:write`, `offline_access` |

Enter the application's Client ID and Client Secret in Activepieces, then sign in and choose the workspace to connect. Save the connection within a minute of approving: the approval code expires after 60 seconds. Each OAuth connection works with exactly one workspace. OAuth always uses the production environment; use an API key for the sandbox.

Activepieces renews the access automatically when flows use the connection, and each renewal keeps the connection valid for another 30 days. A connection only expires after 30 days without use, for example when its flows are off or run less than once every 30 days; reconnect it then. Deleting the connection in Activepieces does not revoke its access in Assinafy; revoke it under **Connected apps** in your Assinafy profile.

## The document flow

Every Assinafy flow moves a document through the same stages. The piece has one action per stage:

```
Upload ──► Send ──► Track ──► Sign ──► Collect
Document   Request  Get/Find  (in      Download
Document   Signatures  Documents  Assinafy)  Document
   │           │            ▲            │         │
   └─ Create from Template ┘            └── Store ──┘
```

1. **Upload**: [Upload Document](#upload-document) sends a PDF to `POST /v1/accounts/{accountId}/documents`, or [Create Document from Template](#create-document-from-template) generates the document from a ready template and sends it in one step.
2. **Send**: [Request Signatures](#request-signatures) creates the signature request with `POST /v1/documents/{documentId}/assignments`. Assinafy then emails or messages each signer.
3. **Track**: [Get Document](#get-document) and [Find Documents](#find-documents) read the status and signing progress; [Update Signing Deadline](#update-signing-deadline) and [Resend Signature Request](#resend-signature-request) nudge an in-flight request.
4. **Sign**: signers open the signing link and sign in Assinafy, with a one-time code by email or WhatsApp or an ICP-Brasil A1/A3 certificate.
5. **Collect**: [Download Document](#download-document) saves the signed PDF with its signature certificate so later steps can store it.

Triggers fire at the moments that matter: **Document Signed** when the signed PDF is ready, or **New Event (Instant)** for each signing event as it happens.

### Flow recipe: send a PDF for signature

1. Any trigger that provides a file (a form, an email attachment, a CRM record).
2. **Upload Document** with that file.
3. **Request Signatures** on the uploaded document, with each signer's name and email or WhatsApp number.
4. **Document Signed** trigger (in another flow) or a delay loop with **Get Document** until `status` is `certificated`.
5. **Download Document** with **File** set to *Signed PDF*, then upload the file to your storage (Google Drive, SharePoint, S3…).

### Flow recipe: generate a contract from a template

1. Any trigger with the customer's details.
2. **Create Document from Template**: pick the template, fill the signer for each role and the template fields. The document is created and sent in one step.

### Flow recipe: react the instant something happens

1. **New Event (Instant)** with the events you care about, for example *Document signed by all signers* and *Signer declined the document*.
2. A Router step that branches on `event`: store the signed PDF on `document_ready`, notify the owner on `signer_rejected_document`.

## Actions

Each action below lists the Assinafy API endpoint it calls and an example of the data it returns. All outputs use flat fields, except `signers`, which lists one record per signer so flows can loop over them. See [Output fields](#output-fields) for the full field list.

### Upload Document

Uploads a PDF (up to 25 MB) so you can request signatures on it. Each call creates a new document, so retries create duplicates.

- Endpoint: `POST /v1/accounts/{accountId}/documents` (multipart file upload)
- Inputs: **File** (required), **Document Name** (optional, defaults to the file name)

Returns the document, for example:

```json
{
  "id": "615601fab04c0a3147bb1246",
  "name": "Service agreement.pdf",
  "status": "uploading",
  "status_label": "Uploading",
  "is_closed": false,
  "account_id": "d199996981dbd199996981db",
  "page_count": null,
  "available_files": null,
  "created_at": "2026-09-01T12:00:00.000Z",
  "updated_at": "2026-09-01T12:00:00.000Z"
}
```

### Request Signatures

Sends a document to one or more people to sign. Existing signers are matched by email (or by name and WhatsApp number); missing signers are created, which requires a full name. Assinafy notifies signers right away, or by signing order when steps are set. Each call creates a new signature request, so do not retry blindly.

- Endpoint: `POST /v1/documents/{documentId}/assignments`
- Inputs: **Document** (required), **Signers** (required), **Message**, **Deadline**, **Send Copy To**

Example request body sent to Assinafy:

```json
{
  "method": "virtual",
  "signers": [
    {
      "id": "62d6ee35c7741ca4006b9e11",
      "verification_method": "Email",
      "notification_methods": ["Email"],
      "step": 1
    }
  ],
  "message": "Please sign the service agreement by Friday.",
  "expires_at": "2026-12-31T21:00:00.000Z",
  "copy_receivers": ["62d6ee35c7741ca4006b9e12"]
}
```

Returns the signature request:

```json
{
  "document_id": "615601fab04c0a3147bb1246",
  "message": "Please sign the service agreement by Friday.",
  "sender_email": "sender@example.com",
  "assignment_id": "615606ef81d199996981dbce",
  "signature_method": "virtual",
  "expires_at": "2026-12-31T21:00:00.000Z",
  "signer_count": 1,
  "signed_count": 0,
  "signer_emails": "maria@example.com",
  "signers": [
    {
      "id": "62d6ee35c7741ca4006b9e11",
      "full_name": "Maria Silva",
      "email": "maria@example.com",
      "whatsapp_phone_number": null,
      "step": 1,
      "verification_method": "Email",
      "notification_method": "Email",
      "signed": false,
      "signing_url": "https://api.assinafy.com.br/v1/sign/615601fab04c0a3147bb1246?email=maria@example.com"
    }
  ]
}
```

A fresh upload can still be receiving its file; the step waits up to 30 seconds for processing before sending. Copy recipients may not be available on every plan: when Assinafy does not keep a requested copy recipient, the step fails after sending and reports the signature request ID, so you do not invite the signers twice.

### Create Document from Template

Creates a document from a ready template and sends it for signature in one step. Each template signer role gets its own email, WhatsApp number, full name, CPF/CNPJ, verification and signing order inputs; editor roles are not signers, and their fields appear under **Template Fields** to pre-fill the document. Each call creates and sends a new document, so do not retry blindly.

- Endpoint: `POST /v1/accounts/{accountId}/templates/{templateId}/documents`
- Inputs: **Template** (required), **Signers** (one entry per template role, required), **Template Fields**, **Document Name**, **Message**, **Deadline**, **Tags**

Returns the document (same shape as **Upload Document**) with `template_id` set.

### Get Document

Gets one document with its status, signers and signing progress.

- Endpoint: `GET /v1/documents/{documentId}`
- Inputs: **Document** (required)

Returns the document shape shown in [Request Signatures](#request-signatures).

### Find Documents

Finds documents by name, signer or status, most recently updated first. Returns an empty list when nothing matches.

- Endpoint: `GET /v1/accounts/{accountId}/documents` with `search`, `status` and `sort=-updated_at`
- Inputs: **Search**, **Status**, **Maximum Results** (1–100, default 25)

Returns a list of documents.

### Download Document

Downloads a file of a document as a file for later steps. The signed PDF exists only after every signer has signed; while certification is still running the step waits up to a minute.

- Endpoint: `GET /v1/documents/{documentId}/download/{artifactName}`
- Inputs: **Document** (required), **File** (required: signed PDF, original, certificate page, ZIP bundle or PAdES), **File Name**

Returns:

```json
{
  "file": "https://files.example.com/service-agreement-certificated.pdf",
  "file_name": "service-agreement-certificated.pdf",
  "file_type": "certificated",
  "size_bytes": 48213,
  "document_id": "615601fab04c0a3147bb1246",
  "document_name": "Service agreement.pdf",
  "document_status": "certificated"
}
```

### Resend Signature Request

Sends the signing invitation to one signer again, using the signer's original channel. WhatsApp resends consume credits. Each call sends another notification.

- Endpoint: `PUT /v1/documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`
- Inputs: **Document** (required), **Signer** (required, the signers of the chosen document)

Returns `{ "sent": true, "document_id": "…", "assignment_id": "…", "signer_id": "…" }`.

### Update Signing Deadline

Sets a new deadline on the signature request of a document. The new deadline must be at least one hour in the future. Setting the same deadline again is safe.

- Endpoint: `PUT /v1/documents/{documentId}/assignments/{assignmentId}/reset-expiration`
- Inputs: **Document** (required), **New Deadline** (required)

Returns the signature request shape shown in [Request Signatures](#request-signatures).

### Delete Document

Permanently deletes a document. Only documents that are ready to send, waiting for signatures, declined, cancelled, expired or failed can be deleted; signed documents are kept. This cannot be undone, and a retry fails because the document is gone.

- Endpoint: `DELETE /v1/documents/{documentId}`
- Inputs: **Document** (required)

Returns `{ "deleted": true, "document_id": "…" }`.

### Find Signers

Finds the signers saved in the workspace by partial name or email. Returns an empty list when nothing matches.

- Endpoint: `GET /v1/accounts/{accountId}/signers` with `search`
- Inputs: **Search** (required), **Maximum Results** (1–100, default 25)

Returns a list of signers:

```json
[
  {
    "id": "62d6ee35c7741ca4006b9e11",
    "full_name": "Maria Silva",
    "email": "maria@example.com",
    "whatsapp_phone_number": null,
    "has_accepted_terms": false
  }
]
```

### Create Signer

Saves a new signer in the workspace. **Request Signatures** creates missing signers on its own, so use this only to register people ahead of time. It fails when a signer with the same email already exists.

- Endpoint: `POST /v1/accounts/{accountId}/signers`, then `PUT /v1/accounts/{accountId}/signers/{signerId}` when a CPF/CNPJ is given (the create endpoint does not accept it)
- Inputs: **Full Name** (required), **Email**, **WhatsApp Number**, **CPF or CNPJ**

Returns the signer shape shown in [Find Signers](#find-signers).

### Update Signer

Changes the name, contact details or CPF/CNPJ of a saved signer; only the fields you fill in change. Email and WhatsApp cannot change while the signer has verified that channel on a document still being signed, and changing an unverified channel invalidates invitations already sent.

- Endpoint: `PUT /v1/accounts/{accountId}/signers/{signerId}`
- Inputs: **Signer** (required), **Full Name**, **Email**, **WhatsApp Number**, **CPF or CNPJ**

Returns the signer shape shown in [Find Signers](#find-signers).

### Custom API Call

Calls any endpoint of the Assinafy API with the connection's credentials, for endpoints the piece does not cover. The credentials are sent only to the connection's Assinafy address, so **Follow redirects** must stay off. Workspace-scoped paths such as `/accounts/{accountId}/signers` need your workspace ID, which the piece resolves for you on its own actions.

Every document, signer and template input in the actions above is a dropdown, searchable except for the signer in **Resend Signature Request**, which lists the signers of the chosen document. You can also map an ID from a previous step.

## Triggers

| Trigger | When it fires | Delivery |
|---|---|---|
| Document Signed | Every signer has signed and the signed PDF is ready, for signings completed after the flow was turned on | Checked every few minutes. Any number of flows can use it. |
| New Event (Instant) | The selected Assinafy events happen: document signed by all, signer signed, signer declined, document cancelled, and more | Instant, through the workspace webhook |

**New Event (Instant)** uses the workspace webhook (`GET/PUT /v1/accounts/{accountId}/webhooks/subscriptions`), and Assinafy delivers each workspace's events to a single address:

- Use it in only one active flow per workspace; add a Router step to handle several event types.
- If the workspace already delivers events to another system, the flow does not start unless **Replace Existing Webhook** is turned on.
- Turning the flow off stops the webhook, but only while it still points at that flow.
- **Delivery Notice Email** receives Assinafy's notices about failed deliveries. It is required only when the workspace has no address yet.
- For document events, the flow receives the current state of the document, read from the API when the event arrives. If it cannot be read (for example after the document was deleted), the copy sent with the event is used.
- Assinafy retries a failed delivery once. Activepieces drops a repeated event that arrives within 30 seconds; for later repeats, `event_id` identifies the event.
- Each flow registers its webhook address with a random secret, and requests without it are ignored. The secret stays the same when the flow is republished or turned off and on, so deliveries already on their way still count. Assinafy does not sign its webhook requests, so keep the address private.

The document is signed as soon as the last signer signs, but the signed PDF is available only after certification finishes. **Document Signed** fires after certification; **Download Document** also waits up to a minute while certification is still running.

**Document Signed** fires once per document whose signing completed after the flow was turned on. It reads each new signed document's activity log (`GET /v1/documents/{documentId}/activities`) for the completion time, so documents signed earlier and edited later (for example tagged) do not fire it. Each check looks back ten minutes to tolerate clock differences. After downtime it catches up on the backlog over several checks, without skipping or repeating any.

## Signers

**Request Signatures** and **Create Document from Template** take contact details, not Assinafy signer IDs:

- A signer is matched by email, or by name and WhatsApp number when there is no email, so give the full name of a signer who has only a WhatsApp number. WhatsApp numbers match regardless of formatting, and a number without the country code matches the saved international number.
- If nobody matches, a signer is created, which requires a full name.
- A missing WhatsApp number is added to an existing signer. A WhatsApp number that differs from the saved one stops the step with an error instead of using the saved value.
- A CPF/CNPJ is saved only when the signer is created. Assinafy does not show saved CPFs, so the step never changes the CPF of an existing signer; use **Update Signer** for that.
- Change saved details with **Update Signer**; changing a channel invalidates invitations that were already sent.
- Every signer and copy recipient row is checked, and every one of them is looked up, before any signer is created or changed: a contact for the chosen channel, a valid CPF or CNPJ (including its check digits), no repeated email or WhatsApp number, no person reached twice through different details, and the signing order rules below.

## Verification and costs

Signers prove their identity while signing with one of four methods; A1 and A3 ICP-Brasil certificates both use the digital certificate method:

| Verification | Invitation | Cost per signer |
|---|---|---|
| Email code (default) | Email | Free |
| WhatsApp code | WhatsApp | 0.45 credit (paid plans) |
| ICP-Brasil digital certificate (A1 or A3) | Email | 2 credits |
| ICP-Brasil digital certificate (A1 or A3) | WhatsApp | 2.45 credits |

When **Verification** is empty, it is email, or WhatsApp when the signer has only a WhatsApp number. Digital certificate signing needs the Digital Certificate feature on the Assinafy plan, the signer's CPF or CNPJ saved in Assinafy (given in the step when the signer is new, or set with **Update Signer**), and the signer alone in their signing order step. Every signature request also uses one document from the plan, or one credit when the allowance is used up.

## Signing order

Leave **Signing Order** empty for everyone to sign at the same time. To sign in sequence, set it on every signer: all signers with `1` are invited first, `2` after all of them sign, and so on. The numbers must start at 1 without gaps, and a digital certificate signer cannot share a number with anyone.

## Output fields

Document and signature request outputs:

| Field | Description |
|---|---|
| `id`, `name` | Document ID and name |
| `account_id`, `signing_url` | The workspace, and the link to the signing page |
| `status`, `status_label` | Status code (for example `pending_signature`, `certificated`) and its readable label |
| `is_closed` | Whether the signing process is finished |
| `available_files` | Files that can be downloaded, for example `original, certificated, certificate-page, bundle` |
| `signer_count`, `signed_count`, `signer_emails` | Signing progress |
| `signers` | One entry per signer: name, email, WhatsApp, step, verification, whether they signed, signing link |
| `assignment_id`, `signature_method`, `expires_at` | The signature request and its deadline |
| `message`, `sender_email`, `document_id` | Signature request only: invitation text, sender, document |
| `decline_reason`, `declined_by_name`, `declined_by_email` | Filled when a signer declines |
| `tags`, `page_count`, `template_id`, `created_at`, `updated_at` | Other document details |

Signer outputs: `id`, `full_name`, `email`, `whatsapp_phone_number`, `has_accepted_terms`.

**New Event (Instant)** outputs:

| Field | Description |
|---|---|
| `event_id`, `event`, `message`, `occurred_at` | The event, for example `document_ready`, and when it happened |
| `account_id` | The workspace |
| `actor_type`, `actor_id`, `actor_name`, `actor_email` | Who caused it: a user, signer or the workspace |
| `object_type`, `object_id`, `object_name` | What it happened to: a document, signer or template |
| `detail_*` | Event details, for example `detail_signer_email` or `detail_error_message` |
| `document_*` | Every document field above, prefixed with `document_`; empty for events about signers or templates |

## Troubleshooting

| Message | What to do |
|---|---|
| `HTTP 401 … check the API key` | The key is wrong, was deleted, or belongs to the other environment. Create a new key or change **Environment**. |
| `This API key can access N workspaces` | Set **Workspace ID** on the connection. |
| `… is not available for this document yet` | The file does not exist yet, for example the signed PDF before everyone signs. |
| `This Assinafy workspace already sends its webhooks to …` | Another system receives the workspace events. Turn on **Replace Existing Webhook** only if that system no longer needs them, or use **Document Signed**. |
| `HTTP 403 … approved permissions` | The item belongs to another workspace or needs a different Assinafy role. On an OAuth connection, a missing permission also causes it: add the permission to the OAuth application and reconnect. Billing, members and credentials are never available to OAuth connections. |
| `HTTP 401` on an OAuth connection that used to work | The access was revoked under **Connected apps** in Assinafy, the OAuth application was deleted or disabled, the app was approved again with different permissions, or the connection went 30 days without use. Reconnect. |
| `… is saved in Assinafy with a different WhatsApp number` | Update the signer with **Update Signer**, or leave WhatsApp Number empty to use the saved number. |
| `… must be the only signer in their signing order step` | Give the digital certificate signer a signing order number of their own. |
| `Assinafy is still receiving the file of this document` | The upload was still in progress after 30 seconds. Run the step again, or add a Delay step after **Upload Document**. |

## Development

Requirements: Node.js 24 LTS and Git.

```sh
npm install              # also downloads the Activepieces libraries
npm run typecheck        # source and tests
npm test                 # unit tests, no network
npm run test:coverage    # with coverage thresholds
npm run build            # bundles the piece into dist/
```

The piece is built against the Activepieces piece framework at the commit in `ACTIVEPIECES_REF`. `npm install` downloads the framework, common and core libraries from that commit into `.activepieces/`, and the build bundles them into a single file. To build against a newer Activepieces, change `ACTIVEPIECES_REF`, run `npm install` and run the tests.

Unit tests mock the HTTP client and block any real network request. One upload test runs the real Activepieces HTTP client against a stubbed `fetch` to check the multipart request on the wire.

### Implementation notes

- Requests made by triggers time out after 15 seconds, well within the time Activepieces gives a trigger run; actions allow 120 seconds.
- When two runs create the same new signer at the same moment, the run that loses reuses the signer the other one created.
- Requests do not follow redirects automatically. A redirect is followed only for reads and downloads and only to an `https://` address, and the credentials are left out when it points outside the Assinafy address, for example to file storage.
- Uploads use the `form-data` package. The Activepieces HTTP client sets the multipart content type and boundary only for `form-data` bodies; a global `FormData` body would be sent as JSON.
- Assinafy's create-signer endpoint does not accept a CPF/CNPJ, so it is set with a follow-up update.
- Assinafy returns at most 50 items per list page, and repeats the last page when asked for a page beyond the end. List reads follow the `X-Pagination-Page-Count` header and stop at a short or repeated page.
- The API reference documents no single-template endpoint, so the template form and action scan up to 500 templates.
- **Document Signed** keeps its own state and keeps it when a flow is republished: the time it was turned on, the last completed check, the position of an unfinished backlog scan, and a ledger of documents it fired recently.
  - Signed documents are listed newest first, cannot be deleted, and only move down the list as others are signed or edited. A backlog scan therefore resumes after the last document it examined (by update time and ID), and the time checkpoint advances only when the scan has reached documents older than the previous check.
  - A document fires when its completion time (the newest `document_ready` activity, else the newest `signer_signed_document`) is after the trigger was turned on and no more than 24 hours before the start of the check window. A document with neither activity does not fire. The ledger remembers the documents fired in that period so later edits do not fire them again, drops entries that can no longer pass the rule, and holds at most 5,000 entries to stay within the Activepieces store limit.
  - Each check reads at most 10 pages of 50 documents and 40 activity logs, and stops after 30 seconds; the next check continues where it stopped. An error after some documents were examined keeps that progress; an error before any fails the check.
  - A document whose activity log cannot be read is tried again on the next two checks. After that it fires with its update time as the completion time, so one broken document cannot stop the trigger.
  - Activepieces saves a polling trigger's progress before it starts the flow runs for the returned items. If starting them fails, those documents are not returned again. This applies to every Activepieces polling trigger; the piece gets no signal to replay them.

### Sandbox tests

`test/live.test.ts` runs against the Assinafy sandbox only and deletes everything it creates:

```sh
ASSINAFY_API_KEY=<sandbox key> npm run test:live
```

| Variable | Effect |
|---|---|
| `ASSINAFY_ACCOUNT_ID` | Workspace to use when the key has several |
| `ASSINAFY_LIVE_SEND=1` | Also sends a signature request to an `example.com` address (uses one plan document) |
| `ASSINAFY_LIVE_WEBHOOK=1` | Also enables and disables the workspace webhook; fails instead of replacing another destination |
| `ASSINAFY_LIVE_WEBHOOK_EMAIL` | Delivery notice address for the webhook check (defaults to an `example.com` address) |

The suite also reads a document's activity log, which **Document Signed** relies on.

### Try it in Activepieces

Run `npm run build`, then `npm pack ./dist` to create a `.tgz` file. In Activepieces, open **Setup → Pieces** in the platform admin, click **Install Piece**, choose **Packed Archive (.tgz)** and upload the file.

### Translations

`src/i18n/translation.json` is generated from the piece and `src/i18n/pt.json` holds the Brazilian Portuguese strings. After changing any display name, description or option label:

```sh
npm run translations
```

Then update `pt.json`. The tests fail while either file is out of date.

Activepieces does not translate the connection dialog of a piece with more than one connection type, so the dialog is shown in English.

### Publishing

1. Bump `version` in `package.json` (patch for new actions, optional inputs and fixes; major for removals, new required inputs or changed behavior) and add the release to `CHANGELOG.md`.
2. Run `npm run licenses`. It rewrites `LICENSE` with the license of every package bundled into the published file.
3. Check the package with `npm run build && npm publish ./dist --dry-run`.
4. Commit, push to `main`, and push a `piece-assinafy-vX.Y.Z` tag that matches the version. The **Publish Assinafy piece** workflow typechecks, tests and builds the piece, then publishes it to npm through trusted publishing, together with the READMEs, `LICENSE` and `CHANGELOG.md`.

Never rename an action, trigger or input after release: flows reference them by name.

## License

MIT. The published package also bundles the Activepieces libraries and a few npm packages; `LICENSE` lists each one with its license.
