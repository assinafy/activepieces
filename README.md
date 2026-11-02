# Assinafy for Activepieces

`@assinafy/piece-assinafy` connects [Activepieces](https://www.activepieces.com) to [Assinafy](https://www.assinafy.com.br) for PDF upload, template generation, email/WhatsApp invitations, biometric identity verification, ICP-Brasil A1/A3 certificate signatures, contract lifecycle management, signed-file download and webhooks. The authoritative API reference is [api.assinafy.com.br/v1/docs](https://api.assinafy.com.br/v1/docs).

## Install and connect

Install from the Activepieces marketplace, or build this package with `npm install && npm run build` and install `dist/` as a custom piece.

| Connection | Configuration | Runtime authentication |
|---|---|---|
| API Key | Create a key under **My Account → API**, select production or sandbox, and set `account_id` only when the user has multiple workspaces. | `X-Api-Key`; production `https://api.assinafy.com.br/v1`, sandbox `https://sandbox.assinafy.com.br/v1` |
| Assinafy Account (OAuth) | Register a confidential app with the Activepieces redirect URI, then enter its client ID/secret. | OAuth 2.1 authorization code + PKCE S256, `resource=https://api.assinafy.com.br`, production only |

OAuth requests `documents:read documents:write templates:read templates:write account:read webhooks:write offline_access`. Access tokens last 3,600 seconds; refresh tokens rotate and expire after 30 unused days. The code expires after 60 seconds. Activepieces sends client credentials in the token body and refreshes the connection automatically.

## Complete flows

1. Enable the collection flow first: **New Event (Instant)** with `document_ready` → **Download Document** → storage/CRM update. Route `signer_rejected_document` to the owner. For biometrics also route `signer_identity_review_required` and `signer_identity_review_rejected`; approve/reject reviews in Assinafy.
2. Build the sending flow: source record → **Upload Document** → **Request Signatures** → store `document_id` and `assignment_id` on the source. Or replace the first two actions with **Create Document from Template** and store its `id`; template assignment creation is asynchronous, so use **Get Document** when the assignment is initially null.
3. Map `id` from **Document Signed**, or `document_id` from **New Event**, into **Download Document**. Download `certificated` for the certified PDF; also download `pades` to preserve ICP-Brasil signatures.
4. For contracts, run **Set Contract Terms** after creation, store an external reference, route `document_contract_*` events, use **Find Contracts** to reconcile missed events, and pass the last `updated_at` into writes. Use **Get Related Contracts** for the complete amendment/renewal/termination family.

## Verification, invitations and order

| Piece value | API verification | Notification | Requirements |
|---|---|---|---|
| `email` | `Email` | `Email` | Email; free verification |
| `whatsapp` | `Whatsapp` | `Whatsapp` | WhatsApp; paid-plan channel, 0.45 credit |
| `certificate_email` | `DigitalCertificate` | `Email` | ICP-Brasil A1/A3, saved CPF/CNPJ, feature enabled, 0.5 credit |
| `certificate_whatsapp` | `DigitalCertificate` | `Whatsapp` | Same plus WhatsApp; 0.95 credit total |
| `biometric_email` | `IdDocumentFaceMatchBasic` | `Email` | Saved CPF and ID Document + Face Match feature |
| `biometric_whatsapp` | `IdDocumentFaceMatchBasic` | `Whatsapp` | Same plus paid WhatsApp channel |

Notification arrays always contain exactly one compatible method. Certificate signers require `method: "virtual"` and must be alone in their signing step. Editor-only template fields are baked into the PDF and do not make the assignment `collect`; fields owned by signer roles do. If any signer has a `step`, all do, steps start at 1 without gaps, and equal steps sign in parallel. Existing signers are matched by email, or name plus WhatsApp; contact, duplicate, CPF/CNPJ and order checks happen before mutations.

## Actions and complete HTTP requests

Property keys below are the keys used for mapping. Paths are relative to the `/v1` base URL shown above. Empty optional values are omitted. IDs are URL-encoded; workspace IDs are resolved by the connection.

| Action | Inputs | Assinafy request |
|---|---|---|
| Upload Document | `file`, `name?` | `POST /accounts/{accountId}/documents`; multipart `file` containing PDF bytes and filename, max 25 MB |
| Request Signatures | `document`, `signers[]`, `message?`, `expires_at?`, `copy_receivers[]?` | `POST /documents/{documentId}/assignments`; `{"method":"virtual","signers":[{"id":"…","verification_method":"Email|Whatsapp|DigitalCertificate|IdDocumentFaceMatchBasic","notification_methods":["Email|Whatsapp"],"step":1}],"message":"…","expires_at":"ISO-8601","copy_receivers":["signer-id"]}` |
| Create Document from Template | `template`, dynamic `email/whatsapp/name/cpf/verification/step_{roleId}`, `field_{fieldId}`, `document_name?`, `message?`, `expires_at?`, `tags[]?` | `POST /accounts/{accountId}/templates/{templateId}/documents`; `{"signers":[{"role_id":"…","id":"…","verification_method":"…","notification_methods":["…"],"step":1}],"editor_fields":[{"field_id":"…","value":"…"}],"name":"…","message":"…","expires_at":"ISO-8601","tags":["…"]}` |
| Get Document | `document` | `GET /documents/{documentId}` |
| Find Documents | `search?`, `status?`, `limit?` | paginated `GET /accounts/{accountId}/documents?search=…&status=…&sort=-updated_at` |
| Download Document | `document`, `file_type`, `file_name?` | `GET /documents/{documentId}/download/{original|certificated|certificate-page|bundle|pades}`; binary response, HTTPS redirects only |
| Resend Signature Request | `document`, `signer` | `GET /documents/{documentId}`, then `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`; no body |
| Update Signing Deadline | `document`, `expires_at?` | `GET /documents/{documentId}`, then `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration`; `{"expires_at":"ISO-8601"}` or `{"expires_at":null}` to remove it |
| Delete Document | `document` | `DELETE /documents/{documentId}`; no body |
| Find Signers | `search`, `limit?` | paginated `GET /accounts/{accountId}/signers?search=…` |
| Create Signer | `full_name`, `email?`, `whatsapp?`, `government_id?` | `POST /accounts/{accountId}/signers`; `{"full_name":"…","email":"name@example.com","whatsapp_phone_number":"+5548999990000","government_id":"39053344705"}` |
| Update Signer | `signer`, `full_name?`, `email?`, `whatsapp?`, `government_id?` | `PUT /accounts/{accountId}/signers/{signerId}` with the nonempty fields above |
| Find Contracts | `search?`, `status[]?`, `counterparty?`, `end_date_from?`, `end_date_to?`, `ending_within_days?`, `external_system?`, `external_id?`, `sort?`, `expand_document?`, `limit?` | paginated `GET /accounts/{accountId}/contracts` with the supplied filters; `status` is comma-separated and `expand=document` is optional |
| Get Contract | `document` | `GET /accounts/{accountId}/documents/{documentId}/contract` |
| Get Related Contracts | `document` | `GET /accounts/{accountId}/documents/{documentId}/contract/related` |
| Set Contract Terms | `document`, `terms` | `PUT /accounts/{accountId}/documents/{documentId}/contract`; body is the validated `terms` object below |
| Renew Contract | `document`, `renewal` | `POST /accounts/{accountId}/documents/{documentId}/contract/renew`; `{"term":1,"end_date":"YYYY-MM-DD","value":0|null,"updated_at":"ISO-8601"}`; `term` or `end_date` is required |
| Terminate Contract | `document`, `reason?`, `updated_at?` | `POST /accounts/{accountId}/documents/{documentId}/contract/terminate`; `{"reason":"…"|null,"updated_at":"ISO-8601"}` |
| Custom API Call | framework method/URL/query/headers/body, `followRedirects=false` | Any Assinafy path. Credentials are rejected for off-origin URLs; certificate assignments are preflighted. Returns raw `{status,headers,body}`. |

Deadlines must be at least one hour ahead. `YYYY-MM-DD` means 23:59 UTC; unzoned datetimes mean UTC. Limits are integers 1–100. Uploads are PDF, max 2,000 pages. Update Signer leaves empty fields unchanged; use Custom API Call with an explicit `null` where the API permits clearing.

## Complete response contracts

Dedicated actions unwrap `{status:number,message:string,data:T}`; downloads return bytes; Custom API Call keeps the raw response. API errors retain HTTP status, message, structured `code`/`errors`, and transport cause. Writes with a transport failure warn that Assinafy may already have received the request.

```text
API Document = {resource,id,account_id,template_id,name,status,artifacts,is_closed,signing_url,verification_code,verification_url,decline_reason,declined_by,tags,assignment,pages,has_contract,created_at,updated_at}
API Assignment = {resource,id,document_id,created_at,sender_email,method,expires_at,message,signers,copy_receivers,items,summary,signing_urls}
API AssignmentSigner = Signer + {verification_method,notification_methods,step,notified,identity_verification_status,completed,notification_history}
API Signer = {resource,id,full_name,email,whatsapp_phone_number,government_id,has_accepted_terms}
```

The complete flattened document output used by Upload/Create/Get/Find, Document Signed, and `document_*` webhook fields is:

```text
{id,name,status,status_label,is_closed,has_contract,account_id,template_id,page_count,tags,available_files,signing_url,verification_code,verification_url,decline_reason,declined_by_name,declined_by_email,created_at,updated_at,assignment_id,signature_method,expires_at,signer_count,signed_count,signer_emails,signers:[{id,full_name,email,whatsapp_phone_number,step,verification_method,notification_method,identity_verification_status,signed,signing_url}]}
```

Other complete piece outputs:

```text
Request Signatures / Update Deadline = {document_id,message,sender_email,assignment_id,signature_method,expires_at,signer_count,signed_count,signer_emails,signers:[AssignmentSignerOutput]}
Find/Create/Update Signer = {id,full_name,email,whatsapp_phone_number,has_accepted_terms} (CPF/CNPJ intentionally omitted from piece output)
Download = {file,file_name,file_type,size_bytes,document_id,document_name,document_status}
Resend = {sent,document_id,assignment_id,signer_id}; Delete = {deleted,document_id}
```

Contract reads/writes return the API `data` unchanged, preserving nulls, nested objects and future fields:

```text
Contract = {resource,document_id,status,counterparty_name,counterparty_taxpayer_id,value,currency,start_date,end_date,auto_renew,renewal_term_months,notice_period_days,term,owner_id,metadata,external_references:[{system,id}],document?,amendments?:[Amendment],created_at,updated_at}
Amendment = {resource,document_id,document_name,parent_document_id,relation_type,number,status,document_status,apply_error,currency,terms,changes,applied_at,created_at,updated_at}
terms input = {status?,counterparty_name?,counterparty_taxpayer_id?,value?,currency?,start_date?,end_date?,auto_renew?,renewal_term_months?,notice_period_days?,owner_id?,metadata?,external_references?,parent_document_id?,relation_type?,updated_at?}; explicit null clears API-supported fields.
```

## Triggers and webhook payloads

**Document Signed** polls certificated documents, reads `/documents/{id}/activities`, emits each completion once, and returns the flattened document plus the Activepieces dedupe key. It uses a 10-minute lookback, resumes paginated backlogs, and does not treat authorization failures as completions.

**New Event (Instant)** registers `/accounts/{accountId}/webhooks/endpoints` (one slot, up to three on paid plans), or falls back to the legacy subscription endpoints when endpoint listing returns 404. It stores a random URL token and Standard Webhooks `whsec_…` secret, verifies `webhook-id`, `webhook-timestamp`, raw-body HMAC-SHA256 and a five-minute tolerance, dedupes by webhook ID/body ID, and deletes only its own endpoint on disable. **Replace Existing Webhook** reuses the oldest endpoint when slots are full.

Selectable events: `document_ready`, `document_contract_updated`, `document_contract_renewal_notice`, `document_contract_expiring`, `document_contract_expired`, `document_contract_renewed`, `document_contract_terminated`, `document_contract_amended`, `document_contract_amendment_updated`, `signer_signed_document`, `signer_rejected_document`, `user_rejected_document`, `signer_viewed_document`, `signature_requested`, `assignment_created`, `document_uploaded`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `signer_created`, `signer_email_verified`, `signer_whatsapp_verified`, `signer_data_confirmed`, `signer_identity_verified`, `signer_identity_verification_failed`, `signer_identity_review_required`, `signer_identity_review_approved`, `signer_identity_review_rejected`, `template_created`, `template_processed`, `template_processing_failed`.

Incoming body and complete flattened output:

```text
Webhook body = {id,event,message,payload,origin,created_at,subject,object,account_id}; body timestamps are Unix seconds.
Output = {event_id,event,message,occurred_at,account_id,actor_type,actor_id,actor_name,actor_email,object_type,object_id,object_name,detail_<every payload key>,document_<every flattened document key>}; nested detail values are JSON strings.
```

## OAuth protocol payloads

Discovery: issuer `https://auth.assinafy.com.br`; authorization endpoint `/oauth/authorize`; token endpoint `https://api.assinafy.com.br/v1/oauth/token`. Activepieces validates `state`, uses the registered HTTPS callback and sends:

```text
Authorize query = {response_type:"code",client_id,redirect_uri,scope,state,code_challenge,code_challenge_method:"S256",resource:"https://api.assinafy.com.br"}
Authorization-code token body = {grant_type:"authorization_code",code,redirect_uri,code_verifier,client_id,client_secret,resource:"https://api.assinafy.com.br"}
Refresh body = {grant_type:"refresh_token",refresh_token,client_id,client_secret,resource:"https://api.assinafy.com.br"}
Token response = {access_token,token_type:"Bearer",expires_in:3600,refresh_token,scope}; refresh tokens rotate, so replace the stored token atomically.
OAuth error = {error,error_description}; API authorization failures use the normal envelope and may include WWW-Authenticate insufficient_scope.
```

## Contract rules and statuses

Contract dates are real `YYYY-MM-DD` values from year 1000; end ≥ start. Value is 0–9,999,999,999,999.99 with ≤2 decimals; renewal months 1–600; notice/ending days 0–3650; metadata has ≤50 keys matching `[A-Za-z0-9_.-]{1,40}` and text ≤500 characters; external references have ≤20 `{system,id}` pairs. Status is `draft|active|expired|terminated`; relation is `amendment|renewal|termination`. A stale `updated_at` returns 409. Preserve the original renewal `term`/date when retrying so a response loss cannot renew twice.

Document statuses: `uploading`, `uploaded`, `metadata_processing`, `metadata_ready`, `pending_signature`, `pending_identity_review`, `certificating`, `certificated`, `rejected_by_signer`, `rejected_by_user`, `expired`, `failed`. Only `metadata_ready`, `pending_signature`, `pending_identity_review`, declined/cancelled, expired and failed documents are deletable.

## Development and release

```sh
npm install
npm run lint && npm run typecheck && npm run test:coverage
npm run licenses && npm run build
npm publish ./dist --dry-run
```

Unit tests block real network access. Opt-in suites: `ASSINAFY_LIVE=1 ASSINAFY_API_KEY=… npm run test:live`, `npm run test:production`, and read-only `npm run test:oauth`; see `test/live.test.ts` for optional send/webhook flags and cleanup behavior. Node.js 26 LTS is used for development/publishing; Node.js 24 remains supported and is the bundle target. Publishing uses an annotated `piece-assinafy-vX.Y.Z` tag after version/changelog/license checks.

## License

MIT; bundled third-party notices are in [LICENSE](LICENSE).
