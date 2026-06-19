import { describe, expect, it } from "vitest"
import {
  formatarFechamentoMensal,
  gerarFechamentoMensal,
  gerarInsightsFinanceiros,
} from "../src/insights.js"

const AGORA = new Date("2026-06-18T12:00:00-03:00")

describe("gerarInsightsFinanceiros", () => {
  it("gera insights positivos, concentração e meta próxima do limite", () => {
    const insights = gerarInsightsFinanceiros({
      entradas: 3000,
      gastos: 1000,
      saldo: 2000,
      categorias: [
        { categoria: "mercado", total: 850 },
        { categoria: "transporte", total: 150 },
      ],
      metas: [{ categoria: "supermercado", valor_limite: 1000 }],
    })

    expect(insights).toContain("Você está positivo no mês.")
    expect(insights).toContain("Mercado representa 85% dos seus gastos do mês.")
    expect(insights).toContain("Você já usou 85% da meta de Mercado.")
  })

  it("avisa quando o saldo está negativo", () => {
    expect(gerarInsightsFinanceiros({
      entradas: 500,
      gastos: 800,
      saldo: -300,
      categorias: [{ categoria: "mercado", total: 800 }],
    })).toContain("Seu mês está negativo. Vale revisar os maiores gastos.")
  })

  it("avisa quando não há entradas nem gastos", () => {
    const insights = gerarInsightsFinanceiros({
      entradas: 0,
      gastos: 0,
      saldo: 0,
      categorias: [],
    })
    expect(insights).toContain("Você ainda não registrou gastos neste período.")
    expect(insights).toContain("Você ainda não registrou entradas neste período.")
  })
})

describe("gerarFechamentoMensal", () => {
  const lancamentos = [
    { tipo: "entrada", categoria: "salario", nome: "salario", valor: 7200, criado_em: AGORA.getTime() },
    { tipo: "gasto", categoria: "mercado", nome: "mercado", valor: 500, criado_em: AGORA.getTime() },
    { tipo: "gasto", categoria: "supermercado", nome: "feira", valor: 350, criado_em: AGORA.getTime() },
    { tipo: "gasto", categoria: "uber", nome: "uber", valor: 220, criado_em: AGORA.getTime() },
    { tipo: "gasto", categoria: "petshop", nome: "petshop", valor: 120, criado_em: AGORA.getTime() },
  ]

  it("calcula totais, ranking, maior lançamento e ponto de atenção", () => {
    const fechamento = gerarFechamentoMensal({ lancamentos, agora: AGORA })

    expect(fechamento).toMatchObject({
      mesNome: "JUNHO",
      entradas: 7200,
      gastos: 1190,
      saldo: 6010,
      maiorLancamento: { valor: 500 },
      pontoAtencao: { categoria: "mercado", total: 850 },
    })
    expect(fechamento.categorias).toEqual([
      { categoria: "mercado", total: 850 },
      { categoria: "uber", total: 220 },
      { categoria: "petshop", total: 120 },
    ])
  })

  it("formata um fechamento completo e amigável", () => {
    const texto = formatarFechamentoMensal(
      gerarFechamentoMensal({ lancamentos, agora: AGORA })
    )

    expect(texto).toContain("FECHAMENTO DO MÊS - JUNHO")
    expect(texto).toContain("Entradas: R$ 7.200,00")
    expect(texto).toContain("Gastos: R$ 1.190,00")
    expect(texto).toContain("1. Mercado: R$ 850,00")
    expect(texto).toContain("Seu maior ponto de atenção foi Mercado.")
  })

  it("retorna orientação quando não há lançamentos", () => {
    const texto = formatarFechamentoMensal(
      gerarFechamentoMensal({ lancamentos: [], agora: AGORA })
    )
    expect(texto).toContain("Ainda não encontrei lançamentos")
    expect(texto).toContain("mercado 35")
  })
})
