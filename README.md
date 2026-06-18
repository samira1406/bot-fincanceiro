# Bot de Finanças WhatsApp v3.0

Bot profissional para controle financeiro em conversas privadas e grupos autorizados do WhatsApp.

---

## O que há na v3.0

| Recurso | Status |
|---|---|
| SQLite com WAL mode | ✅ |
| Migrations versionadas | ✅ |
| Testes automatizados (vitest) | ✅ |
| Backup automático com retenção | ✅ |
| Painel web de administração | ✅ |
| Health check endpoint | ✅ |
| Rate limiting por usuário | ✅ |
| Atendimento privado e grupos autorizados com beta fechado | ✅ |
| Exportação CSV pelo WhatsApp | ✅ |
| Categorias de gasto | ✅ |
| Metas mensais com alertas | ✅ |
| Metas mensais por categoria | ✅ |
| Histórico de últimos lançamentos | ✅ |
| Correção do último lançamento | ✅ |
| Lembrete automático (último dia do mês) | ✅ |
| Alerta semanal de meta (segundas, 9h) | ✅ |
| Timeout de estado pendente | ✅ |
| Logs estruturados (pino) | ✅ |
| Variáveis de ambiente | ✅ |
| JSDoc em todos os módulos | ✅ |
| Reconnect com backoff exponencial | ✅ |

---

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env — pelo menos PAINEL_TOKEN

# 3. Rodar testes (opcional mas recomendado)
npm test

# 4. Migrar dados antigos (se tiver dados.json da v1/v2)
node migrate.js

# 5. Iniciar
npm start
# Escaneie o QR Code

# Para produção com PM2
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

---

## Configuração (.env)

| Variável | Padrão | Descrição |
|---|---|---|
| `GRUPO_PERMITIDO` | — | JID legado para rotinas automáticas |
| `GRUPOS_EXTRAS` | — | Configuração legada |
| `PALAVRAS_ENTRADA` | salario,freela,bonus,pix | Palavras que classificam entradas |
| `CAIXINHA_PERCENTUAL` | 30 | % sugerido para a caixinha |
| `VALOR_MAXIMO` | 100000 | Teto por lançamento (R$) |
| `TIMEOUT_ESTADO_MINUTOS` | 10 | Minutos para expirar estado pendente |
| `HORA_LEMBRETE_MENSAL` | 20 | Hora do lembrete automático |
| `WHATSAPP_INTERACTIVE_ENABLED` | false | Habilita experimentalmente listas pelo Baileys |
| `WHATSAPP_MENU_MODE` | text | `text`, `interactive` ou `auto`; `text` é o modo seguro |
| `RATE_LIMIT_MSG_POR_MINUTO` | 15 | Máx. mensagens por usuário por minuto |
| `BETA_MODE` | false | Ativa o beta fechado quando `true` |
| `BETA_BLOCKED_REPLY` | false | Define se bloqueados recebem aviso; o padrão seguro é ignorar |
| `BETA_DEBUG` | false | Liga logs locais mascarados para diagnosticar whitelist |
| `BETA_DEBUG_SHOW_RAW` | false | Mostra valores sem máscara no debug; mantenha `false` por privacidade |
| `BETA_ALLOWED_NUMBERS` | — | Números autorizados, separados por vírgula |
| `BETA_ALLOWED_JIDS` | — | Fallback opcional para JIDs como `@lid`, separados por vírgula |
| `BETA_ALLOWED_GROUPS` | — | Grupos autorizados, separados por vírgula |
| `BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT` | true | Em grupo autorizado, exige participante autorizado |
| `PORT` | 3000 | Alias de deploy para a porta do painel |
| `PAINEL_PORTA` | 3000 | Porta do painel web |
| `DASHBOARD_TOKEN` | — | Alias de deploy para token do painel |
| `PAINEL_TOKEN` | — | Token de acesso ao painel (obrigatório) |
| `BACKUP_MANTER_DIAS` | 7 | Dias de retenção dos backups |
| `BACKUP_DIR` | ./database/backups | Pasta de backups locais |
| `DATABASE_PATH` | ./database/financas.db | Caminho do banco SQLite |
| `LOG_LEVEL` | info | Nível de log |

---

## Conversas Privadas E Grupos

Por segurança, o bot foi projetado para funcionar em conversas privadas autorizadas e em grupos explicitamente autorizados.

Mensagens enviadas em grupos fora de `BETA_ALLOWED_GROUPS` são ignoradas silenciosamente: o bot não responde, não cria usuário, não registra lançamento, não cria meta e não exporta planilha.

Em grupos autorizados, o padrão seguro é `BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true`. Assim, o bot processa apenas mensagens enviadas por participantes liberados em `BETA_ALLOWED_NUMBERS` ou `BETA_ALLOWED_JIDS`.

Mensagens enviadas pelo próprio número do bot, marcadas pelo WhatsApp como `fromMe=true`, também são ignoradas para evitar respostas automáticas quando alguém usa o WhatsApp Web do número de trabalho.

---

## Modo Beta Fechado

Use o beta fechado para liberar o bot apenas para números convidados.

Exemplo no `.env`:

```env
BETA_MODE=true
BETA_BLOCKED_REPLY=false
BETA_DEBUG=false
BETA_ALLOWED_NUMBERS=5511000000000,5511000000001
BETA_ALLOWED_JIDS=1234567890@lid,0987654321@lid
BETA_ALLOWED_GROUPS=120363000000000000@g.us
BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true
```

Com `BETA_MODE=false` ou ausente, o bot continua funcionando normalmente para qualquer usuário em conversa privada.

Com `BETA_MODE=true`, somente os números listados em `BETA_ALLOWED_NUMBERS` conseguem usar comandos como `ajuda`, `gastei 35 no mercado`, `recebi 2500 salario`, `resumo`, `historico`, `meta mercado 600` e `exportar planilha`.

Com `BETA_BLOCKED_REPLY=false`, números não autorizados são ignorados silenciosamente. Isso evita responder clientes quando o número do bot também é um número de trabalho.

Com `BETA_BLOCKED_REPLY=true`, números não autorizados recebem uma mensagem avisando que o bot está em beta fechado. Mesmo nesse modo, nenhum lançamento, receita, meta ou exportação é registrado para esse contato.

Use números com DDI e DDD. Exemplo: `5515999999999`.

Os números podem ser informados apenas com dígitos. O bot normaliza espaços, símbolos, sufixos do WhatsApp e variações brasileiras com ou sem nono dígito antes de comparar.

Se o WhatsApp/Baileys entregar um identificador `@lid` sem telefone claro, use `BETA_DEBUG=true` para ver o identificador mascarado nos logs locais. Se for realmente necessário liberar por JID, preencha `BETA_ALLOWED_JIDS` no `.env` local com o valor correspondente, sem commitar esse arquivo:

```env
BETA_ALLOWED_JIDS=contato-ficticio@lid
```

Para liberar um grupo específico, use o JID do grupo em `BETA_ALLOWED_GROUPS`:

```env
BETA_ALLOWED_GROUPS=120363000000000000@g.us
BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true
```

Com `BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true`, participantes fora da whitelist são ignorados silenciosamente mesmo dentro de grupo autorizado.

Para diagnosticar sem responder clientes do número de trabalho:

```env
BETA_MODE=true
BETA_BLOCKED_REPLY=false
BETA_DEBUG=true
BETA_DEBUG_SHOW_RAW=false
```

Exemplo de log mascarado:

```text
[BETA_DEBUG] privado=true grupo=false fromMe=false remoteJid=55159****9999@s.whatsapp.net sender=55159****9999@s.whatsapp.net autorizado=true acao=processado
[BETA_DEBUG] privado=false grupo=true fromMe=false group=12036****0000@g.us participant=1234****7890@lid autorizado=true acao=processado
```

Nunca versione o `.env`.

---

## Onboarding e nome do usuário

Saudações como `oi`, `ola`, `olá`, `bom dia`, `boa tarde`, `boa noite`, `opa`, `e ai`, `e aí`, `start`, `inicio` e `início` iniciam ou retomam o onboarding.

Para um usuário novo, o bot pergunta como ele gostaria de ser chamado. Depois de receber um nome válido, passa a usar esse nome em saudações, resumos e planilhas.

Exemplo:

```text
Usuário: oi
Bot: Oi! Eu sou seu assistente financeiro pelo WhatsApp.
     Antes de começar, como você gostaria que eu te chamasse?

Usuário: Sadu
Bot: Perfeito, Sadu!
```

Comandos e frases financeiras, como `gastei 35 no mercado`, `resumo` e `exportar planilha`, nunca são salvos como nome. Enquanto aguarda um nome válido, o bot pede um nome ou apelido novamente.

---

## Comandos

### Ajuda
```
ajuda       # mostra exemplos principais
comandos    # mostra exemplos principais
como usar   # mostra exemplos principais
menu        # mostra exemplos principais
inicio      # inicia ou retoma a saudação
início      # inicia ou retoma a saudação
start       # inicia ou retoma a saudação
```

`menu`, `ajuda`, `oi` e `start` abrem o menu principal. O padrão recomendado,
especialmente para beta e WhatsApp Web, é:

```env
WHATSAPP_INTERACTIVE_ENABLED=false
WHATSAPP_MENU_MODE=text
```

Esse modo envia somente texto e não chama `relayMessage`, evitando a mensagem
"Não foi possível carregar a mensagem".

As listas do Baileys são experimentais: o envio pode concluir sem erro e ainda
assim o WhatsApp Web não conseguir renderizar. Os modos disponíveis são:

- `text`: sempre envia somente o menu textual;
- `interactive`: tenta a lista e envia também a instrução `menu texto`;
- `auto`: tenta a lista e envia também o menu textual completo.

Se `WHATSAPP_MENU_MODE` estiver ausente, `WHATSAPP_INTERACTIVE_ENABLED=false`
seleciona `text`; somente `true` seleciona experimentalmente `interactive`.
Em qualquer modo, `menu texto` força imediatamente o fallback textual.

```text
1. Registrar gasto
2. Registrar entrada
3. Ver resumo
4. Ver histórico
5. Exportar planilha
6. Metas
7. Ajuda completa
```

Depois de abrir o menu, também é possível responder apenas com o número. O
estado é individual por usuário e expira conforme `TIMEOUT_ESTADO_MINUTOS`.
Pendências financeiras têm prioridade: depois de enviar somente `1250`, as
respostas `1` e `2` continuam significando entrada e gasto.

`comandos`, `como usar` e a opção `Ajuda completa` exibem o guia textual
detalhado com exemplos de todos os recursos.

### Fallback inteligente

O bot procura orientar em vez de responder com um erro genérico. Nenhum
lançamento é criado quando a mensagem ainda deixa dúvida relevante.

Exemplos:

```text
mercado
```

Pede o valor e mostra `mercado 35`.

```text
R$ 300
```

Cria uma pendência e pergunta se é entrada ou gasto.

```text
300 manutenção
```

Confirma o tipo antes de registrar, preservando o valor e a descrição.

```text
planiha
```

Sugere o comando correto `planilha`.

```text
obrigado
```

Responde de forma curta e amigável, sem registrar nada.

Durante uma pendência, respostas vagas como `sei la` não viram categoria. O
bot relembra o valor, o tipo escolhido e pede novamente a informação que
falta. `cancelar`, `cancela`, `sair` e `voltar` encerram o fluxo sem registrar.

O comando `exemplos` mostra sugestões rápidas de gastos, entradas e consultas.
Eventos de fallback guardam apenas o motivo da classificação para diagnóstico;
o texto enviado pelo usuário não é armazenado no painel.

### Lançamentos
```
mercado 120,50                # gasto, categoria mercado
mercado alimentacao 120,50    # gasto, categoria alimentacao
mercado 50                    # gasto, categoria mercado
50 mercado                    # gasto, categoria mercado
uber transporte 30            # gasto, categoria transporte
gastei 50 no mercado          # gasto, categoria mercado
gastei 50 mercado             # gasto, categoria mercado
paguei 50 internet            # gasto, categoria internet
comprei 20 padaria            # gasto, categoria padaria
despesa 20 padaria            # gasto, categoria padaria
gastei 80 no ifood            # gasto, categoria alimentacao
salario 5000                  # entrada
freela 800                    # entrada
freelance 300                 # entrada
comissao 1250                 # entrada
comissão 1250                 # entrada
pix 200                       # entrada
2500 salario                  # entrada
recebi 2500 salario           # entrada
recebi 2500 salário           # entrada
recebi 1250 em comissionamento # entrada
recebi 1250 em free           # entrada
recebi 1250 em freelance      # entrada
recebi 1250 por consultoria   # entrada
recebi 1250 referente a freela # entrada
entrou 500 pix                # entrada
ganhei 1200 freelance         # entrada
caiu 2500 salario             # entrada
caiu salario 2500             # entrada
depositaram 1000              # entrada
receita 3000                  # entrada
entrada 3000                  # entrada
```

Valores aceitam formatos como `12,50`, `12.50`, `1.250,00` e `1250`.

Quando o usuário envia somente um valor, o bot mantém uma pendência individual até completar o lançamento:

```text
1250
2
mercado
```

Nesse exemplo, o bot registra uma despesa de `R$ 1.250,00` em Mercado. Na escolha do tipo, `1`, `entrada`, `receita`, `recebido` e `ganho` significam entrada; `2`, `gasto`, `despesa`, `saida`, `saída` e `pago` significam gasto.

Para abandonar o fluxo sem registrar, envie `cancelar`, `cancela`, `sair` ou `voltar`. Comandos como `resumo`, `ajuda`, `planilha` e `extrato` continuam funcionando e não são usados como categoria da pendência.

### Relatórios
```
relatorio        # detalhado do mês
relatorio geral  # todos os membros
resumo           # saldo rápido
saldo            # saldo rápido
meu resumo       # saldo rápido
resumo do mes    # saldo rápido
categorias       # gastos por categoria
historico        # últimos 5 lançamentos
histórico        # últimos 5 lançamentos
extrato          # últimos 5 lançamentos
ultimos          # últimos 5 lançamentos
lancamentos      # últimos 5 lançamentos
ultimos gastos   # últimos 5 lançamentos
ultimos lancamentos # últimos 5 lançamentos
```

### Exportação de Planilha
```
csv                 # CSV simples por WhatsApp
exportar csv        # CSV simples por WhatsApp
baixar csv          # CSV simples por WhatsApp
exportar            # XLSX visual por WhatsApp
planilha            # XLSX visual por WhatsApp
excel               # XLSX visual por WhatsApp
exportar planilha   # XLSX visual por WhatsApp
baixar planilha     # XLSX visual por WhatsApp
gerar planilha      # XLSX visual por WhatsApp
minha planilha      # XLSX visual por WhatsApp
planilha bonita     # XLSX visual por WhatsApp
planilha excel      # XLSX visual por WhatsApp
exportar excel      # XLSX visual por WhatsApp
xlsx                # XLSX visual por WhatsApp
exportar xlsx       # XLSX visual por WhatsApp
```

O CSV é a versão simples. O XLSX é a versão visual com abas de Resumo e Lancamentos, totais do mês, gastos por categoria e metas por categoria.

Exemplo:
```
gastei 35 no mercado
recebi 2500 salario
exportar planilha
```

Os arquivos são gerados em `exports/` e enviados pelo WhatsApp. A pasta `exports/` é temporária e não deve ir para o Git.

O CSV contém apenas os lançamentos do usuário atual, com as colunas:
```
data,tipo,categoria,descricao,valor
```

### Metas
```
meta 3000                         # define meta geral de gastos
meta ver                          # progresso da meta geral
meta mercado 600                  # meta mensal por categoria
meta alimentacao 500              # meta mensal por categoria
criar meta de 600 para mercado    # meta mensal por categoria
minha meta de mercado é 600       # meta mensal por categoria
limite mercado 600                # meta mensal por categoria
metas                             # lista metas do mês
minhas metas                      # lista metas do mês
ver metas                         # lista metas do mês
```

Exemplo:
```
meta mercado 600
gastei 50 no mercado
metas
```

### Apagar
```
apagar ultimo    excluir ultimo    deletar ultimo
apagar hoje      apagar semana     apagar mes
```

### Corrigir
```
corrigir ultimo para 45
corrige ultimo para 45
alterar ultimo para 45
```

---

## Deploy 24/7 Em VPS Com PM2

Fluxo recomendado para rodar o beta fechado fora do PC local:

```bash
# 1. Instale Node.js LTS e PM2 no servidor
npm install -g pm2

# 2. Clone o repositório
git clone <url-do-repositorio>
cd bot-v3

# 3. Instale dependências
npm install

# 4. Crie o .env manualmente
cp .env.example .env
nano .env

# 5. Rode migrations e testes
npm run migrate
npm test

# 6. Inicie com PM2
npm run pm2:start
npm run pm2:logs

# 7. Escaneie o QR Code do WhatsApp se aparecer

# 8. Salve o processo para reiniciar com o servidor
pm2 save
pm2 startup
```

Exemplo mínimo do beta no `.env` do servidor:

```env
NODE_ENV=production
BETA_MODE=true
BETA_BLOCKED_REPLY=false
BETA_DEBUG=false
BETA_DEBUG_SHOW_RAW=false
BETA_ALLOWED_NUMBERS=...
BETA_ALLOWED_JIDS=...
BETA_ALLOWED_GROUPS=...
BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true
DASHBOARD_TOKEN=troque-este-token
DATABASE_PATH=./database/financas.db
```

Comandos úteis:

```bash
npm run pm2:status
npm run pm2:logs
npm run pm2:restart
npm run pm2:stop
npm run backup
```

### Persistência

Estas pastas são locais do servidor e não devem ser apagadas em redeploy:

| Pasta | Função |
|---|---|
| `auth/` | Sessão do WhatsApp/Baileys. Se apagar, precisa escanear QR Code de novo. |
| `database/` | Banco SQLite e arquivos auxiliares. |
| `database/backups/` | Backups manuais/automáticos do banco. |
| `exports/` | Arquivos CSV/XLSX gerados temporariamente. |
| `logs/` | Logs locais do PM2/aplicação. |

Em VPS comum, essas pastas persistem enquanto a pasta do projeto não for removida. Em plataformas como Railway/Render, use volume persistente; sem volume, a sessão do WhatsApp e o banco podem ser perdidos.

### Backup

Backup manual:

```bash
npm run backup
```

O backup é salvo em `database/backups/` com nome no formato:

```text
financas-YYYY-MM-DD-HH-mm-ss.db
```

### Checklist Antes De Liberar Beta

- `npm test` passou.
- `.env` foi criado no servidor e não foi commitado.
- `BETA_MODE=true`.
- `BETA_BLOCKED_REPLY=false`.
- `BETA_DEBUG=false`.
- `BETA_DEBUG_SHOW_RAW=false`.
- Números/JIDs autorizados configurados.
- Grupo autorizado configurado, se necessário.
- WhatsApp conectado.
- PM2 rodando.
- `npm run backup` testado.
- Cliente/número não autorizado não recebe resposta.
- Grupo não autorizado não recebe resposta.
- Exportação XLSX testada.

---

## Painel Interno/Admin

O painel interno ajuda a acompanhar a operacao do bot localmente ou em beta: status do servico, conexao do WhatsApp, banco, beta fechado, backups e eventos recentes.

Configure um token no `.env` local:

```env
DASHBOARD_TOKEN=troque-por-um-token-forte
PORT=3000
```

Tambem funciona com `PAINEL_TOKEN`, mantido por compatibilidade. Nao use token real no `.env.example` nem no Git.

Acesso local:

```text
http://localhost:3000/admin?token=SEU_TOKEN
http://localhost:3000/painel?token=SEU_TOKEN
http://localhost:3000/dashboard?token=SEU_TOKEN
```

O painel aceita token por query string em ambiente local/beta e por header:

```text
Authorization: Bearer SEU_TOKEN
```

Rotas internas:

| Metodo | Rota | Token | Descricao |
|---|---|---|---|
| GET | `/health` | Nao | Health check publico minimo |
| GET | `/admin` | Sim | Interface visual do painel |
| GET | `/painel` | Sim | Alias da interface |
| GET | `/dashboard` | Sim | Alias da interface |
| GET | `/api/admin/status` | Sim | Status geral, uptime, memoria, bot, banco e beta |
| GET | `/api/admin/metrics` | Sim | Contagens agregadas do banco e resumo do mes |
| GET | `/api/admin/beta` | Sim | Configuracoes do beta com valores mascarados |
| GET | `/api/admin/backups` | Sim | Ultimos backups encontrados |
| POST | `/api/admin/backup` | Sim | Gera backup manual |
| GET | `/api/admin/events` | Sim | Eventos recentes em memoria |

Cards principais:

- Servico online/offline.
- Status do WhatsApp e ultima mensagem processada.
- Uptime e memoria do processo Node.
- Status e tamanho aproximado do banco.
- Total de usuarios, lancamentos, receitas, despesas e metas.
- Status do beta fechado e quantidades autorizadas.
- Ultimos backups e botao para gerar backup manual.

Cuidados de seguranca:

- Nao exponha o painel publicamente sem HTTPS, firewall/reverse proxy e token forte.
- O `/health` fica publico, mas retorna apenas `ok` e `service`.
- O painel nao mostra `.env`, token, numeros completos, JIDs completos, sessao do WhatsApp ou dados financeiros detalhados de clientes.
- Em VPS, mantenha `auth/`, `database/`, `database/backups/`, `logs/` e `exports/` fora do Git e com permissao restrita.
- Para gerar backup manual pelo painel, acesse com token e clique em `Gerar backup agora`; o arquivo fica em `BACKUP_DIR`.

Rotas antigas de suporte interno continuam protegidas por token: `/api/stats`, `/api/usuarios`, `/api/lancamentos/:mes`, `/api/exportar/:userId/:mes` e `/api/backup`.

---

## Testes

```bash
npm test           # roda uma vez
npm run test:watch # modo watch
npm run test:cover # com relatório de cobertura
```

Cobertura mínima esperada: validators (100%), formatters (100%), database (>90%), rateLimiter (>90%).

---

## Migrations

Para adicionar uma nova feature ao banco:

1. Crie `src/migrations/003_nome_da_feature.sql`
2. Escreva o SQL de alteração
3. Reinicie o bot — a migration é aplicada automaticamente

O sistema registra quais migrations já foram aplicadas na tabela `_migrations`.

---

## Estrutura

```
├── index.js
├── src/
│   ├── bot.js            ← conexão Baileys, privado/grupos autorizados, rate limit
│   ├── commands.js       ← todos os handlers + dispatcher
│   ├── database.js       ← SQLite, migrations, queries, CSV
│   ├── exporters.js      ← geração de CSV e arquivos em exports/
│   ├── formatters.js     ← formatação de mensagens
│   ├── validators.js     ← validação de inputs
│   ├── scheduler.js      ← cron jobs
│   ├── backup.js         ← backup automático com retenção
│   ├── rateLimiter.js    ← rate limiting por usuário
│   ├── config.js         ← configuração centralizada
│   ├── logger.js         ← logs estruturados
│   ├── runtimeState.js   ← estado em memória para painel interno
│   ├── migrations/       ← arquivos SQL de schema
│   └── web/
│       └── painel.js     ← painel de administração Express
├── tests/
│   ├── validators.test.js
│   ├── exporters.test.js
│   ├── formatters.test.js
│   ├── database.test.js
│   ├── bot.test.js
│   ├── config.test.js
│   ├── commands.test.js
│   ├── deploy.test.js
│   ├── painel.test.js
│   └── rateLimiter.test.js
├── scripts/
│   └── backup.js         ← backup manual
├── database/
│   └── financas.db       ← gerado automaticamente
├── auth/                 ← credenciais WA (gerado no 1º uso)
├── logs/
├── exports/              ← CSVs temporários (ignorado pelo Git)
├── .env.example
└── ecosystem.config.cjs
```
