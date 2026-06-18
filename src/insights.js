import {
  fmtCategoriaAmigavel,
  fmtSaldo,
  fmtValor,
} from "./formatters.js"
import { normalizarCategoriaPorPalavraChave } from "./categoryRules.js"

const MESES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
]

function agruparCategorias(lancamentos) {
  const totais = new Map()
  for (const item of lancamentos) {
    const categoria = normalizarCategoriaPorPalavraChave(item.categoria, "gasto")
    totais.set(categoria, (totais.get(categoria) ?? 0) + item.valor)
  }
  return [...totais.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
}

export function gerarInsightsFinanceiros(dados) {
  const insights = []
  const { entradas, gastos, saldo, categorias, metas = [] } = dados

  if (saldo > 0) insights.push("Você está positivo no mês.")
  if (saldo < 0) insights.push("Seu mês está negativo. Vale revisar os maiores gastos.")
  if (!gastos) insights.push("Você ainda não registrou gastos neste período.")
  if (!entradas) insights.push("Você ainda não registrou entradas neste período.")

  const principal = categorias[0]
  if (principal && gastos > 0) {
    const percentual = Math.round((principal.total / gastos) * 100)
    if (percentual > 30) {
      insights.push(`${fmtCategoriaAmigavel(principal.categoria)} representa ${percentual}% dos seus gastos do mês.`)
    }
  }

  for (const meta of metas) {
    const categoriaMeta = normalizarCategoriaPorPalavraChave(meta.categoria, "gasto")
    const categoria = categorias.find(item => item.categoria === categoriaMeta)
    if (!categoria || !meta.valor_limite) continue
    const percentual = Math.round((categoria.total / meta.valor_limite) * 100)
    if (percentual >= 80) {
      insights.push(`Você já usou ${percentual}% da meta de ${fmtCategoriaAmigavel(categoriaMeta)}.`)
    }
  }

  if (!insights.length) {
    insights.push("Ainda preciso de mais lançamentos para analisar melhor.")
  }

  return insights
}

export function gerarFechamentoMensal({ lancamentos, metas = [], agora = new Date() }) {
  const entradasLanc = lancamentos.filter(item => item.tipo === "entrada")
  const gastosLanc = lancamentos.filter(item => item.tipo === "gasto")
  const entradas = entradasLanc.reduce((soma, item) => soma + item.valor, 0)
  const gastos = gastosLanc.reduce((soma, item) => soma + item.valor, 0)
  const categorias = agruparCategorias(gastosLanc)
  const maiorLancamento = [...gastosLanc].sort((a, b) => b.valor - a.valor)[0] ?? null
  const saldo = entradas - gastos
  const insights = gerarInsightsFinanceiros({
    entradas,
    gastos,
    saldo,
    categorias,
    metas,
  })

  return {
    mesNome: MESES[agora.getMonth()],
    entradas,
    gastos,
    saldo,
    categorias: categorias.slice(0, 3),
    maiorLancamento,
    pontoAtencao: categorias[0] ?? null,
    insights,
  }
}

function fmtDataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

export function formatarFechamentoMensal(resultado) {
  if (!resultado.entradas && !resultado.gastos) {
    return `Ainda não encontrei lançamentos para esse período.

Você pode registrar algo assim:
mercado 35
recebi 2500 salario`
  }

  const categorias = resultado.categorias.length
    ? resultado.categorias.map((item, indice) =>
        `${indice + 1}. ${fmtCategoriaAmigavel(item.categoria)}: R$ ${fmtValor(item.total)}`
      ).join("\n")
    : "_Nenhum gasto registrado._"

  const maior = resultado.maiorLancamento
    ? `${fmtCategoriaAmigavel(resultado.maiorLancamento.categoria)} - ` +
      `R$ ${fmtValor(resultado.maiorLancamento.valor)} em ${fmtDataCurta(resultado.maiorLancamento.criado_em)}`
    : "Nenhum gasto registrado."

  const pontoAtencao = resultado.categorias[0]
  const sugestao = pontoAtencao
    ? `Defina ou revise uma meta para ${fmtCategoriaAmigavel(pontoAtencao.categoria)} no próximo mês.`
    : "Continue registrando suas movimentações para receber sugestões melhores."

  const atencao = resultado.pontoAtencao
    ? `\n\n*Ponto de atenção:*\nSeu maior ponto de atenção foi ${fmtCategoriaAmigavel(resultado.pontoAtencao.categoria)}.`
    : ""

  return `📊 *FECHAMENTO DO MÊS - ${resultado.mesNome}*

Entradas: R$ ${fmtValor(resultado.entradas)}
Gastos: R$ ${fmtValor(resultado.gastos)}
Saldo: ${fmtSaldo(resultado.saldo)}

*Maiores gastos:*
${categorias}

*Maior lançamento:*
${maior}

*Leitura rápida:*
${resultado.insights.join("\n")}${atencao}

*Sugestão:*
${sugestao}`
}
