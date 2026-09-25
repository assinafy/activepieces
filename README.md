# Assinafy for Activepieces

[Português (Brasil)](README.pt-BR.md)

Send documents for legally valid electronic signature with [Assinafy](https://www.assinafy.com.br) and act on the result in [Activepieces](https://www.activepieces.com) flows: upload a PDF, invite signers by email or WhatsApp, wait for the signatures and store the signed PDF wherever you need it.

- Package: `@assinafy/piece-assinafy`
- Requires Activepieces 0.88.2 or later
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

The connection is checked when you save it, and it is labelled with the workspace name.

### Assinafy Account (OAuth)

An owner of the Assinafy workspace registers an OAuth application once, under **Settings → OAuth applications**:

| Field | Value |
|---|---|
| Redirect URI | The redirect URL shown by Activepieces in the connection dialog, for example `https://automations.example.com/redirect` |
| Type | Confidential |
| Permissions | `documents:read`, `documents:write`, `templates:read`, `templates:write`, `account:read`, `webhooks:write`, `offline_access` |

Enter the application's Client ID and Client Secret in Activepieces, then sign in and choose the workspace to connect. Each OAuth connection works with exactly one workspace. OAuth always uses the production environment; use an API key for the sandbox.

Assinafy ends OAuth connections 30 days after the user approves them, and refreshing does not extend that. Reconnect monthly, or use an API key for automations that must run unattended.

## Common flows

**Send a PDF for signature**

1. Any trigger that provides a file (a form, an email attachment, a CRM record).
2. **Upload Document** with that file.
3. **Request Signatures** on the uploaded document, with each signer's name and email or WhatsApp number.

**Store every signed contract**

1. **Document Signed** trigger.
2. **Download Document** with **File** set to *Signed PDF*.
3. Upload the file to your storage (Google Drive, SharePoint, S3…).

**Generate a contract from a template**

1. Any trigger with the customer's details.
2. **Create Document from Template**: pick the template, fill the signer for each role and the template fields.

## Actions

| Action | What it does | Main inputs | Output |
|---|---|---|---|
| Upload Document | Uploads a PDF (up to 25 MB) | File, optional name | Document |
| Request Signatures | Sends a document for signature; waits up to 30 seconds while the file of a fresh upload is still being received | Document, signers (name, email or WhatsApp, verification, CPF/CNPJ, signing order), message, deadline, copy recipients | Signature request |
| Create Document from Template | Creates a document from a ready template and sends it | Template, a signer per role, template fields, name, message, deadline, tags | Document |
| Get Document | Reads a document and its signing progress | Document | Document |
| Find Documents | Searches documents, newest update first | Search text, status, maximum results (1–100) | List of documents |
| Download Document | Saves a document file for later steps; waits up to a minute while certification finishes | Document, file (signed PDF, original, certificate page, ZIP bundle, PAdES), file name | File |
| Resend Signature Request | Sends the invitation to a signer again | Document, signer | Send result |
| Update Signing Deadline | Sets a new deadline on the signature request | Document, new deadline | Signature request |
| Delete Document | Permanently deletes a document that is not signed | Document | Confirmation |
| Find Signers | Searches saved signers | Search text, maximum results (1–100) | List of signers |
| Create Signer | Saves a signer | Full name, email, WhatsApp, CPF/CNPJ | Signer |
| Update Signer | Changes a saved signer | Signer, fields to change | Signer |
| Custom API Call | Calls any endpoint of the Assinafy API with the connection's credentials, which are sent only to the connection's Assinafy address (so **Follow redirects** must stay off) | Method, URL, headers, query, body | Raw API response |

Every document, signer and template input is a dropdown, searchable except for the signer in **Resend Signature Request**, which lists the signers of the chosen document. You can also map an ID from a previous step.

### Signers

**Request Signatures** and **Create Document from Template** take contact details, not Assinafy signer IDs:

- A signer is matched by email, or by name and WhatsApp number when there is no email, so give the full name of a signer who has only a WhatsApp number. WhatsApp numbers match regardless of formatting, and a number without the country code matches the saved international number.
- If nobody matches, a signer is created, which requires a full name.
- A missing WhatsApp number is added to an existing signer. A WhatsApp number that differs from the saved one stops the step with an error instead of using the saved value.
- A CPF/CNPJ is saved only when the signer is created. Assinafy does not show saved CPFs, so the step cannot compare them and never changes the CPF of an existing signer.
- Change saved details with **Update Signer**; changing a channel invalidates invitations that were already sent.
- Every signer and copy recipient row is checked, and every one of them is looked up, before any signer is created or changed: a contact for the chosen channel, a valid CPF or CNPJ (including its check digits), no repeated email or WhatsApp number, no person reached twice through different details, and the signing order rules below.

### Verification and costs

| Verification | Invitation | Cost per signer |
|---|---|---|
| Email code (default) | Email | Free |
| WhatsApp code | WhatsApp | 0.45 credit (paid plans) |
| ICP-Brasil digital certificate | Email | 2 credits |
| ICP-Brasil digital certificate | WhatsApp | 2.45 credits |

When **Verification** is empty, it is email, or WhatsApp when the signer has only a WhatsApp number. Digital certificate signing needs the Digital Certificate feature on the Assinafy plan, the signer's CPF or CNPJ saved in Assinafy (given in the step when the signer is new, or set with **Update Signer**), and the signer alone in their signing order step. Every signature request also uses one document from the plan, or one credit when the allowance is used up.

Copy recipients may not be available on every Assinafy plan. When Assinafy does not keep a requested copy recipient, **Request Signatures** fails after sending, with the signature request ID; do not run it again for the same document, or the signers are invited twice.

### Signing order

Leave **Signing Order** empty for everyone to sign at the same time. To sign in sequence, set it on every signer: all signers with `1` are invited first, `2` after all of them sign, and so on. The numbers must start at 1 without gaps, and a digital certificate signer cannot share a number with anyone.

In **Create Document from Template**, each signer role of the template has its own email, WhatsApp number, full name, CPF/CNPJ, verification and signing order inputs. Editor roles are not signers: their fields appear under **Template Fields**.

## Triggers

| Trigger | When it fires | Delivery |
|---|---|---|
| Document Signed | Every signer has signed and the signed PDF is ready, for signings completed after the flow was turned on | Checked every few minutes. Any number of flows can use it. |
| New Event (Instant) | The selected Assinafy events happen: document signed by all, signer signed, signer declined, document cancelled, and more | Instant, through the workspace webhook |

**New Event (Instant)** uses the workspace webhook, and Assinafy delivers each workspace's events to a single address:

- Use it in only one active flow per workspace; add a Router step to handle several event types.
- If the workspace already delivers events to another system, the flow does not start unless **Replace Existing Webhook** is turned on.
- Turning the flow off stops the webhook, but only while it still points at that flow.
- **Delivery Notice Email** receives Assinafy's notices about failed deliveries. It is required only when the workspace has no address yet.
- For document events, the flow receives the current state of the document, read from the API when the event arrives. If it cannot be read (for example after the document was deleted), the copy sent with the event is used.
- Assinafy retries a failed delivery once. Activepieces drops a repeated event that arrives within 30 seconds; for later repeats, `event_id` identifies the event.
- Each flow registers its webhook address with a random secret, and requests without it are ignored. The secret stays the same when the flow is republished or turned off and on, so deliveries already on their way still count. Assinafy does not sign its webhook requests, so keep the address private.

The document is signed as soon as the last signer signs, but the signed PDF is available only after certification finishes. **Document Signed** fires after certification; **Download Document** also waits up to a minute while certification is still running.

**Document Signed** fires once per document whose signing completed after the flow was turned on. It reads each new signed document's activity log for the completion time, so documents signed earlier and edited later (for example tagged) do not fire it. Each check looks back ten minutes to tolerate clock differences. After downtime it catches up on the backlog over several checks, without skipping or repeating any.

## Output fields

Outputs are flat and ready for tables and spreadsheets, except `signers`, which lists one record per signer so flows can loop over them.

Document outputs:

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
| `decline_reason`, `declined_by_name`, `declined_by_email` | Filled when a signer declines |
| `tags`, `page_count`, `template_id`, `created_at`, `updated_at` | Other document details |

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
| `HTTP 403 … approved permissions` | The OAuth connection lacks a permission. Add it to the OAuth application and reconnect. |
| `HTTP 401` on an OAuth connection that used to work | OAuth connections end 30 days after approval. Reconnect. |
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
- Requests do not follow redirects automatically. A redirect is followed only for reads and downloads, and the credentials are left out when it points outside the Assinafy address, for example to file storage.
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
