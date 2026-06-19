# Changelog

Este documento acompanha o ciclo funcional do beta. O `package.json` mantém a
versão técnica original `3.0.0`; consulte a nota no README.

## v0.5.5 - Normalização canônica

- Categorias com aliases e correção de erros comuns.
- Normalização de intents, métricas, períodos e tipos.
- Consultas naturais como `qnt foi ifod esse mes`.
- Confirmação obrigatória em correspondências menos seguras.
- Preservação de categorias personalizadas desconhecidas.

## v0.5.4 - Diagnóstico seguro do Gemini

- Metadados de parse, balanceamento e término da resposta.
- Identificação de truncamento por `MAX_TOKENS`.
- Diferenciação entre JSON ausente, quebrado e schema inválido.
- Preview sanitizado somente quando explicitamente habilitado.

## v0.5.3 - Compatibilidade e extração JSON

- Uso de `responseMimeType=application/json`.
- Extração de múltiplos `parts[].text`.
- Remoção de wrappers Markdown e BOM.
- Recuperação segura do primeiro objeto JSON balanceado.
- Fallback preservado para respostas inválidas.

## v0.5.2 - Provider Gemini

- Gemini como provider alternativo.
- OpenAI mantido como opção.
- Seleção por `AI_PROVIDER`.
- Chaves e modelos separados por provider.

## v0.5.1 - Observabilidade segura da IA

- Logs técnicos com provider, modelo, status e tipo de erro.
- Redação de chaves e tokens.
- Timeout e erros de structured output identificados.
- Garantia de que não autorizados não chamam a IA.

## v0.5.0 - Interpretador seguro

- IA opcional somente para interpretação estruturada.
- JSON validado localmente antes de qualquer ação.
- Parser local prioritário.
- Confiança, confirmação e fallback seguro.
- Beta fechado preservado.

## Base técnica 3.0.0

- SQLite, migrations e backups.
- Painel administrativo.
- Exportações CSV/XLSX.
- Metas, histórico, resumo e fechamento.
- PM2, logs, rate limiting e testes automatizados.
