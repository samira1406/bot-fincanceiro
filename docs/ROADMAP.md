# Roadmap

Este roadmap descreve a evolução planejada do Bot Finanças. Datas e escopo
podem mudar conforme os resultados do beta.

## Concluído

### Base técnica

- Bot em Node.js com Baileys.
- SQLite com migrations e WAL.
- Parser local para entradas, gastos e comandos.
- Estados pendentes isolados por usuário.
- Testes automatizados com Vitest.

### Operação

- Resumo, saldo, histórico e fechamento mensal.
- Metas mensais e alertas por categoria.
- Exportação CSV e XLSX.
- Painel administrativo protegido por token.
- Logs estruturados, rate limiting e health check.
- Backup automático e manual.
- Execução monitorada por PM2.

### Beta e IA

- Beta fechado por número, JID e grupo.
- Usuários não autorizados silenciosos.
- Tutorial, checklist, feedback e bug report do beta.
- Interpretador seguro com OpenAI ou Gemini.
- Extração e diagnóstico robusto de JSON.
- Normalização canônica de categorias, intents, métricas e períodos.

## Em andamento

- Ampliar o grupo de beta testers controlados.
- Medir falhas de interpretação sem registrar conteúdo sensível.
- Revisar categorias e aliases a partir de exemplos reais anonimizados.
- Validar restauração de backup em ambiente separado.
- Consolidar documentação de operação e suporte.

## Próximas fases

### Deploy controlado

- Preparar uma VPS ou Oracle Cloud com Node.js 24 e PM2.
- Restringir o painel por firewall, HTTPS e proxy reverso.
- Definir persistência para `auth/`, `database/`, `logs/` e backups.
- Criar checklist de atualização e rollback.

### Confiabilidade

- Monitoramento externo do endpoint `/health`.
- Alertas de processo, espaço em disco e falha de backup.
- Teste periódico de restauração.
- Política formal de retenção e remoção de dados.

### Produto

- Melhorias de UX baseadas no beta.
- Mais consultas e relatórios, mantendo validação local.
- Avaliação de experiência comercial demonstrável.
- Monetização futura somente após estabilidade, segurança e validação.

## Fora do escopo atual

- Pagamentos ou cobrança automática.
- Consultoria financeira automatizada.
- IA respondendo livremente.
- Abertura pública irrestrita.
- Promessa de operação financeira regulamentada.
