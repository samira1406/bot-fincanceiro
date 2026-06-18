/**
 * @fileoverview Formatadores de saída para mensagens WhatsApp.
 * Nenhuma lógica de negócio — apenas apresentação.
 */

/**
 * Formata um número como moeda brasileira.
 * @param {number} valor
 * @returns {string}
 */
import { normalizarNomeUsuario } from "./validators.js"

export function fmtValor(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formata uma lista de lançamentos em texto numerado.
 * @param {object[]} lancamentos
 * @returns {string}
 */
export function fmtLista(lancamentos) {
  if (!lancamentos.length) return "_Nenhum lançamento._"
  return lancamentos
    .map((l, i) => `${i + 1}. ${fmtDescricaoLancamento(l.nome)} (${fmtCategoriaAmigavel(l.categoria)}) — R$ ${fmtValor(l.valor)}`)
    .join("\n")
}

/**
 * Formata agrupamento de gastos por categoria.
 * @param {{ categoria:string, total:number }[]} grupos
 * @returns {string}
 */
export function fmtCategorias(grupos) {
  if (!grupos.length) return "_Nenhum gasto registrado._"
  return grupos
    .map((g, i) => `${i + 1}. ${fmtCategoriaAmigavel(g.categoria)} — R$ ${fmtValor(g.total)}`)
    .join("\n")
}

/**
 * Converte o tipo interno para o texto exibido ao usuário.
 * @param {"entrada"|"gasto"} tipo
 * @returns {string}
 */
export function fmtTipoLancamento(tipo) {
  return tipo === "entrada" ? "Receita" : "Despesa"
}

/**
 * Capitaliza nomes curtos exibidos em respostas do bot.
 * @param {string} texto
 * @returns {string}
 */
export function fmtCapitalizado(texto) {
  if (!texto) return ""
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Mensagem principal de ajuda para usuários beta.
 * @returns {string}
 */
/**
 * Retorna um nome seguro para exibição, ou null quando o nome salvo parece comando.
 * @param {object|string|null|undefined} usuarioOuNome
 * @returns {string|null}
 */
export function obterNomeExibicaoUsuario(usuarioOuNome) {
  const nome = typeof usuarioOuNome === "string"
    ? usuarioOuNome
    : usuarioOuNome?.nome
  return normalizarNomeUsuario(nome)
}

/**
 * Formata o título do resumo mensal sem usar nomes contaminados.
 * @param {object|string|null|undefined} usuarioOuNome
 * @returns {string}
 */
export function fmtTituloResumo(usuarioOuNome) {
  const nome = obterNomeExibicaoUsuario(usuarioOuNome)
  return nome ? `💡 *RESUMO — ${nome.toUpperCase()}*` : "💡 *RESUMO DO MÊS*"
}

export function fmtAjuda() {
  return `📋 *MENU DO BOT FINANÇAS*

Você não precisa decorar comandos.
Pode escrever de forma natural.

1. 💸 *Registrar gasto*
   Envie algo como:
   mercado 35
   gastei 35 no mercado
   paguei 50 internet
   uber 12,50

2. 💰 *Registrar entrada*
   Envie algo como:
   recebi 2500 salario
   recebi 1250 em freelance
   pix 200
   recebi 1250 em comissão

3. 📊 *Ver resumo*
   Mostra entradas, gastos e saldo do mês.
   Comando: resumo

4. 🧾 *Ver histórico*
   Mostra os últimos lançamentos.
   Comando: historico

5. 📁 *Exportar planilha*
   Gera um Excel com lançamentos e resumo.
   Comandos: planilha ou exportar planilha

6. 🎯 *Metas por categoria*
   Define um limite de gasto.
   Exemplo: meta mercado 600

7. ✏️ *Corrigir ou excluir*
   Ajusta ou remove lançamentos recentes.
   Exemplos:
   editar lançamento
   corrigir ultimo para 45
   alterar ultimo para 45
   excluir lançamento
   excluir ultimo

8. 🧪 *Testes seguros*
   criar dados de teste
   limpar meus dados

Se eu ficar em dúvida, vou perguntar antes de registrar.
Para exemplos rápidos, mande: exemplos`
}

export function fmtMenuPrincipalTexto(nome) {
  const saudacao = nome ? `👋 Oi, ${nome}!\n\n` : ""
  return `${saudacao}💰 *MENU DO BOT FINANÇAS*

Responda com o número da opção:

1. 💸 Registrar gasto
2. 💰 Registrar entrada
3. 📊 Ver resumo
4. 🧾 Ver histórico
5. 📁 Exportar planilha
6. 🎯 Metas
7. 📋 Ajuda completa

Você também pode mandar direto:
mercado 35
gastei 35 no mercado
recebi 2500 salario
planilha
exportar planilha
resumo

Atalhos:
saldo = resumo
extrato = histórico
planilha = gerar Excel
csv = gerar CSV`
}

export function fmtMenuMetasTexto() {
  return `🎯 *MENU DE METAS*

Responda com o número da opção:

1. Criar meta
2. Ver metas
3. Voltar ao menu

Exemplo direto:
meta mercado 600`
}

export function fmtOrientacaoGasto() {
  return `💸 *Qual gasto você quer registrar?*

Exemplos:
mercado 35
uber 12,50
paguei 50 internet`
}

export function fmtOrientacaoEntrada() {
  return `💰 *Qual entrada você quer registrar?*

Exemplos:
recebi 2500 salario
pix 200
comissão 1250`
}

export function fmtOrientacaoMeta() {
  return `🎯 *Qual meta você quer criar?*

Envie a categoria e o valor.
Exemplo:
meta mercado 600`
}

export function fmtExemplosRapidos() {
  return `Exemplos rápidos:

💸 Gastos:
mercado 35
paguei 50 internet
uber 12,50

💰 Entradas:
recebi 2500 salario
pix 200
recebi 1250 em comissão

📊 Consultas:
resumo
extrato
planilha`
}

export function fmtFallbackMenuInterativo() {
  return `Se o menu interativo não abrir, responda:
menu texto

Você também pode usar:
3 - resumo
5 - planilha`
}

/**
 * Mensagem curta de boas-vindas para primeiro contato.
 * @returns {string}
 */
export function fmtBoasVindas() {
  return `👋 Oi! Eu sou seu assistente financeiro pelo WhatsApp.

Eu posso te ajudar a registrar gastos, entradas, metas e gerar sua planilha. 📊

Antes de começar, como você gostaria que eu te chamasse?

Exemplo:
Sadu`
}

/**
 * Confirma o nome salvo e mostra os primeiros exemplos.
 * @param {string} nome
 * @returns {string}
 */
export function fmtNomeSalvo(nome) {
  const nomeExibicao = obterNomeExibicaoUsuario(nome) ?? "Usuário"
  return `Perfeito, ${nomeExibicao}! ✅

Agora você já pode me mandar mensagens como:
💸 gastei 35 no mercado
💰 recebi 2500 salario
📊 resumo
🎯 meta mercado 600
📁 exportar planilha

Se quiser ver todos os comandos, mande:
ajuda`
}

/**
 * Cumprimenta um usuário que já possui nome válido.
 * @param {string|object} usuarioOuNome
 * @returns {string}
 */
export function fmtSaudacaoUsuario(usuarioOuNome) {
  const nome = obterNomeExibicaoUsuario(usuarioOuNome)
  if (!nome) return fmtBoasVindas()

  return `👋 Oi, ${nome}! Como posso te ajudar hoje?

Você pode mandar:
💸 gastei 35 no mercado
💰 recebi 2500 salario
📊 resumo

Para ver todos os comandos, mande:
ajuda`
}

/**
 * Pede novamente um nome quando a resposta parece comando ou lançamento.
 * @returns {string}
 */
export function fmtNomeInvalido() {
  return `Hmm, isso parece mais um comando do que um nome. 🙂

Como você gostaria que eu te chamasse?

Exemplo:
Sadu`
}

export function fmtNomeNecessarioAntes() {
  return `Antes de continuar, preciso saber como posso te chamar. 🙂

Exemplo:
Sadu`
}

export function fmtNomeAtualizado(nome) {
  return `Pronto, vou te chamar de ${nome} a partir de agora.`
}

export function fmtComandoBloqueadoPorPendencia() {
  return `Você tem um lançamento pendente. Mande cancelar para sair dele antes de continuar.`
}

export function fmtCancelamentoTotal() {
  return "Cancelei as ações pendentes. Nenhum dado foi apagado."
}

/**
 * Mensagem para quando o bot não entende o texto recebido.
 * @returns {string}
 */
export function formatarMensagemNaoEntendida(contexto = {}) {
  const nome = obterNomeExibicaoUsuario(contexto.nome)
  const motivo = contexto.motivo ?? "desconhecido_total"

  if (motivo === "categoria_sem_valor") {
    const categoria = fmtCategoriaAmigavel(contexto.categoria)
    const inicio = nome ? `${nome}, entendi` : "Entendi"
    return `${inicio} a categoria ${categoria}, mas faltou o valor. 🙂

Tente assim:
${String(contexto.categoria).replace(/-/g, " ")} 35
gastei 35 no ${String(contexto.categoria).replace(/-/g, " ")}

Ou mande menu para ver as opções.`
  }

  if (motivo === "valor_com_descricao_ambigua") {
    const descricao = String(contexto.descricao ?? "").replace(/-/g, " ")
    const inicio = nome ? `${nome}, entendi` : "Entendi"
    return `${inicio} o valor R$ ${fmtValor(contexto.valor)} e a descrição “${descricao}”, mas fiquei em dúvida no tipo. 🙂

É:
1 - Entrada
2 - Gasto

Ou mande completo:
recebi ${fmtValor(contexto.valor)} ${descricao}
gastei ${fmtValor(contexto.valor)} ${descricao}`
  }

  if (motivo === "comando_com_typo") {
    const inicio = nome ? `${nome}, acho` : "Acho"
    return `${inicio} que você quis dizer “${contexto.comandoSugerido}”. 🙂

Envie:
${contexto.comandoSugerido}

Ou mande menu para ver as opções.`
  }

  if (motivo === "agradecimento") {
    return `Por nada! 🙂

Quando quiser, é só mandar:
mercado 35
recebi 2500 salario
resumo`
  }

  if (motivo === "pendencia_incompleta") {
    const pendencia = contexto.pendencia ?? {}
    const tipo = pendencia.tipo === "entrada" ? "entrada" : "gasto"

    if (pendencia.etapa === "categoria") {
      return `Você ainda tem um lançamento pendente: ${tipo} de R$ ${fmtValor(pendencia.valor)}. 🙂

Para concluir, envie apenas a categoria:
mercado
aluguel
internet

Ou mande cancelar para começar outro lançamento.`
    }

    return `Ainda preciso saber se o valor R$ ${fmtValor(pendencia.valor)} é entrada ou gasto. 🙂

Responda:
1 - Entrada
2 - Gasto

Ou mande cancelar para desistir.`
  }

  const inicio = nome ? `${nome}, ainda` : "Hmm, ainda"
  return `${inicio} não entendi direitinho. 🙂

Você pode mandar:
mercado 35
recebi 2500 salario
resumo
planilha

Ou mande menu para ver as opções.`
}

export function fmtMensagemNaoEntendida(contexto = {}) {
  return formatarMensagemNaoEntendida(contexto)
}

/**
 * Orienta o usuário quando a mensagem contém apenas um valor.
 * @param {number} valor
 * @returns {string}
 */
export function fmtValorAmbiguo(valor) {
  return `Entendi o valor R$ ${fmtValor(valor)}, mas preciso saber se é entrada ou gasto. 🙂

Responda:
1 - Entrada
2 - Gasto

Ou mande completo, por exemplo:
recebi ${fmtValor(valor)} freelance
gastei ${fmtValor(valor)} aluguel`
}

/**
 * Pede categoria ou descrição depois que o usuário escolhe o tipo.
 * @param {"entrada"|"gasto"} tipo
 * @returns {string}
 */
export function fmtCategoriaPendente(tipo) {
  if (tipo === "entrada") {
    return `Certo, vou registrar como entrada. Qual categoria ou descrição?

Exemplos:
salario
freelance
pix`
  }

  return `Certo, vou registrar como gasto. Qual categoria ou descrição?

Exemplos:
mercado
aluguel
internet`
}

/**
 * Confirma o cancelamento de um lançamento pendente.
 * @returns {string}
 */
export function fmtPendenciaCancelada() {
  return "Tudo bem, cancelei esse lançamento. Nenhum valor foi registrado."
}

/**
 * Formata a confirmacao de despesa usando apenas os dados do lancamento atual.
 * @param {{ valor:number, categoria:string }} lancamento
 * @returns {string}
 */
export function fmtConfirmacaoDespesa({ valor, categoria }) {
  return `Despesa registrada: R$ ${fmtValor(valor)} em ${fmtCategoriaAmigavel(categoria)}.`
}

/**
 * Formata a confirmacao de receita usando apenas os dados do lancamento atual.
 * @param {{ valor:number, categoria:string }} lancamento
 * @returns {string}
 */
export function fmtConfirmacaoReceita({ valor, categoria }) {
  return `Receita registrada: R$ ${fmtValor(valor)} em ${fmtCategoriaAmigavel(categoria)}.`
}

/**
 * Mensagem para contatos bloqueados no beta fechado.
 * @returns {string}
 */
export function fmtBetaFechado() {
  return `Este bot está em beta fechado no momento.

Se você recebeu um convite para testar, entre em contato com a equipe para liberar seu número.`
}

const categoriasAmigaveis = {
  alimentacao: "Alimentação",
  farmacia:    "Farmácia",
  salario:     "Salário",
  mercado:     "Mercado",
  transporte:  "Transporte",
  geral:       "Geral",
  pix:         "Pix",
  freela:      "Freela",
  comissao:    "Comissão",
  deposito:    "Depósito",
  bonus:       "Bônus",
  extra:       "Extra",
  receita:     "Receita",
  entrada:     "Entrada",
  internet:    "Internet",
  aluguel:     "Aluguel",
  poupanca:    "Poupança",
  moradia:     "Moradia",
  saude:       "Saúde",
  pets:        "Pets",
  lazer:       "Lazer",
  assinaturas: "Assinaturas",
  freelance:   "Freelance",
  servico:     "Serviço",
}

const descricoesAmigaveis = {
  salario: "salário",
}

function chaveAmigavel(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Formata categorias internas normalizadas para exibição amigável.
 * @param {string} categoria
 * @returns {string}
 */
export function fmtCategoriaAmigavel(categoria) {
  const chave = chaveAmigavel(categoria)
  if (!chave) return ""
  return categoriasAmigaveis[chave] ?? String(categoria)
    .trim()
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map(fmtCapitalizado)
    .join(" ")
}

/**
 * Formata a descrição curta de um lançamento sem alterar o dado salvo.
 * @param {string} descricao
 * @returns {string}
 */
export function fmtDescricaoLancamento(descricao) {
  const chave = chaveAmigavel(descricao)
  if (!chave) return ""
  return descricoesAmigaveis[chave] ?? String(descricao).trim()
}

function fmtDataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

function inicioDia(data) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Exibe hoje, ontem ou uma data curta para os fluxos de edição.
 * @param {number} timestamp
 * @param {Date} [agora]
 * @returns {string}
 */
export function fmtDataLancamentoEdicao(timestamp, agora = new Date()) {
  const diaLancamento = inicioDia(timestamp)
  const hoje = inicioDia(agora)
  if (diaLancamento === hoje) return "hoje"

  const ontem = new Date(hoje)
  ontem.setDate(ontem.getDate() - 1)
  if (diaLancamento === ontem.getTime()) return "ontem"

  return fmtDataCurta(timestamp)
}

/**
 * Resume um lançamento para seleção e confirmação.
 * @param {object} lancamento
 * @param {Date} [agora]
 * @returns {string}
 */
export function fmtResumoLancamentoEdicao(lancamento, agora = new Date()) {
  const tipo = lancamento.tipo === "entrada" ? "Entrada" : "Gasto"
  return `${tipo} - R$ ${fmtValor(lancamento.valor)} - ` +
    `${fmtCategoriaAmigavel(lancamento.categoria)} - ` +
    `${fmtDataLancamentoEdicao(lancamento.criado_em, agora)}`
}

/**
 * Lista lançamentos recentes para editar ou excluir.
 * @param {object[]} lancamentos
 * @param {"editar"|"excluir"} [modo]
 * @returns {string}
 */
export function fmtListaLancamentosEdicao(lancamentos, modo = "editar") {
  if (!lancamentos.length) {
    return "Você ainda não tem lançamentos para editar."
  }

  const linhas = lancamentos.map((item, indice) =>
    `${indice + 1}. ${fmtResumoLancamentoEdicao(item)}`
  )
  const acao = modo === "excluir" ? "excluir" : "editar"

  return `Escolha qual lançamento quer ${acao}:\n\n${linhas.join("\n")}\n\n` +
    "Responda com o número do lançamento.\nOu mande cancelar."
}

/**
 * Mostra os campos editáveis de um lançamento selecionado.
 * @param {object} lancamento
 * @returns {string}
 */
export function fmtMenuEdicaoLancamento(lancamento) {
  return `Você escolheu:\n${fmtResumoLancamentoEdicao(lancamento)}\n\n` +
    `O que deseja fazer?\n` +
    `1 - Corrigir valor\n` +
    `2 - Corrigir categoria\n` +
    `3 - Corrigir tipo\n` +
    `4 - Corrigir descrição\n` +
    `5 - Corrigir data\n` +
    `6 - Excluir\n` +
    `7 - Cancelar`
}

/**
 * Confirma visualmente o item antes da exclusão.
 * @param {object} lancamento
 * @returns {string}
 */
export function fmtConfirmacaoExclusaoLancamento(lancamento) {
  return `Tem certeza que deseja excluir?\n${fmtResumoLancamentoEdicao(lancamento)}\n\n` +
    `Responda:\n1 - Sim, excluir\n2 - Cancelar`
}

/**
 * Formata os últimos lançamentos de um usuário.
 * @param {object[]} lancamentos
 * @returns {string}
 */
export function fmtHistoricoLancamentos(lancamentos) {
  if (!lancamentos.length) {
    return "Você ainda não tem lançamentos registrados.\nMande algo como: gastei 35 no mercado"
  }

  const linhas = lancamentos.map((l, i) =>
    `${i + 1}. ${fmtDataCurta(l.criado_em)} - ${fmtTipoLancamento(l.tipo)} - ` +
    `R$ ${fmtValor(l.valor)} - ${fmtCategoriaAmigavel(l.categoria)} - ${fmtDescricaoLancamento(l.nome)}`
  )

  return `Últimos lançamentos:\n\n${linhas.join("\n")}`
}

/**
 * Formata resposta de meta por categoria criada.
 * @param {object} meta
 * @returns {string}
 */
export function fmtMetaCategoriaCriada(meta) {
  return `Meta criada: ${fmtCategoriaAmigavel(meta.categoria)} até R$ ${fmtValor(meta.valor_limite)} neste mês.`
}

/**
 * Formata resposta de meta por categoria atualizada.
 * @param {object} meta
 * @returns {string}
 */
export function fmtMetaCategoriaAtualizada(meta) {
  return `Atualizei sua meta de ${fmtCategoriaAmigavel(meta.categoria)} para R$ ${fmtValor(meta.valor_limite)} neste mês.`
}

/**
 * Formata mensagem de ausência de metas por categoria.
 * @returns {string}
 */
export function fmtSemMetasCategoria() {
  return "Você ainda não criou metas.\nExemplo: meta mercado 600"
}

/**
 * Formata lista de metas por categoria com progresso.
 * @param {object[]} metas
 * @returns {string}
 */
export function fmtListaMetasCategoria(metas) {
  if (!metas.length) return fmtSemMetasCategoria()

  const linhas = metas.map(meta =>
    `${fmtCategoriaAmigavel(meta.categoria)}: R$ ${fmtValor(meta.gasto ?? 0)} / R$ ${fmtValor(meta.valor_limite)}`
  )

  return `Suas metas deste mês:\n\n${linhas.join("\n")}`
}

/**
 * Formata progresso de meta por categoria dentro do limite.
 * @param {object} meta
 * @param {number} gastoAtual
 * @returns {string}
 */
export function fmtProgressoMetaCategoria(meta, gastoAtual) {
  const restante = Math.max(meta.valor_limite - gastoAtual, 0)
  return `Você já usou R$ ${fmtValor(gastoAtual)} da sua meta de R$ ${fmtValor(meta.valor_limite)}.\n` +
    `Ainda restam R$ ${fmtValor(restante)}.`
}

/**
 * Formata alerta de meta por categoria ultrapassada.
 * @param {object} meta
 * @param {number} gastoAtual
 * @returns {string}
 */
export function fmtMetaCategoriaUltrapassada(meta, gastoAtual) {
  return `Atenção: você ultrapassou sua meta de ${fmtCategoriaAmigavel(meta.categoria)}.\n` +
    `Meta: R$ ${fmtValor(meta.valor_limite)}\n` +
    `Gasto atual: R$ ${fmtValor(gastoAtual)}\n` +
    `Excedente: R$ ${fmtValor(gastoAtual - meta.valor_limite)}`
}

/**
 * Formata um saldo com cor (🟢 positivo / 🔴 negativo).
 * @param {number} saldo
 * @returns {string}
 */
export function fmtSaldo(saldo) {
  const emoji = saldo >= 0 ? "🟢" : "🔴"
  const sinal = saldo >= 0 ? "+" : ""
  return `${emoji} R$ ${sinal}${fmtValor(saldo)}`
}

/**
 * Gera barra de progresso para meta.
 * @param {number} gasto
 * @param {number} meta
 * @returns {string}
 */
export function fmtBarraMeta(gasto, meta) {
  const pct    = Math.min(Math.round((gasto / meta) * 100), 100)
  const blocos = Math.round(pct / 10)
  const barra  = "█".repeat(blocos) + "░".repeat(10 - blocos)
  return `${barra} ${pct}%`
}

/**
 * Monta o relatório mensal completo de um usuário.
 * @param {string} nome
 * @param {object[]} entradas
 * @param {object[]} gastos
 * @param {number|null} meta
 * @returns {{ texto:string, saldo:number, totalE:number, totalG:number }}
 */
export function fmtRelatorioMensal(nome, entradas, gastos, meta) {
  const totalE = entradas.reduce((s, l) => s + l.valor, 0)
  const totalG = gastos.reduce((s, l) => s + l.valor, 0)
  const saldo  = totalE - totalG
  const nomeExibicao = obterNomeExibicaoUsuario(nome)
  const titulo = nomeExibicao
    ? `📊 *RELATÓRIO MENSAL — ${nomeExibicao.toUpperCase()}*`
    : "📊 *RESUMO DO MÊS*"

  let texto =
`${titulo}

💰 *ENTRADAS*
${fmtLista(entradas)}
Total: R$ ${fmtValor(totalE)}

💸 *GASTOS*
${fmtLista(gastos)}
Total: R$ ${fmtValor(totalG)}

🧾 *SALDO DO MÊS*
${fmtSaldo(saldo)}`

  if (meta) {
    const status = totalG > meta
      ? `⚠️ Meta de R$ ${fmtValor(meta)} *ultrapassada* em R$ ${fmtValor(totalG - meta)}`
      : `✅ Dentro da meta de R$ ${fmtValor(meta)}`
    texto += `\n\n🎯 *META DO MÊS*\n${fmtBarraMeta(totalG, meta)}\n${status}`
  }

  return { texto, saldo, totalE, totalG }
}

/**
 * Monta o relatório geral do grupo.
 * @param {{ nome:string, totalE:number, totalG:number }[]} usuarios
 * @returns {{ resumo:string, ranking:string }}
 */
export function fmtRelatorioGeral(usuarios) {
  let totalEntradasGeral = 0
  let totalGastosGeral   = 0
  let textoPessoas       = ""
  const ranking          = []

  for (const { nome, totalE, totalG } of usuarios) {
    const nomeExibicao = obterNomeExibicaoUsuario(nome) ?? "Usuário"
    const saldo = totalE - totalG
    totalEntradasGeral += totalE
    totalGastosGeral   += totalG
    ranking.push({ nome: nomeExibicao, totalG })
    textoPessoas += `👤 *${nomeExibicao}*\nEntradas: R$ ${fmtValor(totalE)} | Gastos: R$ ${fmtValor(totalG)} | Saldo: ${fmtSaldo(saldo)}\n\n`
  }

  ranking.sort((a, b) => b.totalG - a.totalG)

  const saldoGeral    = totalEntradasGeral - totalGastosGeral
  const rankingTexto  = ranking.length
    ? ranking.map((r, i) => `${i + 1}. ${r.nome} — R$ ${fmtValor(r.totalG)}`).join("\n")
    : "_Nenhum gasto registrado._"

  return {
    resumo:
`📊 *RELATÓRIO GERAL DO MÊS*

💰 Total entradas: R$ ${fmtValor(totalEntradasGeral)}
💸 Total gastos:   R$ ${fmtValor(totalGastosGeral)}
🧾 Saldo geral:    ${fmtSaldo(saldoGeral)}

${textoPessoas.trim()}`,
    ranking:
`🏆 *QUEM MAIS GASTOU NO MÊS*

${rankingTexto}`,
  }
}
