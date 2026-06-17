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
| `RATE_LIMIT_MSG_POR_MINUTO` | 15 | Máx. mensagens por usuário por minuto |
| `BETA_MODE` | false | Ativa o beta fechado quando `true` |
| `BETA_BLOCKED_REPLY` | false | Define se bloqueados recebem aviso; o padrão seguro é ignorar |
| `BETA_DEBUG` | false | Liga logs locais mascarados para diagnosticar whitelist |
| `BETA_DEBUG_SHOW_RAW` | false | Mostra valores sem máscara no debug; mantenha `false` por privacidade |
| `BETA_ALLOWED_NUMBERS` | — | Números autorizados, separados por vírgula |
| `BETA_ALLOWED_JIDS` | — | Fallback opcional para JIDs como `@lid`, separados por vírgula |
| `BETA_ALLOWED_GROUPS` | — | Grupos autorizados, separados por vírgula |
| `BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT` | true | Em grupo autorizado, exige participante autorizado |
| `PAINEL_PORTA` | 3000 | Porta do painel web |
| `PAINEL_TOKEN` | — | Token de acesso ao painel (obrigatório) |
| `BACKUP_MANTER_DIAS` | 7 | Dias de retenção dos backups |
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

## Comandos

### Ajuda
```
ajuda       # mostra exemplos principais
comandos    # mostra exemplos principais
como usar   # mostra exemplos principais
menu        # mostra exemplos principais
inicio      # mostra exemplos principais
início      # mostra exemplos principais
start       # mostra exemplos principais
```

### Lançamentos
```
mercado 120,50                # gasto, categoria mercado
mercado alimentacao 120,50    # gasto, categoria alimentacao
mercado 50                    # gasto, categoria mercado
50 mercado                    # gasto, categoria mercado
uber transporte 30            # gasto, categoria transporte
gastei 50 no mercado          # gasto, categoria mercado
gastei 80 no ifood            # gasto, categoria alimentacao
salario 5000                  # entrada
freela 800                    # entrada
2500 salario                  # entrada
recebi 2500 salario           # entrada
recebi 2500 salário           # entrada
entrou 500 pix                # entrada
ganhei 1200 freelance         # entrada
caiu 2500 salario             # entrada
caiu salario 2500             # entrada
receita 3000                  # entrada
entrada 3000                  # entrada
```

### Relatórios
```
relatorio        # detalhado do mês
relatorio geral  # todos os membros
resumo           # saldo rápido
categorias       # gastos por categoria
historico        # últimos 5 lançamentos
histórico        # últimos 5 lançamentos
ultimos gastos   # últimos 5 lançamentos
ultimos lancamentos # últimos 5 lançamentos
```

### Exportação de Planilha
```
exportar csv        # CSV simples por WhatsApp
exportar            # CSV simples por WhatsApp
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

## Painel Web

Acesse: `http://servidor:3000/?token=SEU_TOKEN`

Endpoints da API:

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check (público) |
| GET | `/api/stats` | Estatísticas gerais do mês |
| GET | `/api/usuarios` | Lista de usuários |
| GET | `/api/lancamentos/:mes` | Lançamentos do mês (ex: `6-2026`) |
| GET | `/api/exportar/:userId/:mes` | Download CSV |
| POST | `/api/backup` | Força backup manual |

Todos os endpoints (exceto `/health`) exigem o header `x-token` ou query param `?token=`.

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
│   ├── bot.js            ← conexão Baileys, privado, rate limit
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
│   ├── migrations/       ← arquivos SQL de schema
│   └── web/
│       └── painel.js     ← painel de administração Express
├── tests/
│   ├── validators.test.js
│   ├── exporters.test.js
│   ├── formatters.test.js
│   ├── database.test.js
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
