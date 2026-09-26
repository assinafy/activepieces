# Assinafy para Activepieces

[English](README.md)

Envie documentos para assinatura eletrônica com validade jurídica pela [Assinafy](https://www.assinafy.com.br) e use o resultado em fluxos do [Activepieces](https://www.activepieces.com): envie um PDF, convide os signatários por e-mail ou WhatsApp, aguarde as assinaturas e guarde o PDF assinado onde precisar.

- Pacote: `@assinafy/piece-assinafy`
- Requer Activepieces 0.88.2 ou superior
- A Assinafy aceita apenas HTTPS com TLS 1.2 ou superior, que o runtime Node.js do Activepieces usa por padrão
- Referência da API: <https://api.assinafy.com.br/v1/docs>

## Instalação

Como administrador da plataforma na sua instância do Activepieces:

1. Abra **Platform Admin → Setup → Pieces** e clique em **Install Piece**.
2. Escolha **NPM Registry**, informe o nome do pacote `@assinafy/piece-assinafy` e a versão, por exemplo `0.1.0`.
3. A peça aparece como **Assinafy** no editor de fluxos.

Para atualizar, instale a nova versão da mesma forma.

## Conectar sua conta Assinafy

A peça oferece dois tipos de conexão. Use **API Key** para automatizar o seu próprio espaço de trabalho e **Assinafy Account (OAuth)** quando outras pessoas conectarem os espaços de trabalho delas.

### API Key

1. Entre na [Assinafy](https://app.assinafy.com.br) (ou no [sandbox](https://app-sandbox.assinafy.com.br) para testes).
2. Abra **Minha Conta → API** e crie uma chave de API. Um usuário da Assinafy dedicado às automações facilita o controle do acesso.
3. No Activepieces, crie uma conexão Assinafy do tipo **API Key**:
   - **API Key**: a chave criada.
   - **Environment**: **Production**, ou **Sandbox** para chaves criadas no sandbox.
   - **Workspace ID**: necessário apenas quando o seu usuário pertence a mais de um espaço de trabalho. Copie de **Minha Conta → Espaços de trabalho**.

A conexão é verificada em `GET /v1/accounts` ao salvar e recebe o nome do espaço de trabalho.

### Assinafy Account (OAuth)

Um proprietário do espaço de trabalho na Assinafy registra uma aplicação OAuth uma única vez, em **Configurações → Aplicações OAuth**:

| Campo | Valor |
|---|---|
| URI de redirecionamento | A URL de redirecionamento exibida pelo Activepieces na janela de conexão, por exemplo `https://automations.example.com/redirect` |
| Tipo | Confidencial |
| Permissões | `documents:read`, `documents:write`, `templates:read`, `templates:write`, `account:read`, `webhooks:write`, `offline_access` |

Informe o Client ID e o Client Secret da aplicação no Activepieces, depois entre na Assinafy e escolha o espaço de trabalho a conectar. Salve a conexão em até um minuto após aprovar: o código de aprovação expira em 60 segundos. Cada conexão OAuth funciona com exatamente um espaço de trabalho. O OAuth sempre usa o ambiente de produção; para o sandbox, use uma chave de API.

O Activepieces renova o acesso automaticamente quando os fluxos usam a conexão, e cada renovação mantém a conexão válida por mais 30 dias. A conexão só expira depois de 30 dias sem uso, por exemplo quando seus fluxos estão desativados ou rodam menos de uma vez a cada 30 dias; nesse caso, conecte novamente. Excluir a conexão no Activepieces não revoga o acesso na Assinafy; revogue-o em **Aplicações conectadas** no seu perfil da Assinafy.

## O fluxo do documento

Todo fluxo da Assinafy move um documento pelas mesmas etapas. A peça tem uma ação por etapa:

```
Upload ──► Send ──► Track ──► Sign ──► Collect
Document   Request  Get/Find  (in      Download
Document   Signatures  Documents  Assinafy)  Document
   │           │            ▲            │         │
   └─ Create from Template ┘            └── Store ──┘
```

1. **Upload**: [Upload Document](#upload-document) envia um PDF para `POST /v1/accounts/{accountId}/documents`, ou [Create Document from Template](#create-document-from-template) gera o documento a partir de um modelo pronto e o envia em uma única etapa.
2. **Send**: [Request Signatures](#request-signatures) cria a solicitação de assinatura com `POST /v1/documents/{documentId}/assignments`. A Assinafy então envia e-mail ou mensagem para cada signatário.
3. **Track**: [Get Document](#get-document) e [Find Documents](#find-documents) leem o status e o progresso das assinaturas; [Update Signing Deadline](#update-signing-deadline) e [Resend Signature Request](#resend-signature-request) cobram uma solicitação em andamento.
4. **Sign**: os signatários abrem o link de assinatura e assinam na Assinafy, com um código de uso único por e-mail ou WhatsApp ou um certificado ICP-Brasil A1/A3.
5. **Collect**: [Download Document](#download-document) salva o PDF assinado com o certificado de assinatura para que etapas posteriores possam armazená-lo.

Os gatilhos disparam nos momentos que importam: **Document Signed** quando o PDF assinado está pronto, ou **New Event (Instant)** para cada evento de assinatura conforme acontece.

### Receita de fluxo: enviar um PDF para assinatura

1. Qualquer gatilho que forneça um arquivo (um formulário, um anexo de e-mail, um registro de CRM).
2. **Upload Document** com esse arquivo.
3. **Request Signatures** no documento enviado, com o nome e o e-mail ou o número de WhatsApp de cada signatário.
4. Gatilho **Document Signed** (em outro fluxo) ou um laço de espera com **Get Document** até que `status` seja `certificated`.
5. **Download Document** com **File** definido como *Signed PDF*, depois envie o arquivo para o seu armazenamento (Google Drive, SharePoint, S3…).

### Receita de fluxo: gerar um contrato a partir de um modelo

1. Qualquer gatilho com os dados do cliente.
2. **Create Document from Template**: escolha o modelo, preencha o signatário de cada papel e os campos do modelo. O documento é criado e enviado em uma única etapa.

### Receita de fluxo: reagir no instante em que algo acontece

1. **New Event (Instant)** com os eventos que interessam, por exemplo *Document signed by all signers* e *Signer declined the document*.
2. Uma etapa Router que ramifica com base no `event`: armazene o PDF assinado em `document_ready`, avise o responsável em `signer_rejected_document`.

## Ações

Cada ação abaixo lista o endpoint da API da Assinafy que ela chama e um exemplo dos dados que retorna. Todas as saídas usam campos planos, exceto `signers`, que traz um registro por signatário para que os fluxos possam percorrê-los. Veja [Campos de saída](#campos-de-saída) para a lista completa de campos.

### Upload Document

Envia um PDF (até 25 MB) para que você possa solicitar assinaturas sobre ele. Cada chamada cria um documento novo, então novas tentativas criam duplicatas.

- Endpoint: `POST /v1/accounts/{accountId}/documents` (envio multipart do arquivo)
- Entradas: **File** (obrigatório), **Document Name** (opcional, por padrão o nome do arquivo)

Retorna o documento, por exemplo:

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

Envia um documento para uma ou mais pessoas assinarem. Signatários existentes são identificados por e-mail (ou por nome e número de WhatsApp); signatários ausentes são criados, o que exige o nome completo. A Assinafy notifica os signatários imediatamente, ou pela ordem de assinatura quando há etapas definidas. Cada chamada cria uma nova solicitação de assinatura, então não tente de novo sem verificar.

- Endpoint: `POST /v1/documents/{documentId}/assignments`
- Entradas: **Document** (obrigatório), **Signers** (obrigatório), **Message**, **Deadline**, **Send Copy To**

Exemplo do corpo da requisição enviado à Assinafy:

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

Retorna a solicitação de assinatura:

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

Um envio recente pode ainda estar recebendo o arquivo; a etapa aguarda até 30 segundos pelo processamento antes de enviar. Destinatários de cópia podem não estar disponíveis em todos os planos: quando a Assinafy não mantém um destinatário de cópia pedido, a etapa falha depois do envio e informa o ID da solicitação de assinatura, para que você não convide os signatários duas vezes.

### Create Document from Template

Cria um documento a partir de um modelo pronto e o envia para assinatura em uma única etapa. Cada papel de signatário do modelo tem suas próprias entradas de e-mail, número de WhatsApp, nome completo, CPF/CNPJ, verificação e ordem de assinatura; papéis de editor não são signatários, e seus campos aparecem em **Template Fields** para preencher o documento antecipadamente. Cada chamada cria e envia um documento novo, então não tente de novo sem verificar.

- Endpoint: `POST /v1/accounts/{accountId}/templates/{templateId}/documents`
- Entradas: **Template** (obrigatório), **Signers** (uma entrada por papel do modelo, obrigatório), **Template Fields**, **Document Name**, **Message**, **Deadline**, **Tags**

Retorna o documento (mesmo formato de **Upload Document**) com `template_id` definido.

### Get Document

Lê um documento com o status, os signatários e o progresso das assinaturas.

- Endpoint: `GET /v1/documents/{documentId}`
- Entradas: **Document** (obrigatório)

Retorna o formato de documento mostrado em [Request Signatures](#request-signatures).

### Find Documents

Busca documentos por nome, signatário ou status, dos atualizados mais recentemente para os mais antigos. Retorna uma lista vazia quando nada corresponde.

- Endpoint: `GET /v1/accounts/{accountId}/documents` com `search`, `status` e `sort=-updated_at`
- Entradas: **Search**, **Status**, **Maximum Results** (1–100, padrão 25)

Retorna uma lista de documentos.

### Download Document

Baixa um arquivo de um documento como arquivo para etapas posteriores. O PDF assinado só existe depois que todos os signatários assinam; enquanto a certificação ainda está em andamento, a etapa aguarda até um minuto.

- Endpoint: `GET /v1/documents/{documentId}/download/{artifactName}`
- Entradas: **Document** (obrigatório), **File** (obrigatório: PDF assinado, original, página do certificado, pacote ZIP ou PAdES), **File Name**

Retorna:

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

Envia o convite de assinatura novamente para um signatário, pelo canal original dele. Reenvios por WhatsApp consomem créditos. Cada chamada envia outra notificação.

- Endpoint: `PUT /v1/documents/{documentId}/assignments/{assignmentId}/signers/{signerId}/resend`
- Entradas: **Document** (obrigatório), **Signer** (obrigatório, os signatários do documento escolhido)

Retorna `{ "sent": true, "document_id": "…", "assignment_id": "…", "signer_id": "…" }`.

### Update Signing Deadline

Define um novo prazo na solicitação de assinatura de um documento. O novo prazo deve ser de pelo menos uma hora no futuro. Definir o mesmo prazo de novo é seguro.

- Endpoint: `PUT /v1/documents/{documentId}/assignments/{assignmentId}/reset-expiration`
- Entradas: **Document** (obrigatório), **New Deadline** (obrigatório)

Retorna o formato de solicitação de assinatura mostrado em [Request Signatures](#request-signatures).

### Delete Document

Exclui permanentemente um documento. Só podem ser excluídos documentos prontos para enviar, aguardando assinaturas, recusados, cancelados, expirados ou com falha; documentos assinados são mantidos. Isso não pode ser desfeito, e uma nova tentativa falha porque o documento já não existe.

- Endpoint: `DELETE /v1/documents/{documentId}`
- Entradas: **Document** (obrigatório)

Retorna `{ "deleted": true, "document_id": "…" }`.

### Find Signers

Busca os signatários cadastrados no espaço de trabalho por nome parcial ou e-mail. Retorna uma lista vazia quando nada corresponde.

- Endpoint: `GET /v1/accounts/{accountId}/signers` com `search`
- Entradas: **Search** (obrigatório), **Maximum Results** (1–100, padrão 25)

Retorna uma lista de signatários:

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

Salva um novo signatário no espaço de trabalho. **Request Signatures** cria os signatários ausentes por conta própria, então use esta ação apenas para cadastrar pessoas com antecedência. Ela falha quando já existe um signatário com o mesmo e-mail.

- Endpoint: `POST /v1/accounts/{accountId}/signers` e depois `PUT /v1/accounts/{accountId}/signers/{signerId}` quando um CPF/CNPJ é informado (o endpoint de criação não o aceita)
- Entradas: **Full Name** (obrigatório), **Email**, **WhatsApp Number**, **CPF or CNPJ**

Retorna o formato de signatário mostrado em [Find Signers](#find-signers).

### Update Signer

Altera o nome, os dados de contato ou o CPF/CNPJ de um signatário cadastrado; apenas os campos preenchidos mudam. E-mail e WhatsApp não podem mudar enquanto o signatário verificou aquele canal em um documento ainda em assinatura, e alterar um canal não verificado invalida convites já enviados.

- Endpoint: `PUT /v1/accounts/{accountId}/signers/{signerId}`
- Entradas: **Signer** (obrigatório), **Full Name**, **Email**, **WhatsApp Number**, **CPF or CNPJ**

Retorna o formato de signatário mostrado em [Find Signers](#find-signers).

### Custom API Call

Chama qualquer endpoint da API da Assinafy com as credenciais da conexão, para endpoints que a peça não cobre. As credenciais são enviadas apenas ao endereço da Assinafy da conexão, então **Follow redirects** deve ficar desativado. Caminhos com escopo de espaço de trabalho, como `/accounts/{accountId}/signers`, precisam do ID do seu espaço de trabalho, que a peça resolve por conta própria em suas próprias ações.

Toda entrada de documento, signatário e modelo nas ações acima é uma lista suspensa, com busca exceto o signatário em **Resend Signature Request**, que lista os signatários do documento escolhido. Você também pode mapear um ID de uma etapa anterior.

## Gatilhos

| Gatilho | Quando dispara | Entrega |
|---|---|---|
| Document Signed | Todos os signatários assinaram e o PDF assinado está pronto, para assinaturas concluídas depois que o fluxo foi ativado | Verificado a cada poucos minutos. Qualquer número de fluxos pode usá-lo. |
| New Event (Instant) | Os eventos da Assinafy escolhidos acontecem: documento assinado por todos, signatário assinou, signatário recusou, documento cancelado e outros | Instantânea, pelo webhook do espaço de trabalho |

**New Event (Instant)** usa o webhook do espaço de trabalho (`GET/PUT /v1/accounts/{accountId}/webhooks/subscriptions`), e a Assinafy entrega os eventos de cada espaço de trabalho para um único endereço:

- Use-o em apenas um fluxo ativo por espaço de trabalho; adicione uma etapa Router para tratar vários tipos de evento.
- Se o espaço de trabalho já entrega eventos para outro sistema, o fluxo não é iniciado a menos que **Replace Existing Webhook** esteja ativado.
- Desativar o fluxo interrompe o webhook, mas apenas enquanto ele ainda aponta para esse fluxo.
- **Delivery Notice Email** recebe os avisos da Assinafy sobre falhas de entrega. É obrigatório apenas quando o espaço de trabalho ainda não tem um endereço.
- Em eventos de documento, o fluxo recebe o estado atual do documento, lido da API quando o evento chega. Se ele não puder ser lido (por exemplo, depois que o documento foi excluído), é usada a cópia enviada com o evento.
- A Assinafy tenta novamente uma entrega falha uma única vez. O Activepieces descarta um evento repetido que chega em até 30 segundos; para repetições posteriores, `event_id` identifica o evento.
- Cada fluxo registra seu endereço de webhook com um segredo aleatório, e requisições sem ele são ignoradas. O segredo continua o mesmo quando o fluxo é republicado ou desativado e ativado de novo, então entregas já a caminho ainda valem. A Assinafy não assina suas requisições de webhook, então mantenha o endereço em sigilo.

O documento fica assinado assim que o último signatário assina, mas o PDF assinado só fica disponível depois que a certificação termina. **Document Signed** dispara depois da certificação; **Download Document** também aguarda até um minuto enquanto a certificação ainda está em andamento.

**Document Signed** dispara uma única vez por documento cuja assinatura foi concluída depois que o fluxo foi ativado. Ele lê o histórico de atividades de cada novo documento assinado (`GET /v1/documents/{documentId}/activities`) para obter o momento da conclusão, então documentos assinados antes e alterados depois (por exemplo, com uma etiqueta) não o disparam. Cada verificação olha dez minutos para trás para tolerar diferenças de relógio. Depois de uma indisponibilidade, ele processa o acúmulo ao longo de várias verificações, sem pular nem repetir nenhum.

## Signatários

**Request Signatures** e **Create Document from Template** recebem dados de contato, não IDs de signatários da Assinafy:

- O signatário é identificado pelo e-mail, ou pelo nome e número de WhatsApp quando não há e-mail, então informe o nome completo de um signatário que tem apenas número de WhatsApp. Números de WhatsApp correspondem independentemente da formatação, e um número sem o código do país corresponde ao número internacional cadastrado.
- Se ninguém corresponder, um signatário é criado, o que exige o nome completo.
- Um número de WhatsApp ausente é adicionado a um signatário existente. Um número de WhatsApp diferente do cadastrado interrompe a etapa com um erro, em vez de usar o valor cadastrado.
- O CPF/CNPJ só é salvo quando o signatário é criado. A Assinafy não mostra CPFs cadastrados, então a etapa nunca altera o CPF de um signatário existente; para isso, use **Update Signer**.
- Altere dados cadastrados com **Update Signer**; alterar um canal invalida convites já enviados.
- Toda linha de signatário e destinatário de cópia é verificada, e todos eles são consultados, antes de criar ou alterar qualquer signatário: um contato para o canal escolhido, um CPF ou CNPJ válido (incluindo os dígitos verificadores), nenhum e-mail ou número de WhatsApp repetido, nenhuma pessoa alcançada duas vezes por dados diferentes e as regras de ordem de assinatura abaixo.

## Verificação e custos

Os signatários comprovam a identidade durante a assinatura com um de quatro métodos; os certificados A1 e A3 do ICP-Brasil usam ambos o método de certificado digital:

| Verificação | Convite | Custo por signatário |
|---|---|---|
| Código por e-mail (padrão) | E-mail | Gratuito |
| Código por WhatsApp | WhatsApp | 0,45 crédito (planos pagos) |
| Certificado digital ICP-Brasil (A1 ou A3) | E-mail | 2 créditos |
| Certificado digital ICP-Brasil (A1 ou A3) | WhatsApp | 2,45 créditos |

Quando **Verification** fica em branco, é usado o e-mail, ou o WhatsApp quando o signatário tem apenas número de WhatsApp. A assinatura com certificado digital exige o recurso Certificado Digital no plano da Assinafy, o CPF ou CNPJ do signatário cadastrado na Assinafy (informado na etapa quando o signatário é novo, ou definido com **Update Signer**) e o signatário sozinho na sua etapa da ordem de assinatura. Toda solicitação de assinatura também usa um documento do plano, ou um crédito quando a franquia acaba.

## Ordem de assinatura

Deixe **Signing Order** em branco para que todos assinem ao mesmo tempo. Para assinar em sequência, preencha em todos os signatários: todos com `1` são convidados primeiro, `2` depois que todos eles assinarem, e assim por diante. Os números devem começar em 1 sem pular valores, e um signatário com certificado digital não pode compartilhar o número com ninguém.

## Campos de saída

Saídas de documento e de solicitação de assinatura:

| Campo | Descrição |
|---|---|
| `id`, `name` | ID e nome do documento |
| `account_id`, `signing_url` | O espaço de trabalho e o link para a página de assinatura |
| `status`, `status_label` | Código do status (por exemplo `pending_signature`, `certificated`) e seu rótulo legível |
| `is_closed` | Se o processo de assinatura terminou |
| `available_files` | Arquivos que podem ser baixados, por exemplo `original, certificated, certificate-page, bundle` |
| `signer_count`, `signed_count`, `signer_emails` | Progresso das assinaturas |
| `signers` | Um item por signatário: nome, e-mail, WhatsApp, etapa, verificação, se assinou, link de assinatura |
| `assignment_id`, `signature_method`, `expires_at` | A solicitação de assinatura e seu prazo |
| `message`, `sender_email`, `document_id` | Somente na solicitação de assinatura: texto do convite, remetente, documento |
| `decline_reason`, `declined_by_name`, `declined_by_email` | Preenchidos quando um signatário recusa |
| `tags`, `page_count`, `template_id`, `created_at`, `updated_at` | Outros dados do documento |

Saídas de signatário: `id`, `full_name`, `email`, `whatsapp_phone_number`, `has_accepted_terms`.

Saídas de **New Event (Instant)**:

| Campo | Descrição |
|---|---|
| `event_id`, `event`, `message`, `occurred_at` | O evento, por exemplo `document_ready`, e quando aconteceu |
| `account_id` | O espaço de trabalho |
| `actor_type`, `actor_id`, `actor_name`, `actor_email` | Quem o causou: um usuário, um signatário ou o espaço de trabalho |
| `object_type`, `object_id`, `object_name` | Com o que aconteceu: um documento, signatário ou modelo |
| `detail_*` | Detalhes do evento, por exemplo `detail_signer_email` ou `detail_error_message` |
| `document_*` | Todos os campos de documento acima, com o prefixo `document_`; vazios em eventos de signatários ou modelos |

## Solução de problemas

| Mensagem | O que fazer |
|---|---|
| `HTTP 401 … check the API key` | A chave está errada, foi excluída ou pertence ao outro ambiente. Crie uma nova chave ou altere **Environment**. |
| `This API key can access N workspaces` | Preencha **Workspace ID** na conexão. |
| `… is not available for this document yet` | O arquivo ainda não existe, por exemplo o PDF assinado antes de todos assinarem. |
| `This Assinafy workspace already sends its webhooks to …` | Outro sistema recebe os eventos do espaço de trabalho. Ative **Replace Existing Webhook** apenas se esse sistema não precisar mais deles, ou use **Document Signed**. |
| `HTTP 403 … approved permissions` | O item pertence a outro espaço de trabalho ou exige outro papel na Assinafy. Em uma conexão OAuth, uma permissão ausente também causa isso: adicione a permissão à aplicação OAuth e conecte novamente. Cobrança, membros e credenciais nunca estão disponíveis para conexões OAuth. |
| `HTTP 401` em uma conexão OAuth que funcionava | O acesso foi revogado em **Connected apps** na Assinafy, a aplicação OAuth foi excluída ou desativada, o aplicativo foi aprovado de novo com permissões diferentes, ou a conexão ficou 30 dias sem uso. Conecte novamente. |
| `… is saved in Assinafy with a different WhatsApp number` | Atualize o signatário com **Update Signer** ou deixe **WhatsApp Number** em branco para usar o número cadastrado. |
| `… must be the only signer in their signing order step` | Dê ao signatário com certificado digital um número de ordem de assinatura só dele. |
| `Assinafy is still receiving the file of this document` | O envio ainda estava em andamento depois de 30 segundos. Execute a etapa de novo ou adicione uma etapa de espera (Delay) depois de **Upload Document**. |

## Desenvolvimento

Requisitos: Node.js 24 LTS e Git.

```sh
npm install              # também baixa as bibliotecas do Activepieces
npm run typecheck        # código e testes
npm test                 # testes unitários, sem rede
npm run test:coverage    # com limites de cobertura
npm run build            # gera o pacote da peça em dist/
```

A peça é compilada com o framework de peças do Activepieces no commit indicado em `ACTIVEPIECES_REF`. O `npm install` baixa as bibliotecas framework, common e core desse commit para `.activepieces/`, e o build as embute em um único arquivo. Para compilar com um Activepieces mais recente, altere o `ACTIVEPIECES_REF`, execute `npm install` e rode os testes.

Os testes unitários simulam o cliente HTTP e bloqueiam qualquer acesso real à rede. Um teste de envio usa o cliente HTTP real do Activepieces com um `fetch` simulado para verificar a requisição multipart transmitida.

### Notas de implementação

- As requisições feitas pelos gatilhos expiram depois de 15 segundos, bem dentro do tempo que o Activepieces dá para a execução de um gatilho; as ações permitem 120 segundos.
- Quando duas execuções criam o mesmo novo signatário ao mesmo tempo, a execução que perde reutiliza o signatário criado pela outra.
- As requisições não seguem redirecionamentos automaticamente. Um redirecionamento só é seguido em leituras e downloads e apenas para um endereço `https://`, e as credenciais ficam de fora quando ele aponta para fora do endereço da Assinafy, por exemplo para o armazenamento de arquivos.
- O envio de arquivos usa o pacote `form-data`. O cliente HTTP do Activepieces define o tipo de conteúdo multipart e o boundary apenas para corpos `form-data`; um corpo `FormData` global seria enviado como JSON.
- O endpoint de criação de signatário da Assinafy não aceita CPF/CNPJ, então ele é definido com uma atualização em seguida.
- A Assinafy retorna no máximo 50 itens por página de lista e repete a última página quando é pedida uma página além do fim. As leituras de listas seguem o cabeçalho `X-Pagination-Page-Count` e param em uma página incompleta ou repetida.
- A referência da API não documenta um endpoint de modelo único, então o formulário e a ação de modelo percorrem até 500 modelos.
- **Document Signed** mantém seu próprio estado e o preserva quando o fluxo é republicado: o momento em que foi ativado, a última verificação concluída, a posição de uma varredura de acúmulo em andamento e um registro dos documentos disparados recentemente.
  - Documentos assinados são listados do mais recente para o mais antigo, não podem ser excluídos e só descem na lista quando outros são assinados ou alterados. Por isso a varredura retoma logo após o último documento examinado (pela data de atualização e pelo ID), e o ponto de controle de tempo só avança quando a varredura alcança documentos anteriores à verificação anterior.
  - Um documento dispara quando o momento da conclusão (a atividade `document_ready` mais recente, senão a `signer_signed_document` mais recente) é posterior à ativação do gatilho e no máximo 24 horas anterior ao início da janela da verificação. Um documento sem nenhuma dessas atividades não dispara. O registro guarda os documentos disparados nesse período para que alterações posteriores não os disparem de novo, descarta entradas que não podem mais passar na regra e tem no máximo 5.000 entradas para respeitar o limite de armazenamento do Activepieces.
  - Cada verificação lê no máximo 10 páginas de 50 documentos e 40 históricos de atividades, e para depois de 30 segundos; a verificação seguinte continua de onde parou. Um erro depois de examinar alguns documentos mantém esse progresso; um erro antes de qualquer um faz a verificação falhar.
  - Um documento cujo histórico de atividades não pode ser lido é tentado de novo nas duas verificações seguintes. Depois disso ele dispara com a data de atualização como momento da conclusão, para que um documento com problema não pare o gatilho.
  - O Activepieces salva o progresso de um gatilho de verificação antes de iniciar as execuções dos itens retornados. Se iniciá-las falhar, esses documentos não são retornados de novo. Isso vale para todo gatilho de verificação do Activepieces; a peça não recebe nenhum sinal para repeti-los.

### Testes no sandbox

`test/live.test.ts` roda apenas no sandbox da Assinafy e exclui tudo o que cria:

```sh
ASSINAFY_API_KEY=<chave do sandbox> npm run test:live
```

| Variável | Efeito |
|---|---|
| `ASSINAFY_ACCOUNT_ID` | Espaço de trabalho a usar quando a chave tem vários |
| `ASSINAFY_LIVE_SEND=1` | Também envia uma solicitação de assinatura para um endereço `example.com` (usa um documento do plano) |
| `ASSINAFY_LIVE_WEBHOOK=1` | Também ativa e desativa o webhook do espaço de trabalho; falha em vez de substituir outro destino |
| `ASSINAFY_LIVE_WEBHOOK_EMAIL` | Endereço de avisos de entrega para o teste do webhook (padrão: um endereço `example.com`) |

O conjunto também lê o histórico de atividades de um documento, do qual **Document Signed** depende.

### Testar no Activepieces

Execute `npm run build` e depois `npm pack ./dist` para gerar um arquivo `.tgz`. No Activepieces, abra **Setup → Pieces** na administração da plataforma, clique em **Install Piece**, escolha **Packed Archive (.tgz)** e envie o arquivo.

### Traduções

`src/i18n/translation.json` é gerado a partir da peça e `src/i18n/pt.json` contém os textos em português do Brasil. Depois de alterar qualquer nome, descrição ou rótulo de opção:

```sh
npm run translations
```

Depois atualize o `pt.json`. Os testes falham enquanto algum dos dois arquivos estiver desatualizado.

O Activepieces não traduz a janela de conexão de uma peça com mais de um tipo de conexão, então essa janela aparece em inglês.

### Publicação

1. Aumente a `version` no `package.json` (patch para novas ações, entradas opcionais e correções; major para remoções, novas entradas obrigatórias ou mudança de comportamento) e registre a versão no `CHANGELOG.md`.
2. Execute `npm run licenses`. Ele reescreve o `LICENSE` com a licença de cada pacote embutido no arquivo publicado.
3. Confira o pacote com `npm run build && npm publish ./dist --dry-run`.
4. Faça o commit, envie para a `main` e envie uma tag `piece-assinafy-vX.Y.Z` igual à versão. O workflow **Publish Assinafy piece** verifica os tipos, roda os testes, gera o pacote e o publica no npm por trusted publishing, junto com os READMEs, o `LICENSE` e o `CHANGELOG.md`.

Nunca renomeie uma ação, gatilho ou entrada depois de publicada: os fluxos os referenciam pelo nome.

## Licença

MIT. O pacote publicado também embute as bibliotecas do Activepieces e alguns pacotes npm; o `LICENSE` lista cada um com sua licença.
