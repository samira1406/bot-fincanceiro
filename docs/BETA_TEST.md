# Roteiro de beta test

Use dados fictícios. Nunca envie nome completo, telefone de terceiros, dados
bancários, documentos, chaves ou informações financeiras reais.

## Preparação do operador

- [ ] Tester incluído na whitelist correta.
- [ ] `BETA_MODE=true`.
- [ ] `BETA_BLOCKED_REPLY=false`.
- [ ] `BETA_DEBUG_SHOW_RAW=false`.
- [ ] `AI_LOG_RAW=false`.
- [ ] Banco e backup disponíveis.
- [ ] Versão e horário do teste registrados.

## Roteiro básico

### 1. Onboarding

```text
oi
```

Esperado:

- solicita nome;
- não salva comandos como nome;
- passa a usar o nome informado.

### 2. Gastos e entradas

```text
mercado 35
recebi 1250 freelance
paguei 50 internet
```

Esperado:

- registra os valores e tipos corretos;
- apresenta categorias amigáveis;
- não mistura dados entre usuários.

### 3. Valor ambíguo

```text
1250
2
mercado
```

Esperado:

- `1250` não é registrado imediatamente;
- `2` escolhe gasto e não vira R$ 2,00;
- o valor original é preservado;
- `cancelar` encerra o fluxo sem gravação.

### 4. Consultas

```text
saldo
resumo
extrato
quanto gastei com mercado?
onde gastei mais?
fechamento
```

Esperado:

- nenhuma consulta cria lançamento;
- período e categoria são respeitados;
- ausência de dados produz orientação amigável.

### 5. Metas e exportação

```text
meta mercado 600
metas
planilha
exportar csv
```

Esperado:

- meta é criada para o usuário atual;
- CSV e XLSX não incluem dados de outro usuário;
- nomes de arquivos não expõem telefone completo.

### 6. IA interpretadora

Execute somente se o provider estiver habilitado:

```text
gstei 35 no mercd
receebi 1250 de frila
qnt foi ifod esse mes
gastei uns 47 conto no ifodi ontem
```

Esperado:

- `Mercd` vira Mercado;
- `Frila` vira Freelance;
- consulta de Ifood usa o mês atual;
- a frase com `uns` pede confirmação;
- a confirmação mostra Ifood, não Ifodi;
- nenhum conteúdo bruto aparece no log.

### 7. Confirmação pendente

Depois de gerar uma confirmação, envie:

```text
1250
```

Esperado:

- o novo comando não é executado;
- o bot pede `1`, `2` ou `cancelar`;
- após cancelar, uma nova mensagem pode ser enviada.

### 8. Segurança do beta

De um contato não autorizado, envie:

```text
ajuda
mercado 35
planilha
```

Esperado com `BETA_BLOCKED_REPLY=false`:

- nenhuma resposta;
- nenhum cadastro;
- nenhum lançamento;
- nenhuma chamada à IA;
- nenhuma exportação.

## Feedback e bug report

Use os fluxos de feedback do próprio bot quando disponíveis. Em uma issue,
informe somente:

- versão;
- ambiente;
- passos para reproduzir;
- comportamento esperado;
- comportamento observado;
- logs sanitizados.

Nunca inclua `.env`, número real, JID completo, QR Code, token, mensagem
privada, banco ou planilha real.

## Critérios de aprovação

O ciclo é aprovado quando:

- todos os cenários obrigatórios funcionam;
- não há gravação sem confirmação exigida;
- usuários permanecem isolados;
- não autorizados permanecem silenciosos;
- logs e exportações não expõem segredos;
- testes automatizados continuam verdes.

## Critérios de reprovação

Interrompa o beta se ocorrer:

- lançamento com valor ou tipo incorreto;
- vazamento entre usuários;
- contato não autorizado processado;
- chave, token ou mensagem privada em log;
- perda de banco ou falha de restauração;
- execução de uma ação diferente da confirmação pendente.
