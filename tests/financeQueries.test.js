import { describe, expect, it, vi } from "vitest"
import {
  executarConsultaFinanceira,
  formatarRespostaConsulta,
  parseConsultaFinanceira,
} from "../src/financeQueries.js"

const AGORA = new Date("2026-06-18T12:00:00-03:00")

function bancoCom(lancamentos) {
  const all = vi.fn(() => lancamentos)
  return {
    db: { prepare: vi.fn(() => ({ all })) },
    all,
  }
}

describe("parseConsultaFinanceira", () => {
  it.each([
    ["quanto gastei com mercado?", "total_categoria", "gasto", "mercado"],
    ["quanto gastei no mercado esse mês?", "total_categoria", "gasto", "mercado"],
    ["quanto recebi de freelance?", "total_categoria", "entrada", "freelance"],
    ["quanto gastei hoje?", "total_movimento", "gasto", undefined],
    ["qual meu maior gasto?", "maior_gasto", undefined, undefined],
    ["onde gastei mais?", "ranking_categorias", "gasto", undefined],
    ["top categorias", "ranking_categorias", "gasto", undefined],
    ["top gastos", "ranking_lancamentos", "gasto", undefined],
    ["meus gastos por categoria", "ranking_categorias", "gasto", undefined],
    ["minhas entradas por categoria", "ranking_categorias", "entrada", undefined],
    ["qual meu saldo?", "saldo", undefined, undefined],
    ["saldo do mês", "saldo", undefined, undefined],
  ])("entende %s", (mensagem, tipo, movimento, categoria) => {
    const consulta = parseConsultaFinanceira(mensagem, AGORA)
    expect(consulta).toMatchObject({ tipo })
    if (movimento) expect(consulta.movimento).toBe(movimento)
    if (categoria) expect(consulta.categoria).toBe(categoria)
  })

  it.each([
    ["quanto gastei esse mês?", "mes_atual"],
    ["quanto gastei no mês passado?", "mes_passado"],
    ["quanto gastei hoje?", "hoje"],
    ["quanto gastei ontem?", "ontem"],
    ["quanto gastei essa semana?", "semana"],
    ["quanto gastei nos últimos 7 dias?", "ultimos_7_dias"],
  ])("entende o período em %s", (mensagem, periodo) => {
    expect(parseConsultaFinanceira(mensagem, AGORA).periodo.tipo).toBe(periodo)
  })

  it("usa o mês atual quando não há período explícito", () => {
    expect(parseConsultaFinanceira("quanto gastei?", AGORA).periodo)
      .toMatchObject({ tipo: "mes_atual", mesChave: "6-2026" })
  })

  it("classifica pergunta financeira vaga sem criar lançamento", () => {
    expect(parseConsultaFinanceira("quanto foi?", AGORA))
      .toMatchObject({ tipo: "vaga" })
  })

  it("não captura uma mensagem comum", () => {
    expect(parseConsultaFinanceira("mercado 35", AGORA)).toBeNull()
  })
})

describe("executarConsultaFinanceira", () => {
  const periodo = parseConsultaFinanceira("quanto gastei com mercado?", AGORA).periodo

  it("soma apenas o tipo e a categoria consultados", () => {
    const { db, all } = bancoCom([
      { tipo: "gasto", categoria: "mercado", valor: 100 },
      { tipo: "gasto", categoria: "supermercado", valor: 50 },
      { tipo: "gasto", categoria: "transporte", valor: 30 },
      { tipo: "entrada", categoria: "mercado", valor: 500 },
    ])
    const consulta = parseConsultaFinanceira("quanto gastei com mercado?", AGORA)

    const resultado = executarConsultaFinanceira(db, "usuario-1", consulta)

    expect(resultado).toMatchObject({ status: "ok", total: 150, quantidade: 2 })
    expect(all).toHaveBeenCalledWith("usuario-1", "6-2026")
  })

  it("calcula saldo com entradas e gastos", () => {
    const { db } = bancoCom([
      { tipo: "entrada", categoria: "salario", valor: 2500 },
      { tipo: "gasto", categoria: "mercado", valor: 800 },
    ])
    const consulta = { tipo: "saldo", periodo }

    expect(executarConsultaFinanceira(db, "usuario-1", consulta))
      .toMatchObject({ entradas: 2500, gastos: 800, saldo: 1700 })
  })

  it("retorna o maior gasto do período", () => {
    const { db } = bancoCom([
      { tipo: "gasto", categoria: "mercado", valor: 100 },
      { tipo: "gasto", categoria: "transporte", valor: 220 },
    ])
    const consulta = { tipo: "maior_gasto", periodo }

    expect(executarConsultaFinanceira(db, "usuario-1", consulta).lancamento.valor)
      .toBe(220)
  })

  it("agrupa categorias antigas e canônicas no ranking", () => {
    const { db } = bancoCom([
      { tipo: "gasto", categoria: "ifood", valor: 80 },
      { tipo: "gasto", categoria: "alimentacao", valor: 20 },
      { tipo: "gasto", categoria: "uber", valor: 50 },
    ])
    const consulta = {
      tipo: "ranking_categorias",
      movimento: "gasto",
      periodo,
    }

    expect(executarConsultaFinanceira(db, "usuario-1", consulta).ranking)
      .toEqual([
        { categoria: "alimentacao", total: 100 },
        { categoria: "transporte", total: 50 },
      ])
  })

  it("retorna estado amigável para categoria sem dados", () => {
    const { db } = bancoCom([])
    const consulta = parseConsultaFinanceira("quanto gastei com mercado?", AGORA)
    const resultado = executarConsultaFinanceira(db, "usuario-1", consulta)

    expect(resultado.status).toBe("categoria_sem_dados")
    expect(formatarRespostaConsulta(resultado))
      .toBe("Não encontrei gastos em Mercado neste mês.")
  })
})

describe("formatarRespostaConsulta", () => {
  it("formata total financeiro em reais", () => {
    const consulta = parseConsultaFinanceira("quanto recebi de freelance?", AGORA)
    expect(formatarRespostaConsulta({
      ...consulta,
      status: "ok",
      total: 2450,
      quantidade: 2,
    })).toBe("Você recebeu R$ 2.450,00 em Freelance neste mês.")
  })

  it("orienta o usuário quando a pergunta é vaga", () => {
    expect(formatarRespostaConsulta({
      tipo: "vaga",
      status: "vaga",
      periodo: parseConsultaFinanceira("quanto gastei?", AGORA).periodo,
    })).toContain("quanto gastei com mercado?")
  })
})
