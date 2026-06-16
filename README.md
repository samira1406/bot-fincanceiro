# Bot de Finanças WhatsApp v3.0

Bot profissional para controle financeiro em grupo do WhatsApp.

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
| Suporte a múltiplos grupos | ✅ |
| Exportação CSV pelo WhatsApp | ✅ |
| Categorias de gasto | ✅ |
| Metas mensais com alertas | ✅ |
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
# Edite o .env — pelo menos GRUPO_PERMITIDO e PAINEL_TOKEN

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
| `GRUPO_PERMITIDO` | — | JID do grupo (obrigatório) |
| `GRUPOS_EXTRAS` | — | Grupos adicionais separados por vírgula |
| `PALAVRAS_ENTRADA` | salario,freela,bonus,pix | Palavras que classificam entradas |
| `CAIXINHA_PERCENTUAL` | 30 | % sugerido para a caixinha |
| `VALOR_MAXIMO` | 100000 | Teto por lançamento (R$) |
| `TIMEOUT_ESTADO_MINUTOS` | 10 | Minutos para expirar estado pendente |
| `HORA_LEMBRETE_MENSAL` | 20 | Hora do lembrete automático |
| `RATE_LIMIT_MSG_POR_MINUTO` | 15 | Máx. mensagens por usuário por minuto |
| `PAINEL_PORTA` | 3000 | Porta do painel web |
| `PAINEL_TOKEN` | — | Token de acesso ao painel (obrigatório) |
| `BACKUP_MANTER_DIAS` | 7 | Dias de retenção dos backups |
| `LOG_LEVEL` | info | Nível de log |

---

## Comandos

### Lançamentos
```
mercado 120,50                # gasto, categoria geral
mercado alimentacao 120,50    # gasto, categoria alimentacao
uber transporte 30            # gasto, categoria transporte
salario 5000                  # entrada
freela 800                    # entrada
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
exportar         # CSV por WhatsApp
```

### Metas
```
meta 3000        # define meta de gastos
meta ver         # progresso + barra visual
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
│   ├── bot.js            ← conexão Baileys, multi-grupo, rate limit
│   ├── commands.js       ← todos os handlers + dispatcher
│   ├── database.js       ← SQLite, migrations, queries, CSV
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
│   ├── formatters.test.js
│   ├── database.test.js
│   └── rateLimiter.test.js
├── scripts/
│   └── backup.js         ← backup manual
├── database/
│   └── financas.db       ← gerado automaticamente
├── auth/                 ← credenciais WA (gerado no 1º uso)
├── logs/
├── .env.example
└── ecosystem.config.cjs
```
