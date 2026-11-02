# Assinafy para Activepieces

`@assinafy/piece-assinafy` conecta o [Activepieces](https://www.activepieces.com) à [Assinafy](https://www.assinafy.com.br) para upload de PDFs, geração por modelo, convites por e-mail/WhatsApp, verificação biométrica, assinaturas com certificado ICP-Brasil A1/A3, gestão do ciclo de contratos, download e webhooks. A referência oficial é [api.assinafy.com.br/v1/docs](https://api.assinafy.com.br/v1/docs).

## Instalação e conexão

Instale pelo marketplace do Activepieces ou execute `npm install && npm run build` e instale `dist/` como piece personalizada.

| Conexão | Configuração | Autenticação em execução |
|---|---|---|
| API Key | Crie a chave em **Minha Conta → API**, escolha produção ou sandbox e informe `account_id` apenas se o usuário tiver vários workspaces. | `X-Api-Key`; produção `https://api.assinafy.com.br/v1`, sandbox `https://sandbox.assinafy.com.br/v1` |
| Assinafy Account (OAuth) | Cadastre um app confidencial com a URI de redirecionamento do Activepieces e informe client ID/secret. | Authorization Code OAuth 2.1 + PKCE S256, `resource=https://api.assinafy.com.br`, somente produção |

O OAuth solicita `documents:read documents:write templates:read templates:write account:read webhooks:write offline_access`. Access tokens duram 3.600 segundos; refresh tokens giram e expiram após 30 dias sem uso. O código expira em 60 segundos. O Activepieces envia as credenciais do cliente no corpo do token e renova a conexão automaticamente.

## Fluxos completos

1. Ative primeiro o fluxo coletor: **New Event (Instant)** com `document_ready` → **Download Document** → atualização do storage/CRM. Encaminhe `signer_rejected_document` ao responsável. Para biometria, encaminhe também `signer_identity_review_required` e `signer_identity_review_rejected`; aprove/rejeite a análise na Assinafy.
2. Monte o envio: registro de origem → **Upload Document** → **Request Signatures** → grave `document_id` e `assignment_id` na origem. Ou substitua as duas ações por **Create Document from Template** e grave `id`; a assignment do modelo é assíncrona, portanto use **Get Document** quando ela vier inicialmente nula.
3. Mapeie `id` de **Document Signed**, ou `document_id` de **New Event**, em **Download Document**. Baixe `certificated` para o PDF certificado e também `pades` para preservar assinaturas ICP-Brasil.
4. Para contratos, execute **Set Contract Terms** após a criação, guarde uma referência externa, trate eventos `document_contract_*`, use **Find Contracts** para reconciliar eventos perdidos e envie o último `updated_at` nas escritas. **Get Related Contracts** retorna toda a família de aditivos, renovações e encerramentos.

## Verificação, convite e ordem

| Valor da piece | Verificação da API | Notificação | Requisitos |
|---|---|---|---|
| `email` | `Email` | `Email` | E-mail; verificação gratuita |
| `whatsapp` | `Whatsapp` | `Whatsapp` | WhatsApp; canal de plano pago, 0,45 crédito |
| `certificate_email` | `DigitalCertificate` | `Email` | ICP-Brasil A1/A3, CPF/CNPJ salvo, recurso ativo, 0,5 crédito |
| `certificate_whatsapp` | `DigitalCertificate` | `Whatsapp` | O mesmo mais WhatsApp; 0,95 crédito total |
| `biometric_email` | `IdDocumentFaceMatchBasic` | `Email` | CPF salvo e recurso ID Document + Face Match |
| `biometric_whatsapp` | `IdDocumentFaceMatchBasic` | `Whatsapp` | O mesmo mais o canal pago de WhatsApp |

O array de notificação contém exatamente um método compatível. Certificados exigem `method: "virtual"` e o signatário sozinho na etapa. Campos apenas de Editor são gravados no PDF e não tornam a assignment `collect`; campos de papéis signatários tornam. Se algum signatário usa `step`, todos usam, começando em 1 sem lacunas; etapas iguais assinam em paralelo. Signatários existentes são localizados por e-mail, ou nome mais WhatsApp; contatos, duplicidades, CPF/CNPJ e ordem são validados antes de alterações.

## Ações e requisições HTTP completas

As chaves abaixo são usadas no mapeamento. Os caminhos são relativos à URL-base `/v1` mostrada acima. Valores opcionais vazios são omitidos. IDs são codificados na URL; o workspace é resolvido pela conexão.

| Ação | Entradas | Requisição para a Assinafy |
|---|---|---|
| Upload Document | `file`, `name?` | `POST /accounts/{accountId}/documents`; multipart `file` com bytes e nome do PDF, máximo 25 MB |
| Request Signatures | `document`, `signers[]`, `message?`, `expires_at?`, `copy_receivers[]?` | `POST /documents/{documentId}/assignments`; `{"method":"virtual","signers":[{"id":"…","verification_method":"Email|Whatsapp|DigitalCertificate|IdDocumentFaceMatchBasic","notification_methods":["Email|Whatsapp"],"step":1}],"message":"…","expires_at":"ISO-8601","copy_receivers":["signer-id"]}` |
| Create Document from Template | `template`, `email/whatsapp/name/cpf/verification/step_{roleId}`, `field_{fieldId}`, `document_name?`, `message?`, `expires_at?`, `tags[]?` | `POST /accounts/{accountId}/templates/{templateId}/documents`; `{"signers":[{"role_id":"…","id":"…","verification_method":"…","notification_methods":["…"],"step":1}],"editor_fields":[{"field_id":"…","value":"…"}],"name":"…","message":"…","expires_at":"ISO-8601","tags":["…"]}` |
| Get Document | `document` | `GET /documents/{documentId}` |
| Find Documents | `search?`, `status?`, `limit?` | `GET /accounts/{accountId}/documents?search=…&status=…&sort=-updated_at`, paginado |
| Download Document | `document`, `file_type`, `file_name?` | `GET /documents/{documentId}/download/{original|certificated|certificate-page|bundle|pades}`; resposta binária, somente redirecionamentos HTTPS |
| Resend Signature Request | `document`, `signer` | `GET /documents/{documentId}` e `PUT /documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`; sem corpo |
| Update Signing Deadline | `document`, `expires_at?` | `GET /documents/{documentId}` e `PUT /documents/{documentId}/assignments/{assignmentId}/reset-expiration`; `{"expires_at":"ISO-8601"}` ou `{"expires_at":null}` para remover |
| Delete Document | `document` | `DELETE /documents/{documentId}`; sem corpo |
| Find Signers | `search`, `limit?` | `GET /accounts/{accountId}/signers?search=…`, paginado |
| Create Signer | `full_name`, `email?`, `whatsapp?`, `government_id?` | `POST /accounts/{accountId}/signers`; `{"full_name":"…","email":"nome@example.com","whatsapp_phone_number":"+5548999990000","government_id":"39053344705"}` |
| Update Signer | `signer`, `full_name?`, `email?`, `whatsapp?`, `government_id?` | `PUT /accounts/{accountId}/signers/{signerId}` com os campos não vazios acima |
| Find Contracts | `search?`, `status[]?`, `counterparty?`, `end_date_from?`, `end_date_to?`, `ending_within_days?`, `external_system?`, `external_id?`, `sort?`, `expand_document?`, `limit?` | `GET /accounts/{accountId}/contracts`, paginado, com filtros; `status` separado por vírgulas e `expand=document` opcional |
| Get Contract | `document` | `GET /accounts/{accountId}/documents/{documentId}/contract` |
| Get Related Contracts | `document` | `GET /accounts/{accountId}/documents/{documentId}/contract/related` |
| Set Contract Terms | `document`, `terms` | `PUT /accounts/{accountId}/documents/{documentId}/contract`; corpo é `terms` validado abaixo |
| Renew Contract | `document`, `renewal` | `POST /accounts/{accountId}/documents/{documentId}/contract/renew`; `{"term":1,"end_date":"YYYY-MM-DD","value":0|null,"updated_at":"ISO-8601"}`; `term` ou `end_date` obrigatório |
| Terminate Contract | `document`, `reason?`, `updated_at?` | `POST /accounts/{accountId}/documents/{documentId}/contract/terminate`; `{"reason":"…"|null,"updated_at":"ISO-8601"}` |
| Custom API Call | método/URL/query/headers/body do framework, `followRedirects=false` | Qualquer caminho da Assinafy. Credenciais são recusadas para outra origem; assignments com certificado são pré-validadas. Retorna `{status,headers,body}` bruto. |

Prazos devem estar ao menos uma hora no futuro. `YYYY-MM-DD` significa 23:59 UTC; data/hora sem fuso usa UTC. Limites são inteiros 1–100. PDFs têm no máximo 2.000 páginas. Update Signer mantém campos vazios; use Custom API Call com `null` explícito onde a API permitir limpar.

## Contratos completos de resposta

Ações dedicadas removem o envelope `{status:number,message:string,data:T}`; downloads retornam bytes; Custom API Call preserva a resposta bruta. Erros preservam status HTTP, mensagem, `code`/`errors` estruturados e causa de transporte. Falha de transporte numa escrita avisa que a Assinafy pode já ter recebido a requisição.

```text
API Document = {resource,id,account_id,template_id,name,status,artifacts,is_closed,signing_url,verification_code,verification_url,decline_reason,declined_by,tags,assignment,pages,has_contract,created_at,updated_at}
API Assignment = {resource,id,document_id,created_at,sender_email,method,expires_at,message,signers,copy_receivers,items,summary,signing_urls}
API AssignmentSigner = Signer + {verification_method,notification_methods,step,notified,identity_verification_status,completed,notification_history}
API Signer = {resource,id,full_name,email,whatsapp_phone_number,government_id,has_accepted_terms}
```

Saída completa e achatada de documento usada por Upload/Create/Get/Find, Document Signed e campos `document_*` do webhook:

```text
{id,name,status,status_label,is_closed,has_contract,account_id,template_id,page_count,tags,available_files,signing_url,verification_code,verification_url,decline_reason,declined_by_name,declined_by_email,created_at,updated_at,assignment_id,signature_method,expires_at,signer_count,signed_count,signer_emails,signers:[{id,full_name,email,whatsapp_phone_number,step,verification_method,notification_method,identity_verification_status,signed,signing_url}]}
```

Outras saídas completas da piece:

```text
Request Signatures / Update Deadline = {document_id,message,sender_email,assignment_id,signature_method,expires_at,signer_count,signed_count,signer_emails,signers:[AssignmentSignerOutput]}
Find/Create/Update Signer = {id,full_name,email,whatsapp_phone_number,has_accepted_terms} (CPF/CNPJ omitido intencionalmente da saída)
Download = {file,file_name,file_type,size_bytes,document_id,document_name,document_status}
Resend = {sent,document_id,assignment_id,signer_id}; Delete = {deleted,document_id}
```

Operações de contrato retornam `data` da API sem alteração, preservando nulos, objetos aninhados e novos campos:

```text
Contract = {resource,document_id,status,counterparty_name,counterparty_taxpayer_id,value,currency,start_date,end_date,auto_renew,renewal_term_months,notice_period_days,term,owner_id,metadata,external_references:[{system,id}],document?,amendments?:[Amendment],created_at,updated_at}
Amendment = {resource,document_id,document_name,parent_document_id,relation_type,number,status,document_status,apply_error,currency,terms,changes,applied_at,created_at,updated_at}
terms = {status?,counterparty_name?,counterparty_taxpayer_id?,value?,currency?,start_date?,end_date?,auto_renew?,renewal_term_months?,notice_period_days?,owner_id?,metadata?,external_references?,parent_document_id?,relation_type?,updated_at?}; null explícito limpa campos aceitos pela API.
```

## Gatilhos e payloads de webhook

**Document Signed** consulta documentos certificados, lê `/documents/{id}/activities`, emite cada conclusão uma vez e retorna o documento achatado mais a chave de deduplicação. Usa lookback de dez minutos, retoma backlogs paginados e não trata falhas de autorização como conclusão.

**New Event (Instant)** registra `/accounts/{accountId}/webhooks/endpoints` (uma vaga, até três em planos pagos) ou usa subscriptions legadas quando a listagem retorna 404. Guarda token aleatório na URL e segredo Standard Webhooks `whsec_…`, valida `webhook-id`, `webhook-timestamp`, HMAC-SHA256 do corpo bruto e tolerância de cinco minutos, deduplica por webhook/body ID e remove apenas seu endpoint. **Replace Existing Webhook** reutiliza o endpoint mais antigo quando não há vaga.

Eventos: `document_ready`, `document_contract_updated`, `document_contract_renewal_notice`, `document_contract_expiring`, `document_contract_expired`, `document_contract_renewed`, `document_contract_terminated`, `document_contract_amended`, `document_contract_amendment_updated`, `signer_signed_document`, `signer_rejected_document`, `user_rejected_document`, `signer_viewed_document`, `signature_requested`, `assignment_created`, `document_uploaded`, `document_metadata_ready`, `document_prepared`, `document_processing_failed`, `signer_created`, `signer_email_verified`, `signer_whatsapp_verified`, `signer_data_confirmed`, `signer_identity_verified`, `signer_identity_verification_failed`, `signer_identity_review_required`, `signer_identity_review_approved`, `signer_identity_review_rejected`, `template_created`, `template_processed`, `template_processing_failed`.

```text
Corpo = {id,event,message,payload,origin,created_at,subject,object,account_id}; datas do corpo são segundos Unix.
Saída = {event_id,event,message,occurred_at,account_id,actor_type,actor_id,actor_name,actor_email,object_type,object_id,object_name,detail_<cada chave do payload>,document_<cada campo achatado>}; detalhes aninhados viram strings JSON.
```

## Payloads do protocolo OAuth

Discovery: issuer `https://auth.assinafy.com.br`; endpoint de autorização `/oauth/authorize`; endpoint de token `https://api.assinafy.com.br/v1/oauth/token`. O Activepieces valida `state`, usa o callback HTTPS cadastrado e envia:

```text
Query de autorização = {response_type:"code",client_id,redirect_uri,scope,state,code_challenge,code_challenge_method:"S256",resource:"https://api.assinafy.com.br"}
Corpo do token por código = {grant_type:"authorization_code",code,redirect_uri,code_verifier,client_id,client_secret,resource:"https://api.assinafy.com.br"}
Corpo do refresh = {grant_type:"refresh_token",refresh_token,client_id,client_secret,resource:"https://api.assinafy.com.br"}
Resposta de token = {access_token,token_type:"Bearer",expires_in:3600,refresh_token,scope}; refresh tokens giram, portanto substitua o token armazenado de forma atômica.
Erro OAuth = {error,error_description}; falhas de autorização da API usam o envelope normal e podem incluir WWW-Authenticate insufficient_scope.
```

## Regras de contratos e status

Datas contratuais são `YYYY-MM-DD` reais desde o ano 1000; fim ≥ início. Valor 0–9.999.999.999.999,99 com ≤2 decimais; meses 1–600; aviso/período 0–3650 dias; metadata tem ≤50 chaves `[A-Za-z0-9_.-]{1,40}` e texto ≤500; referências externas têm ≤20 pares `{system,id}`. Status: `draft|active|expired|terminated`; relação: `amendment|renewal|termination`. `updated_at` desatualizado retorna 409. Preserve `term`/data originais numa repetição para não renovar duas vezes após perda de resposta.

Status de documento: `uploading`, `uploaded`, `metadata_processing`, `metadata_ready`, `pending_signature`, `pending_identity_review`, `certificating`, `certificated`, `rejected_by_signer`, `rejected_by_user`, `expired`, `failed`. Apenas `metadata_ready`, `pending_signature`, `pending_identity_review`, recusados/cancelados, expirados e falhos podem ser excluídos.

## Desenvolvimento e publicação

```sh
npm install
npm run lint && npm run typecheck && npm run test:coverage
npm run licenses && npm run build
npm publish ./dist --dry-run
```

Testes unitários bloqueiam rede real. Suítes opt-in: `ASSINAFY_LIVE=1 ASSINAFY_API_KEY=… npm run test:live`, `npm run test:production` e `npm run test:oauth` somente leitura; veja `test/live.test.ts` para flags e limpeza. Node.js 26 LTS é usado no desenvolvimento/publicação; Node.js 24 continua suportado e é o alvo do bundle. A publicação usa tag anotada `piece-assinafy-vX.Y.Z` após validações de versão, changelog e licenças.

## Licença

MIT; avisos de terceiros empacotados estão em [LICENSE](LICENSE).
