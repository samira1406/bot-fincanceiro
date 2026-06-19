# Solução de problemas

## `npm.ps1` não pode ser carregado

No PowerShell, use o executável do npm:

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

Isso evita alterar a política de execução apenas para rodar o projeto.

## Falha ao instalar `better-sqlite3`

Confirme:

- Node.js 24.x;
- arquitetura compatível;
- ferramentas de compilação;
- Python disponível para o processo de build.

Depois, remova somente a instalação local de dependências e execute `npm ci`
novamente. Não remova banco, sessão ou `.env`.

## QR Code não aparece

1. Confirme que não existe outra instância do bot.
2. Veja os logs do terminal ou `pm2 logs`.
3. Verifique conexão com a internet.
4. Confirme permissões de escrita em `auth/`.
5. Reinicie o processo.

Não publique o QR Code.

## `Bad MAC` ou sessão corrompida

Esse erro costuma estar relacionado à sessão criptográfica do WhatsApp.

1. Pare todas as instâncias.
2. Faça uma cópia privada de `auth/`.
3. Confirme que nenhuma máquina usa a mesma sessão.
4. Tente iniciar novamente.
5. Somente se o erro persistir, desconecte a sessão no WhatsApp e gere uma nova.

Não apague `auth/` enquanto o bot estiver rodando.

## Contato autorizado não recebe resposta

Verifique:

- `BETA_MODE`;
- DDI e DDD em `BETA_ALLOWED_NUMBERS`;
- `BETA_ALLOWED_JIDS` para identificadores `@lid`;
- grupo em `BETA_ALLOWED_GROUPS`;
- `BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT`;
- se a mensagem veio do próprio bot (`fromMe`).

Use primeiro:

```env
BETA_DEBUG=true
BETA_DEBUG_SHOW_RAW=false
```

O modo cru deve ser temporário e nunca enviado a logs públicos.

## `provider_error`

Ative apenas os metadados seguros:

```env
AI_LOG_ENABLED=true
AI_LOG_RAW=false
```

Confira provider, modelo, status HTTP, código e timeout. Valide chave, URL,
conectividade e disponibilidade do modelo.

## `insufficient_quota` ou `RESOURCE_EXHAUSTED`

- confira cota e faturamento no provider;
- reduza frequência de testes;
- verifique limites por minuto;
- mantenha o parser local ativo;
- não tente trocar automaticamente de provider sem configuração explícita.

## `json_invalido` ou `no_json_object`

O fallback local deve continuar funcionando. No log seguro, confira:

- `responseTextLength`;
- `parseStage`;
- `braceBalance`;
- `finishReason`;
- `MAX_TOKENS`;
- bloqueio de segurança.

Não habilite conteúdo bruto em ambiente compartilhado.

## Painel não abre

1. Confirme `PAINEL_PORTA` ou `PORT`.
2. Confira se o processo iniciou sem erro.
3. Teste `http://localhost:3000/health`.
4. Acesse `/admin` com token válido.
5. Verifique firewall e proxy reverso.
6. Confirme se a porta já está em uso.

O painel pode responder `401` quando o token está ausente ou incorreto.

## Porta em uso

Altere no `.env`:

```env
PORT=3001
PAINEL_PORTA=3001
```

Reinicie o processo e atualize regras de firewall ou proxy.

## Backup falhou

- confirme acesso ao arquivo indicado por `DATABASE_PATH`;
- confirme permissão de escrita em `BACKUP_DIR`;
- verifique espaço em disco;
- veja os logs sanitizados;
- execute `npm run backup` manualmente.

Não considere o incidente encerrado até testar uma restauração.

## Testes falham gerando arquivos em `exports/`

Alguns testes criam artefatos temporários ou ignorados. Confirme que `exports/`,
`*.csv` e `*.xlsx` permanecem no `.gitignore`. Não adicione esses arquivos ao
commit.

## Antes de abrir uma issue

Inclua:

- sistema operacional;
- versão do Node.js;
- comando executado;
- erro sanitizado;
- passos mínimos para reproduzir.

Remova números, JIDs, mensagens privadas, caminhos pessoais, chaves, tokens,
QR Codes e conteúdo do banco.
