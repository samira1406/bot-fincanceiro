/**
 * @fileoverview Formatadores de saída para mensagens WhatsApp.
 * Nenhuma lógica de negócio — apenas apresentação.
 */

/**
 * Formata um número como moeda brasileira.
 * @param {number} valor
 * @returns {string}
 */
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
    .map((l, i) => `${i + 1}. ${l.nome} (${l.categoria}) — R$ ${fmtValor(l.valor)}`)
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
    .map((g, i) => `${i + 1}. ${g.categoria} — R$ ${fmtValor(g.total)}`)
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

function fmtDataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
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
    `R$ ${fmtValor(l.valor)} - ${fmtCapitalizado(l.categoria)} - ${l.nome}`
  )

  return `Últimos lançamentos:\n\n${linhas.join("\n")}`
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

  let texto =
`📊 *RELATÓRIO MENSAL — ${nome.toUpperCase()}*

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
    const saldo = totalE - totalG
    totalEntradasGeral += totalE
    totalGastosGeral   += totalG
    ranking.push({ nome, totalG })
    textoPessoas += `👤 *${nome}*\nEntradas: R$ ${fmtValor(totalE)} | Gastos: R$ ${fmtValor(totalG)} | Saldo: ${fmtSaldo(saldo)}\n\n`
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
