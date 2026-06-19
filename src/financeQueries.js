import {
  normalizarCategoriaCanonica,
  normalizarCategoriaPorPalavraChave,
} from "./categoryRules.js"
import {
  fmtCategoriaAmigavel,
  fmtDescricaoLancamento,
  fmtSaldo,
  fmtValor,
} from "./formatters.js"

function normalizarTexto(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
}

function inicioDoDia(data) {
  const d = new Date(data)
  d.setHours(0, 0, 0, 0)
  return d
}

function periodoMes(data, deslocamento = 0) {
  const base = new Date(data)
  const inicio = new Date(base.getFullYear(), base.getMonth() + deslocamento, 1)
  const fim = new Date(base.getFullYear(), base.getMonth() + deslocamento + 1, 1)
  return {
    tipo: deslocamento === -1 ? "mes_passado" : "mes_atual",
    label: deslocamento === -1 ? "no mês passado" : "neste mês",
    mesChave: `${inicio.getMonth() + 1}-${inicio.getFullYear()}`,
    inicio: inicio.getTime(),
    fim: fim.getTime(),
    mes: inicio.getMonth() + 1,
    ano: inicio.getFullYear(),
  }
}

function periodoSemana(data, deslocamento = 0) {
  const inicio = inicioDoDia(data)
  const dia = inicio.getDay()
  inicio.setDate(inicio.getDate() - (dia === 0 ? 6 : dia - 1) + (deslocamento * 7))
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 7)
  return {
    tipo: deslocamento === -1 ? "semana_passada" : "semana",
    label: deslocamento === -1 ? "na semana passada" : "nesta semana",
    inicio: inicio.getTime(),
    fim: fim.getTime(),
  }
}

export function periodoConsultaPorReferencia(referencia, agora = new Date()) {
  if (referencia === "mes_passado") return periodoMes(agora, -1)
  if (referencia === "semana_passada") return periodoSemana(agora, -1)
  if (referencia === "esta_semana") return periodoSemana(agora)

  if (referencia === "ultimos_7_dias") {
    const fim = new Date(agora).getTime() + 1
    const inicio = inicioDoDia(agora)
    inicio.setDate(inicio.getDate() - 6)
    return {
      tipo: "ultimos_7_dias",
      label: "nos últimos 7 dias",
      inicio: inicio.getTime(),
      fim,
    }
  }

  if (referencia === "ontem") {
    const inicio = inicioDoDia(agora)
    inicio.setDate(inicio.getDate() - 1)
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 1)
    return {
      tipo: "ontem",
      label: "ontem",
      inicio: inicio.getTime(),
      fim: fim.getTime(),
    }
  }

  if (referencia === "hoje") {
    const inicio = inicioDoDia(agora)
    const fim = new Date(inicio)
    fim.setDate(fim.getDate() + 1)
    return {
      tipo: "hoje",
      label: "hoje",
      inicio: inicio.getTime(),
      fim: fim.getTime(),
    }
  }

  return periodoMes(agora)
}

function extrairPeriodo(texto, agora) {
  const periodos = [
    {
      padrao: /\b(?:(?:no|do)\s+)?mes passado\b/u,
      criar: () => periodoMes(agora, -1),
    },
    {
      padrao: /\b(?:na\s+)?semana passada\b/u,
      criar: () => periodoSemana(agora, -1),
    },
    {
      padrao: /\b(?:nos\s+)?ultimos 7 dias\b/u,
      criar: () => {
        const fim = new Date(agora).getTime() + 1
        const inicio = inicioDoDia(agora)
        inicio.setDate(inicio.getDate() - 6)
        return {
          tipo: "ultimos_7_dias",
          label: "nos últimos 7 dias",
          inicio: inicio.getTime(),
          fim,
        }
      },
    },
    {
      padrao: /\bontem\b/u,
      criar: () => {
        const inicio = inicioDoDia(agora)
        inicio.setDate(inicio.getDate() - 1)
        const fim = new Date(inicio)
        fim.setDate(fim.getDate() + 1)
        return { tipo: "ontem", label: "ontem", inicio: inicio.getTime(), fim: fim.getTime() }
      },
    },
    {
      padrao: /\bhoje\b/u,
      criar: () => {
        const inicio = inicioDoDia(agora)
        const fim = new Date(inicio)
        fim.setDate(fim.getDate() + 1)
        return { tipo: "hoje", label: "hoje", inicio: inicio.getTime(), fim: fim.getTime() }
      },
    },
    {
      padrao: /\b(?:(?:essa|esta|nesta|nessa)\s+)?semana\b/u,
      criar: () => periodoSemana(agora),
    },
    {
      padrao: /\b(?:(?:esse|este|neste|nesse|do|no)\s+)?mes\b/u,
      criar: () => periodoMes(agora),
    },
  ]

  for (const item of periodos) {
    if (item.padrao.test(texto)) {
      return {
        periodo: item.criar(),
        textoSemPeriodo: texto.replace(item.padrao, " ").replace(/\s+/g, " ").trim(),
      }
    }
  }

  return { periodo: periodoMes(agora), textoSemPeriodo: texto }
}

function limparCategoria(texto) {
  const categoria = String(texto ?? "")
    .replace(/^(?:(?:com|no|na|em|de|do|da|por)\s+)+/u, "")
    .trim()

  return /^(?:com|no|na|em|de|do|da|por)$/u.test(categoria)
    ? ""
    : categoria
}

export function parseConsultaFinanceira(mensagem, agora = new Date()) {
  const texto = normalizarTexto(mensagem)
  if (!texto) return null

  const { periodo, textoSemPeriodo } = extrairPeriodo(texto, agora)

  if (/^(?:qual (?:e )?)?(?:o )?meu saldo$|^saldo$/u.test(textoSemPeriodo)) {
    return { tipo: "saldo", periodo }
  }

  if (/^(?:qual (?:foi )?)?(?:o )?meu maior gasto$/u.test(textoSemPeriodo)) {
    return { tipo: "maior_gasto", periodo }
  }

  if (/^(?:onde gastei mais|top categorias|meus gastos por categoria|gastos por categoria)$/u.test(textoSemPeriodo)) {
    return { tipo: "ranking_categorias", movimento: "gasto", periodo }
  }

  if (/^(?:minhas entradas por categoria|entradas por categoria)$/u.test(textoSemPeriodo)) {
    return { tipo: "ranking_categorias", movimento: "entrada", periodo }
  }

  if (/^top gastos$/u.test(textoSemPeriodo)) {
    return { tipo: "ranking_lancamentos", movimento: "gasto", periodo }
  }

  let match = textoSemPeriodo.match(/^quanto gastei(?:\s+(.+))?$/u)
  if (match) {
    const categoriaRaw = limparCategoria(match[1])
    return categoriaRaw
      ? {
          tipo: "total_categoria",
          movimento: "gasto",
          categoria: normalizarCategoriaPorPalavraChave(categoriaRaw, "gasto"),
          periodo,
        }
      : { tipo: "total_movimento", movimento: "gasto", periodo }
  }

  match = textoSemPeriodo.match(/^quanto recebi(?:\s+(.+))?$/u)
  if (match) {
    const categoriaRaw = limparCategoria(match[1])
    return categoriaRaw
      ? {
          tipo: "total_categoria",
          movimento: "entrada",
          categoria: normalizarCategoriaPorPalavraChave(categoriaRaw, "entrada"),
          periodo,
        }
      : { tipo: "total_movimento", movimento: "entrada", periodo }
  }

  if (/^(?:quanto|qual|onde|top|gastos|entradas)\b/u.test(texto)) {
    return { tipo: "vaga", periodo }
  }

  return null
}

export function criarConsultaFinanceiraEstruturada(
  { intent, metric, category = null, period = null },
  agora = new Date()
) {
  const periodo = periodoConsultaPorReferencia(period ?? "este_mes", agora)

  if (intent === "consultar_saldo" && metric === "saldo") {
    return { tipo: "saldo", periodo }
  }

  const movimento = intent === "consultar_receitas" ? "entrada" : "gasto"
  if (metric === "maior_gasto" && movimento === "gasto") {
    return { tipo: "maior_gasto", periodo }
  }
  if (metric === "top_categorias") {
    return { tipo: "ranking_categorias", movimento, periodo }
  }
  if (metric === "gastos" || metric === "receitas") {
    if (category) {
      return {
        tipo: "total_categoria",
        movimento,
        categoria: normalizarCategoriaPorPalavraChave(category, movimento),
        periodo,
      }
    }
    return { tipo: "total_movimento", movimento, periodo }
  }

  return null
}

function buscarLancamentos(db, usuarioId, periodo) {
  if (periodo.mesChave) {
    return db.prepare(`
      SELECT * FROM lancamentos
      WHERE usuario_id = ? AND mes = ?
      ORDER BY criado_em DESC, id DESC
    `).all(usuarioId, periodo.mesChave)
  }

  return db.prepare(`
    SELECT * FROM lancamentos
    WHERE usuario_id = ? AND criado_em >= ? AND criado_em < ?
    ORDER BY criado_em DESC, id DESC
  `).all(usuarioId, periodo.inicio, periodo.fim)
}

function categoriaCanonicaLancamento(lancamento, movimento) {
  const porDescricao = normalizarCategoriaCanonica(
    lancamento.nome,
    { tipo: movimento }
  )
  if (porDescricao.source !== "unknown") return porDescricao.category
  return normalizarCategoriaPorPalavraChave(
    lancamento.categoria,
    movimento
  )
}

function agruparCategorias(lancamentos, movimento) {
  const totais = new Map()
  for (const lancamento of lancamentos) {
    const categoria = categoriaCanonicaLancamento(lancamento, movimento)
    totais.set(
      categoria,
      (totais.get(categoria) ?? 0) + lancamento.valor
    )
  }
  return [...totais.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
}

export function executarConsultaFinanceira(db, usuarioId, consulta) {
  const todos = buscarLancamentos(db, usuarioId, consulta.periodo)
  const doTipo = consulta.movimento
    ? todos.filter(item => item.tipo === consulta.movimento)
    : todos

  if (consulta.tipo === "vaga") {
    return { ...consulta, status: "vaga" }
  }

  if (consulta.tipo === "saldo") {
    const entradas = todos.filter(item => item.tipo === "entrada")
      .reduce((soma, item) => soma + item.valor, 0)
    const gastos = todos.filter(item => item.tipo === "gasto")
      .reduce((soma, item) => soma + item.valor, 0)
    return { ...consulta, status: todos.length ? "ok" : "sem_dados", entradas, gastos, saldo: entradas - gastos }
  }

  if (consulta.tipo === "total_categoria") {
    const filtrados = doTipo.filter(item =>
      categoriaCanonicaLancamento(item, consulta.movimento) ===
        consulta.categoria
    )
    return {
      ...consulta,
      status: filtrados.length ? "ok" : "categoria_sem_dados",
      total: filtrados.reduce((soma, item) => soma + item.valor, 0),
      quantidade: filtrados.length,
    }
  }

  if (consulta.tipo === "total_movimento") {
    return {
      ...consulta,
      status: doTipo.length ? "ok" : "sem_dados",
      total: doTipo.reduce((soma, item) => soma + item.valor, 0),
      quantidade: doTipo.length,
    }
  }

  if (consulta.tipo === "maior_gasto") {
    const gastos = todos.filter(item => item.tipo === "gasto")
    return {
      ...consulta,
      status: gastos.length ? "ok" : "sem_dados",
      lancamento: gastos.sort((a, b) => b.valor - a.valor)[0] ?? null,
    }
  }

  if (consulta.tipo === "ranking_categorias") {
    const ranking = agruparCategorias(doTipo, consulta.movimento).slice(0, 5)
    return { ...consulta, status: ranking.length ? "ok" : "sem_dados", ranking }
  }

  if (consulta.tipo === "ranking_lancamentos") {
    const ranking = [...doTipo].sort((a, b) => b.valor - a.valor).slice(0, 5)
    return { ...consulta, status: ranking.length ? "ok" : "sem_dados", ranking }
  }

  return { ...consulta, status: "vaga" }
}

function fmtDataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

function mensagemSemDados() {
  return `Ainda não encontrei lançamentos para esse período.

Você pode registrar algo assim:
mercado 35
recebi 2500 salario`
}

export function formatarRespostaConsulta(resultado) {
  if (resultado.status === "vaga") {
    return `Posso te ajudar com consultas como:
quanto gastei com mercado?
qual meu maior gasto?
onde gastei mais?
fechamento`
  }

  if (resultado.status === "categoria_sem_dados") {
    const acao = resultado.movimento === "entrada" ? "entradas de" : "gastos em"
    return `Não encontrei ${acao} ${fmtCategoriaAmigavel(resultado.categoria)} ${resultado.periodo.label}.`
  }

  if (resultado.status === "sem_dados") return mensagemSemDados()

  if (resultado.tipo === "saldo") {
    return `Seu saldo ${resultado.periodo.label} é ${fmtSaldo(resultado.saldo)}.

Entradas: R$ ${fmtValor(resultado.entradas)}
Gastos: R$ ${fmtValor(resultado.gastos)}`
  }

  if (resultado.tipo === "total_categoria") {
    const categoria = fmtCategoriaAmigavel(resultado.categoria)
    return resultado.movimento === "entrada"
      ? `Você recebeu R$ ${fmtValor(resultado.total)} em ${categoria} ${resultado.periodo.label}.`
      : `Você gastou R$ ${fmtValor(resultado.total)} em ${categoria} ${resultado.periodo.label}.`
  }

  if (resultado.tipo === "total_movimento") {
    return resultado.movimento === "entrada"
      ? `Você recebeu R$ ${fmtValor(resultado.total)} ${resultado.periodo.label}.`
      : `Você gastou R$ ${fmtValor(resultado.total)} ${resultado.periodo.label}.`
  }

  if (resultado.tipo === "maior_gasto") {
    const item = resultado.lancamento
    return `Seu maior gasto ${resultado.periodo.label} foi:
💸 ${fmtCategoriaAmigavel(item.categoria)} - R$ ${fmtValor(item.valor)} em ${fmtDataCurta(item.criado_em)}.`
  }

  if (resultado.tipo === "ranking_categorias") {
    const titulo = resultado.movimento === "entrada"
      ? `Suas maiores categorias de entrada ${resultado.periodo.label}:`
      : `Suas maiores categorias de gasto ${resultado.periodo.label}:`
    const linhas = resultado.ranking.map((item, indice) =>
      `${indice + 1}. ${fmtCategoriaAmigavel(item.categoria)}: R$ ${fmtValor(item.total)}`
    )
    return `${titulo}\n\n${linhas.join("\n")}`
  }

  if (resultado.tipo === "ranking_lancamentos") {
    const linhas = resultado.ranking.map((item, indice) =>
      `${indice + 1}. ${fmtDescricaoLancamento(item.nome)} - R$ ${fmtValor(item.valor)}`
    )
    return `Seus maiores gastos ${resultado.periodo.label}:\n\n${linhas.join("\n")}`
  }

  return mensagemSemDados()
}
