# Deploy

Este guia cobre execução local, PM2 e preparação de uma VPS. O projeto está em
beta; o deploy deve permanecer controlado.

## Requisitos

- Node.js 24.x;
- npm;
- Git;
- ferramentas de compilação exigidas pelo `better-sqlite3`;
- acesso ao WhatsApp para autenticação inicial;
- armazenamento persistente e backup.

Em distribuições Debian/Ubuntu, dependências nativas normalmente incluem:

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++
```

Instale o Node.js 24 por um gerenciador confiável, como nvm, ou pelo repositório
oficial adotado pela infraestrutura.

## Execução local

### Windows

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd test
npm.cmd start
```

### Linux ou macOS

```bash
npm install
cp .env.example .env
npm test
npm start
```

O primeiro início pode solicitar a leitura de um QR Code. A sessão criada em
`auth/` é sensível e não deve ser enviada ao Git.

## Configuração mínima

Revise no `.env` local:

```env
NODE_ENV=production
WHATSAPP_MENU_MODE=text
BETA_MODE=true
BETA_BLOCKED_REPLY=false
BETA_ALLOWED_NUMBERS=
BETA_ALLOWED_JIDS=
PAINEL_TOKEN=
DATABASE_PATH=./database/financas.db
BACKUP_DIR=./database/backups
AI_INTERPRETER_ENABLED=false
AI_LOG_RAW=false
```

Use um token longo e exclusivo no painel. Ative a IA somente depois de testar
o funcionamento local sem provider.

## PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
pm2 logs bot-financas-whatsapp
```

Comandos úteis:

```bash
pm2 restart bot-financas-whatsapp
pm2 stop bot-financas-whatsapp
pm2 delete bot-financas-whatsapp
```

O arquivo `ecosystem.config.cjs` executa uma instância, reinicia em falhas e
grava saída em `logs/`.

## Oracle Cloud ou VPS

1. Crie uma instância Linux com disco persistente.
2. Crie um usuário sem privilégios administrativos para executar o bot.
3. Instale Node.js 24, Git e dependências nativas.
4. Clone o repositório e execute `npm ci`.
5. Crie o `.env` diretamente no servidor, com permissões restritas.
6. Execute `npm test`.
7. Inicie com PM2 e configure o startup do serviço.
8. Restrinja a porta do painel no firewall.
9. Se precisar de acesso remoto, use HTTPS e proxy reverso.
10. Configure monitoramento e valide o backup.

Não copie `auth/` ou o banco por canais inseguros. Se uma sessão precisar ser
migrada, use transporte criptografado e remova cópias temporárias.

## Painel e rede

- `/health` é público e retorna somente informações mínimas.
- `/admin` e APIs administrativas exigem token.
- Evite enviar token em URL compartilhada ou screenshot.
- Prefira acesso local, VPN ou proxy reverso autenticado.
- Não deixe a porta do painel aberta para toda a internet.

## Dados persistentes

Preserve entre atualizações:

```text
auth/
database/
logs/
exports/
```

Essas pastas não fazem parte do código e permanecem ignoradas pelo Git.

## Backup

Backup manual:

```bash
npm run backup
```

Os arquivos são salvos em `BACKUP_DIR`. Além da criação automática, mantenha
uma cópia criptografada fora da máquina e teste a restauração.

### Restauração controlada

1. Pare o processo do bot.
2. Faça uma cópia do banco atual.
3. Confirme que o backup escolhido está íntegro.
4. Substitua o arquivo indicado por `DATABASE_PATH`.
5. Inicie o bot e valide o painel e consultas.
6. Preserve a cópia anterior até concluir a verificação.

## Atualização

```bash
git pull --ff-only
npm ci
npm test
pm2 restart bot-financas-whatsapp
```

Não atualize se os testes falharem. Tenha commit e backup anteriores disponíveis
para rollback.

## Checklist de deploy

- [ ] `.env` criado fora do Git.
- [ ] Beta fechado e whitelist revisados.
- [ ] `BETA_BLOCKED_REPLY=false`.
- [ ] `AI_LOG_RAW=false`.
- [ ] Token do painel forte.
- [ ] Testes passando.
- [ ] Banco e sessão em disco persistente.
- [ ] Firewall configurado.
- [ ] Backup manual testado.
- [ ] Restauração testada em ambiente separado.
- [ ] PM2 configurado para reiniciar após reboot.
