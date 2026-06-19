# Segurança

O Bot Finanças processa mensagens e dados financeiros pessoais. A operação deve
seguir o princípio de menor acesso e manter o beta fechado.

## Arquivos sensíveis

Nunca versione, anexe em issues ou compartilhe:

```text
.env
auth/
auth_antigo/
database/
logs/
exports/
```

- `.env` contém tokens, chaves e whitelist.
- `auth/` permite reutilizar a sessão do WhatsApp.
- `database/` contém informações financeiras.
- `logs/` podem conter metadados operacionais.
- `exports/` contém relatórios do usuário.

## Chaves de IA

- Use `GEMINI_API_KEY` e `AI_API_KEY` somente no `.env` local.
- Nunca adicione chaves ao código, README, screenshots ou mensagens de erro.
- Mantenha `AI_LOG_RAW=false`.
- Aplique limites de cota no provider.
- Revogue imediatamente qualquer chave exposta.

O interpretador envia somente a mensagem atual e contexto mínimo. A IA não
deve receber histórico completo, banco, arquivos de autenticação ou tokens.

## WhatsApp

- Trate `auth/` como uma credencial.
- Não publique QR Codes.
- Revogue sessões desconhecidas pelo aplicativo do WhatsApp.
- Restrinja permissões de leitura da pasta no servidor.
- Não execute duas instâncias usando a mesma sessão sem planejamento.

Erros persistentes como `Bad MAC` podem indicar sessão corrompida. Consulte
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) antes de apagar qualquer arquivo.

## Beta fechado

Configuração recomendada:

```env
BETA_MODE=true
BETA_BLOCKED_REPLY=false
BETA_DEBUG=false
BETA_DEBUG_SHOW_RAW=false
BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true
```

- Números autorizados ficam em `BETA_ALLOWED_NUMBERS`.
- Identificadores `@lid` ficam em `BETA_ALLOWED_JIDS`.
- Grupos ficam em `BETA_ALLOWED_GROUPS`.
- Não autorizados devem permanecer silenciosos.
- Ative debug cru somente por tempo limitado e no terminal local.

## Painel administrativo

- Troque `PAINEL_TOKEN` e `DASHBOARD_TOKEN`.
- Use token longo, aleatório e exclusivo.
- Não exponha a porta diretamente à internet.
- Prefira VPN, firewall ou proxy reverso com HTTPS.
- Não envie links com token por canais públicos.
- O endpoint `/health` deve continuar mínimo e sem dados pessoais.

## Banco e backups

- Restrinja permissões de `database/`.
- Faça cópias criptografadas fora da máquina.
- Teste restauração periodicamente.
- Defina retenção compatível com a necessidade do beta.
- Remova dados de testers que solicitarem exclusão.
- Não use backups reais em ambientes de demonstração.

## Logs

- Mantenha `BETA_DEBUG_SHOW_RAW=false`.
- Mantenha `AI_LOG_RAW=false`.
- Use apenas metadados sanitizados para diagnóstico.
- Evite registrar mensagens, números completos, JIDs, tokens ou chaves.
- Restrinja acesso e retenção dos arquivos de log.

## Dependências

- Use versões suportadas do Node.js.
- Revise atualizações de Baileys e `better-sqlite3`.
- Execute `npm audit` como apoio, avaliando o contexto de cada alerta.
- Rode a suíte completa antes de atualizar produção ou beta remoto.

## Incidente de segurança

Se um segredo ou dado for exposto:

1. Pare o serviço, se necessário.
2. Revogue chaves e tokens.
3. Desconecte a sessão do WhatsApp afetada.
4. Preserve evidências sem publicar dados.
5. Troque credenciais e revise logs.
6. Informe as pessoas afetadas quando aplicável.
7. Registre a correção sem incluir o segredo no histórico.

Para relatar vulnerabilidade, prefira um GitHub Security Advisory privado, se
disponível. Não abra issue pública contendo exploit, token ou dado pessoal.

## Limites do projeto

Este software está em beta e não substitui contabilidade, conciliação bancária
ou aconselhamento financeiro profissional. Baileys é uma integração não
oficial com o WhatsApp.
