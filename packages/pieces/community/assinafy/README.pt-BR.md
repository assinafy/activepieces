# Assinafy para Activepieces

[English](README.md)

Envie documentos para assinatura eletrônica com validade jurídica pela [Assinafy](https://www.assinafy.com.br) e use o resultado em fluxos do [Activepieces](https://www.activepieces.com): envie um PDF, convide os signatários por e-mail ou WhatsApp, aguarde as assinaturas e guarde o PDF assinado onde precisar.

- Pacote: `@assinafy/piece-assinafy`
- Requer Activepieces 0.88.2 ou superior
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

A conexão é verificada ao salvar e recebe o nome do espaço de trabalho.

### Assinafy Account (OAuth)

Um proprietário do espaço de trabalho na Assinafy registra uma aplicação OAuth uma única vez, em **Configurações → Aplicações OAuth**:

| Campo | Valor |
|---|---|
| URI de redirecionamento | A URL de redirecionamento exibida pelo Activepieces na janela de conexão, por exemplo `https://automations.example.com/redirect` |
| Tipo | Confidencial |
| Permissões | `documents:read`, `documents:write`, `templates:read`, `templates:write`, `account:read`, `webhooks:write`, `offline_access` |

Informe o Client ID e o Client Secret da aplicação no Activepieces, depois entre na Assinafy e escolha o espaço de trabalho a conectar. Cada conexão OAuth funciona com exatamente um espaço de trabalho. O OAuth sempre usa o ambiente de produção; para o sandbox, use uma chave de API.

A Assinafy encerra conexões OAuth 30 dias após a aprovação do usuário, e a renovação do token não estende esse prazo. Conecte novamente todo mês ou use uma chave de API em automações que precisam rodar sem intervenção.

## Fluxos comuns

**Enviar um PDF para assinatura**

1. Qualquer gatilho que forneça um arquivo (um formulário, um anexo de e-mail, um registro de CRM).
2. **Upload Document** (Enviar Documento) com esse arquivo.
3. **Request Signatures** (Solicitar Assinaturas) no documento enviado, com o nome e o e-mail ou WhatsApp de cada signatário.

**Guardar todo contrato assinado**

1. Gatilho **Document Signed** (Documento Assinado).
2. **Download Document** (Baixar Documento) com **File** (Arquivo) definido como *PDF assinado*.
3. Envie o arquivo para o seu armazenamento (Google Drive, SharePoint, S3…).

**Gerar um contrato a partir de um modelo**

1. Qualquer gatilho com os dados do cliente.
2. **Create Document from Template** (Criar Documento a partir de Modelo): escolha o modelo, preencha o signatário de cada papel e os campos do modelo.

## Ações

| Ação | O que faz | Principais entradas | Saída |
|---|---|---|---|
| Enviar Documento | Envia um PDF (até 25 MB) | Arquivo, nome opcional | Documento |
| Solicitar Assinaturas | Envia um documento para assinatura; aguarda até 30 segundos enquanto o arquivo de um envio recente ainda está sendo recebido | Documento, signatários (nome, e-mail ou WhatsApp, verificação, CPF/CNPJ, ordem de assinatura), mensagem, prazo, destinatários de cópia | Solicitação de assinatura |
| Criar Documento a partir de Modelo | Cria um documento a partir de um modelo pronto e o envia | Modelo, um signatário por papel, campos do modelo, nome, mensagem, prazo, etiquetas | Documento |
| Obter Documento | Lê um documento e o progresso das assinaturas | Documento | Documento |
| Buscar Documentos | Busca documentos, dos atualizados mais recentemente para os mais antigos | Texto de busca, status, máximo de resultados (1 a 100) | Lista de documentos |
| Baixar Documento | Salva um arquivo do documento para as próximas etapas; aguarda até um minuto enquanto a certificação termina | Documento, arquivo (PDF assinado, original, página do certificado, pacote ZIP, PAdES), nome do arquivo | Arquivo |
| Reenviar Solicitação de Assinatura | Envia o convite novamente para um signatário | Documento, signatário | Resultado do envio |
| Atualizar Prazo de Assinatura | Define um novo prazo para a solicitação de assinatura | Documento, novo prazo | Solicitação de assinatura |
| Excluir Documento | Exclui permanentemente um documento não assinado | Documento | Confirmação |
| Buscar Signatários | Busca signatários cadastrados | Texto de busca, máximo de resultados (1 a 100) | Lista de signatários |
| Criar Signatário | Cadastra um signatário | Nome completo, e-mail, WhatsApp, CPF/CNPJ | Signatário |
| Atualizar Signatário | Altera um signatário cadastrado | Signatário, campos a alterar | Signatário |
| Chamada de API Personalizada | Chama qualquer endpoint da API da Assinafy com as credenciais da conexão, que são enviadas apenas ao endereço da Assinafy da conexão (por isso **Follow redirects** (Seguir redirecionamentos) deve ficar desativado) | Método, URL, cabeçalhos, parâmetros, corpo | Resposta da API |

Toda entrada de documento, signatário e modelo é uma lista suspensa, com busca exceto o signatário em **Reenviar Solicitação de Assinatura**, que lista os signatários do documento escolhido. Você também pode mapear um ID de uma etapa anterior.

### Signatários

**Solicitar Assinaturas** e **Criar Documento a partir de Modelo** recebem dados de contato, não IDs de signatários da Assinafy:

- O signatário é identificado pelo e-mail, ou pelo nome e número de WhatsApp quando não há e-mail, então informe o nome completo de um signatário que tem apenas WhatsApp. Números de WhatsApp são comparados sem considerar a formatação, e um número sem o código do país corresponde ao número internacional cadastrado.
- Se ninguém corresponder, um signatário é criado, o que exige o nome completo.
- Um número de WhatsApp ausente é adicionado a um signatário existente. Um número de WhatsApp diferente do cadastrado interrompe a etapa com um erro, em vez de usar o valor cadastrado.
- O CPF/CNPJ só é salvo quando o signatário é criado. A Assinafy não mostra CPFs cadastrados, então a etapa não pode compará-los e nunca altera o CPF de um signatário existente.
- Altere dados cadastrados com **Atualizar Signatário**; alterar um canal invalida convites já enviados.
- Todas as linhas de signatários e destinatários de cópia são verificadas e buscadas antes de criar ou alterar qualquer signatário: contato para o canal escolhido, CPF ou CNPJ válido (incluindo os dígitos verificadores), nenhum e-mail ou número de WhatsApp repetido, nenhuma pessoa informada duas vezes com dados diferentes e as regras de ordem de assinatura abaixo.

### Verificação e custos

| Verificação | Convite | Custo por signatário |
|---|---|---|
| Código por e-mail (padrão) | E-mail | Gratuito |
| Código por WhatsApp | WhatsApp | 0,45 crédito (planos pagos) |
| Certificado digital ICP-Brasil | E-mail | 2 créditos |
| Certificado digital ICP-Brasil | WhatsApp | 2,45 créditos |

Quando **Verification** (Verificação) fica em branco, é usado o e-mail, ou o WhatsApp quando o signatário tem apenas número de WhatsApp. A assinatura com certificado digital exige o recurso Certificado Digital no plano da Assinafy, o CPF ou CNPJ do signatário cadastrado na Assinafy (informado na etapa quando o signatário é novo, ou definido com **Atualizar Signatário**) e que ele esteja sozinho na sua etapa da ordem de assinatura. Toda solicitação de assinatura também consome um documento do plano, ou um crédito quando a franquia acaba.

Destinatários de cópia podem não estar disponíveis em todos os planos da Assinafy. Quando a Assinafy não mantém um destinatário de cópia pedido, **Solicitar Assinaturas** falha depois do envio, informando o ID da solicitação de assinatura; não execute a etapa de novo para o mesmo documento, senão os signatários são convidados duas vezes.

### Ordem de assinatura

Deixe **Signing Order** (Ordem de Assinatura) em branco para que todos assinem ao mesmo tempo. Para assinar em sequência, preencha em todos os signatários: todos com `1` são convidados primeiro, `2` depois que todos eles assinarem, e assim por diante. Os números devem começar em 1 sem pular valores, e um signatário com certificado digital não pode compartilhar o número com ninguém.

Em **Criar Documento a partir de Modelo**, cada papel de signatário do modelo tem suas próprias entradas de e-mail, número de WhatsApp, nome completo, CPF/CNPJ, verificação e ordem de assinatura. Papéis de editor não são signatários: seus campos aparecem em **Template Fields** (Campos do Modelo).

## Gatilhos

| Gatilho | Quando dispara | Entrega |
|---|---|---|
| Documento Assinado | Todos os signatários assinaram e o PDF assinado está pronto, para assinaturas concluídas depois que o fluxo foi ativado | Verificado a cada poucos minutos. Qualquer número de fluxos pode usá-lo. |
| Novo Evento (Instantâneo) | Os eventos escolhidos da Assinafy acontecem: documento assinado por todos, signatário assinou, signatário recusou, documento cancelado e outros | Instantânea, pelo webhook do espaço de trabalho |

**Novo Evento (Instantâneo)** usa o webhook do espaço de trabalho, e a Assinafy entrega os eventos de cada espaço de trabalho para um único endereço:

- Use-o em apenas um fluxo ativo por espaço de trabalho; adicione uma etapa Router para tratar vários tipos de evento.
- Se o espaço de trabalho já entrega eventos para outro sistema, o fluxo não é iniciado a menos que **Replace Existing Webhook** (Substituir Webhook Existente) esteja ativado.
- Desativar o fluxo interrompe o webhook, mas apenas enquanto ele ainda aponta para esse fluxo.
- **Delivery Notice Email** (E-mail para Avisos de Entrega) recebe os avisos da Assinafy sobre falhas de entrega. É obrigatório apenas quando o espaço de trabalho ainda não tem um endereço.
- Em eventos de documento, o fluxo recebe o estado atual do documento, lido na API quando o evento chega. Se ele não puder ser lido (por exemplo, depois de excluído), é usada a cópia enviada com o evento.
- A Assinafy tenta novamente uma única vez quando a entrega falha. O Activepieces descarta um evento repetido que chega em até 30 segundos; para repetições posteriores, `event_id` identifica o evento.
- Cada fluxo registra seu endereço de webhook com um segredo aleatório, e requisições sem ele são ignoradas. O segredo continua o mesmo quando o fluxo é republicado ou desativado e ativado de novo, então entregas já a caminho continuam valendo. A Assinafy não assina as requisições de webhook, então mantenha o endereço em sigilo.

O documento fica assinado assim que o último signatário assina, mas o PDF assinado só fica disponível depois que a certificação termina. **Documento Assinado** dispara depois da certificação; **Baixar Documento** também aguarda até um minuto enquanto a certificação ainda está em andamento.

**Documento Assinado** dispara uma única vez por documento cuja assinatura foi concluída depois da ativação do fluxo. Ele consulta o histórico de atividades de cada novo documento assinado para obter o momento da conclusão, então documentos assinados antes e alterados depois (por exemplo, com uma etiqueta nova) não o disparam. Cada verificação olha dez minutos para trás para tolerar diferenças de relógio. Depois de uma indisponibilidade, ele processa o acúmulo ao longo de várias verificações, sem pular nem repetir nenhum.

## Campos de saída

As saídas são planas e prontas para tabelas e planilhas, exceto `signers`, que traz um registro por signatário para que os fluxos possam percorrê-los.

Saídas de documento:

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
| `decline_reason`, `declined_by_name`, `declined_by_email` | Preenchidos quando um signatário recusa |
| `tags`, `page_count`, `template_id`, `created_at`, `updated_at` | Outros dados do documento |

Saídas de **Novo Evento (Instantâneo)**:

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
| `This Assinafy workspace already sends its webhooks to …` | Outro sistema recebe os eventos do espaço de trabalho. Ative **Replace Existing Webhook** apenas se esse sistema não precisar mais deles, ou use **Documento Assinado**. |
| `HTTP 403 … approved permissions` | Falta uma permissão na conexão OAuth. Adicione-a à aplicação OAuth e conecte novamente. |
| `HTTP 401` em uma conexão OAuth que funcionava | Conexões OAuth terminam 30 dias após a aprovação. Conecte novamente. |
| `… is saved in Assinafy with a different WhatsApp number` | Atualize o signatário com **Atualizar Signatário** ou deixe o número de WhatsApp em branco para usar o cadastrado. |
| `… must be the only signer in their signing order step` | Dê ao signatário com certificado digital um número de ordem de assinatura só dele. |
| `Assinafy is still receiving the file of this document` | O envio ainda estava em andamento depois de 30 segundos. Execute a etapa de novo ou adicione uma etapa de espera (Delay) depois de **Enviar Documento**. |

## Desenvolvimento

A peça fica no monorepo do Activepieces em `packages/pieces/community/assinafy`. Requisitos: Node.js 24 LTS e Bun.

```sh
bun install
npx turbo run build --filter=@assinafy/piece-assinafy
npx turbo run lint --filter=@assinafy/piece-assinafy
cd packages/pieces/community/assinafy
npm run typecheck        # código e testes
npm test                 # testes unitários, sem rede
npm run test:coverage    # com limites de cobertura
```

Os testes unitários simulam o cliente HTTP e bloqueiam qualquer acesso real à rede. Um teste de envio usa o cliente HTTP real do Activepieces com um `fetch` simulado para verificar a requisição multipart enviada.

### Notas de implementação

- As requisições feitas pelos gatilhos expiram depois de 15 segundos, bem dentro do tempo que o Activepieces dá para a execução de um gatilho; as ações permitem 120 segundos.
- Quando duas execuções criam o mesmo novo signatário ao mesmo tempo, a execução que perde reutiliza o signatário criado pela outra.
- As requisições não seguem redirecionamentos automaticamente. Um redirecionamento só é seguido em leituras e downloads, e as credenciais ficam de fora quando ele aponta para fora do endereço da Assinafy, por exemplo para o armazenamento de arquivos.
- O envio de arquivos usa o pacote `form-data`. O cliente HTTP do Activepieces define o tipo de conteúdo multipart e o boundary apenas para corpos `form-data`; um corpo `FormData` global seria enviado como JSON.
- O endpoint de criação de signatário da Assinafy não aceita CPF/CNPJ, então ele é definido com uma atualização em seguida.
- A Assinafy retorna no máximo 50 itens por página de lista e repete a última página quando é pedida uma página além do fim. As leituras de listas seguem o cabeçalho `X-Pagination-Page-Count` e param em uma página incompleta ou repetida.
- A referência da API não documenta um endpoint para um único modelo, então o formulário e a ação de modelo percorrem até 500 modelos.
- **Documento Assinado** mantém seu próprio estado e o preserva quando o fluxo é republicado: o momento da ativação, a última verificação concluída, a posição de uma varredura de acúmulo em andamento e um registro dos documentos disparados recentemente.
  - Documentos assinados são listados do mais recente para o mais antigo, não podem ser excluídos e só descem na lista quando outros são assinados ou alterados. Por isso a varredura retoma logo após o último documento examinado (pela data de atualização e pelo ID), e o ponto de controle de tempo só avança quando a varredura alcança documentos anteriores à verificação anterior.
  - Um documento dispara quando o momento da conclusão (a atividade `document_ready` mais recente, senão a `signer_signed_document` mais recente) é posterior à ativação do gatilho e no máximo 24 horas anterior ao início da janela da verificação. Um documento sem nenhuma dessas atividades não dispara. O registro guarda os documentos disparados nesse período para que alterações posteriores não os disparem de novo, descarta entradas que não podem mais passar na regra e tem no máximo 5.000 entradas para respeitar o limite de armazenamento do Activepieces.
  - Cada verificação lê no máximo 10 páginas de 50 documentos e 40 históricos de atividades, e para depois de 30 segundos; a verificação seguinte continua de onde parou. Um erro depois de examinar alguns documentos mantém esse progresso; um erro antes disso faz a verificação falhar.
  - Um documento cujo histórico de atividades não pode ser lido é tentado de novo nas duas verificações seguintes. Depois disso ele dispara usando a data de atualização como momento da conclusão, para que um documento com problema não pare o gatilho.
  - O Activepieces salva o progresso de um gatilho por verificação antes de iniciar as execuções dos itens retornados. Se iniciá-las falhar, esses documentos não são retornados de novo. Isso vale para todo gatilho por verificação do Activepieces; a peça não recebe nenhum sinal para reenviá-los.

### Testes no sandbox

`test/live.test.ts` roda apenas no sandbox da Assinafy e exclui tudo o que cria:

```sh
ASSINAFY_API_KEY=<chave do sandbox> npm run test:live
```

| Variável | Efeito |
|---|---|
| `ASSINAFY_ACCOUNT_ID` | Espaço de trabalho a usar quando a chave tem vários |
| `ASSINAFY_LIVE_SEND=1` | Também envia uma solicitação de assinatura para um endereço `example.com` (consome um documento do plano) |
| `ASSINAFY_LIVE_WEBHOOK=1` | Também ativa e desativa o webhook do espaço de trabalho; falha em vez de substituir outro destino |
| `ASSINAFY_LIVE_WEBHOOK_EMAIL` | Endereço de avisos de entrega para o teste do webhook (padrão: um endereço `example.com`) |

O conjunto também lê o histórico de atividades de um documento, do qual **Documento Assinado** depende.

### Testar em um Activepieces local

Adicione `AP_DEV_PIECES=assinafy` em `packages/server/api/.env`, execute `npm start` na raiz do repositório e abra <http://localhost:4200>.

### Traduções

`src/i18n/translation.json` é gerado a partir da peça e `src/i18n/pt.json` contém os textos em português do Brasil. Depois de alterar qualquer nome, descrição ou rótulo de opção:

```sh
npm run cli -- pieces generate-translation-file assinafy
```

Se o comando parar em um erro de tipos fora desta peça, execute `TS_NODE_TRANSPILE_ONLY=true npm run cli -- pieces generate-translation-file assinafy`. Depois atualize o `pt.json`. Os testes falham enquanto algum dos dois arquivos estiver desatualizado.

O Activepieces não traduz a janela de conexão de uma peça com mais de um tipo de conexão, então essa janela aparece em inglês.

### Publicação

1. Aumente a `version` no `package.json` (patch para novas ações, entradas opcionais e correções; major para remoções, novas entradas obrigatórias ou mudança de comportamento) e registre a versão no `CHANGELOG.md`.
2. Execute `npm run licenses` nesta pasta. Ele reescreve o `LICENSE` com a licença de cada pacote embutido no arquivo publicado.
3. Autentique-se no npm (`npm login`) com uma conta que possa publicar no escopo `@assinafy`.
4. Na raiz do repositório:

   ```sh
   TS_NODE_TRANSPILE_ONLY=true npm_config_dry_run=true npm run publish-piece assinafy   # confere o pacote, não publica nada
   TS_NODE_TRANSPILE_ONLY=true npm run publish-piece assinafy
   ```

   `TS_NODE_TRANSPILE_ONLY=true` ignora um erro de tipos não relacionado em outra parte do repositório que interrompe o script. O script compila a peça, gera um único arquivo com as bibliotecas do Activepieces embutidas, verifica que não sobrou nenhuma dependência de workspace ou `@activepieces/*` e publica com acesso público junto com os READMEs, o `LICENSE` e o `CHANGELOG.md`. Uma versão que já está no npm é ignorada, então aumente a versão antes de publicar alterações.

Nunca renomeie uma ação, gatilho ou entrada depois de publicada: os fluxos os referenciam pelo nome.

## Licença

MIT. O pacote publicado também embute as bibliotecas do Activepieces e alguns pacotes npm; o `LICENSE` lista cada um com sua licença.
