import { describe, it, expect, beforeAll, vi } from "vitest"
import {
  parseAjuda, parseCorrecaoUltimo, parseExportacao, parseLancamento,
  parseMetaCategoria, parseValorSimples,
} from "../src/validators.js"

// Mock config para testes
vi.mock("../src/config.js", () => ({
  config: {
    valorMaximo:     100_000,
    palavrasEntrada: ["salario", "freela", "bonus", "pix"],
  },
}))

describe("parseLancamento", () => {
  describe("formato simples: nome valor", () => {
    it("parseia gasto básico", () => {
      expect(parseLancamento("mercado 120,50")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 120.50,
      })
    })

    it("parseia com valor inteiro", () => {
      expect(parseLancamento("uber 30")).toEqual({
        nome: "uber", categoria: "transporte", valor: 30,
      })
    })

    it("parseia com ponto decimal", () => {
      expect(parseLancamento("netflix 39.90")).toEqual({
        nome: "netflix", categoria: "netflix", valor: 39.90,
      })
    })

    it("parseia gasto natural com categoria", () => {
      expect(parseLancamento("gastei 50 no mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 50,
      })
    })

    it("parseia valor antes da categoria", () => {
      expect(parseLancamento("50 mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 50,
      })
    })

    it("parseia valor antes da categoria com maiúscula", () => {
      expect(parseLancamento("900 Mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 900,
      })
    })

    it("converte ifood para categoria alimentacao", () => {
      expect(parseLancamento("gastei 80 no ifood")).toEqual({
        nome: "ifood", categoria: "alimentacao", valor: 80,
      })
    })
  })

  describe("formato com categoria: nome categoria valor", () => {
    it("parseia gasto com categoria", () => {
      expect(parseLancamento("uber transporte 30")).toEqual({
        nome: "uber", categoria: "transporte", valor: 30,
      })
    })

    it("parseia mercado com categoria alimentacao", () => {
      expect(parseLancamento("mercado alimentacao 150,00")).toEqual({
        nome: "mercado", categoria: "alimentacao", valor: 150,
      })
    })
  })

  describe("entradas", () => {
    it("parseia salario", () => {
      expect(parseLancamento("salario 5000")).toEqual({
        tipo: "entrada", nome: "salario", categoria: "salario", valor: 5000,
      })
    })

    it.each([
      ["recebi 2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["recebi 2500 salário", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["entrou 500 pix", { nome: "pix", categoria: "pix", valor: 500 }],
      ["ganhei 1200 freelance", { nome: "freela", categoria: "freela", valor: 1200 }],
      ["caiu 2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["caiu salario 2500", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["salario 2500", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["receita 3000", { nome: "receita", categoria: "receita", valor: 3000 }],
      ["entrada 3000", { nome: "entrada", categoria: "entrada", valor: 3000 }],
    ])("parseia %s como receita", (mensagem, esperado) => {
      expect(parseLancamento(mensagem)).toEqual({
        tipo: "entrada",
        ...esperado,
      })
    })
  })

  describe("valores inválidos", () => {
    it("rejeita valor zero", () => {
      expect(parseLancamento("mercado 0")).toBeNull()
    })

    it("rejeita valor negativo", () => {
      expect(parseLancamento("mercado -50")).toBeNull()
    })

    it("rejeita valor acima do máximo", () => {
      expect(parseLancamento("mercado 200000")).toBeNull()
    })

    it("rejeita valor não numérico", () => {
      expect(parseLancamento("mercado abc")).toBeNull()
    })

    it("rejeita mensagem sem valor", () => {
      expect(parseLancamento("mercado")).toBeNull()
    })

    it("rejeita mensagem vazia", () => {
      expect(parseLancamento("")).toBeNull()
    })
  })

  describe("nomes inválidos", () => {
    it("rejeita nome com caracteres especiais", () => {
      expect(parseLancamento("merca!do 50")).toBeNull()
    })

    it("rejeita nome com espaço duplo tratado como categoria inválida", () => {
      // "a b! 10" — categoria 'b!' é inválida
      expect(parseLancamento("a b! 10")).toBeNull()
    })
  })
})

describe("parseValorSimples", () => {
  it("parseia valor inteiro", () => {
    expect(parseValorSimples("3000")).toBe(3000)
  })

  it("parseia valor com vírgula", () => {
    expect(parseValorSimples("1500,50")).toBe(1500.50)
  })

  it("retorna null para string vazia", () => {
    expect(parseValorSimples("")).toBeNull()
  })

  it("retorna null para valor negativo", () => {
    expect(parseValorSimples("-100")).toBeNull()
  })

  it("retorna null para valor acima do máximo", () => {
    expect(parseValorSimples("200000")).toBeNull()
  })

  it("retorna null para texto não numérico", () => {
    expect(parseValorSimples("abc")).toBeNull()
  })
})

describe("parseCorrecaoUltimo", () => {
  it("parseia corrigir último com acento", () => {
    expect(parseCorrecaoUltimo("corrigir último para 45")).toEqual({ valor: 45 })
  })

  it("parseia corrigir ultimo sem acento", () => {
    expect(parseCorrecaoUltimo("corrigir ultimo para 45")).toEqual({ valor: 45 })
  })

  it("parseia corrige último com vírgula decimal", () => {
    expect(parseCorrecaoUltimo("corrige último para 45,50")).toEqual({ valor: 45.5 })
  })

  it("parseia alterar ultimo", () => {
    expect(parseCorrecaoUltimo("alterar ultimo para 120")).toEqual({ valor: 120 })
  })

  it("rejeita valor inválido", () => {
    expect(parseCorrecaoUltimo("corrigir ultimo para abc")).toBeNull()
  })
})

describe("parseAjuda", () => {
  it.each([
    "ajuda",
    "comandos",
    "como usar",
    "menu",
    "inicio",
    "início",
    "start",
  ])("parseia %s", (mensagem) => {
    expect(parseAjuda(mensagem)).toEqual({ tipo: "ajuda" })
  })

  it("retorna null para comando que não é ajuda", () => {
    expect(parseAjuda("resumo")).toBeNull()
  })
})

describe("parseExportacao", () => {
  it.each([
    "exportar",
    "exportar csv",
  ])("parseia %s como CSV", (mensagem) => {
    expect(parseExportacao(mensagem)).toEqual({ tipo: "exportacao", formato: "csv" })
  })

  it.each([
    "baixar planilha",
    "gerar planilha",
    "minha planilha",
    "exportar planilha",
    "planilha bonita",
    "planilha excel",
    "exportar excel",
    "xlsx",
    "exportar xlsx",
  ])("parseia %s como XLSX", (mensagem) => {
    expect(parseExportacao(mensagem)).toEqual({ tipo: "exportacao", formato: "xlsx" })
  })

  it("retorna null para comando desconhecido", () => {
    expect(parseExportacao("exportar tudo agora")).toBeNull()
  })
})

describe("parseMetaCategoria", () => {
  it("parseia meta mercado 600", () => {
    expect(parseMetaCategoria("meta mercado 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia meta alimentação 500", () => {
    expect(parseMetaCategoria("meta alimentação 500")).toEqual({
      tipo: "meta_categoria", categoria: "alimentacao", valor: 500,
    })
  })

  it("parseia criar meta de 600 para mercado", () => {
    expect(parseMetaCategoria("criar meta de 600 para mercado")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia minha meta de mercado é 600", () => {
    expect(parseMetaCategoria("minha meta de mercado é 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia limite mercado 600", () => {
    expect(parseMetaCategoria("limite mercado 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("retorna erro para valor inválido", () => {
    expect(parseMetaCategoria("meta mercado abc")).toEqual({
      tipo: "meta_categoria", erro: "valor",
    })
  })

  it("retorna erro para categoria ausente", () => {
    expect(parseMetaCategoria("criar meta de 600")).toEqual({
      tipo: "meta_categoria", erro: "categoria",
    })
  })

  it("retorna erro para valor ausente", () => {
    expect(parseMetaCategoria("meta mercado")).toEqual({
      tipo: "meta_categoria", erro: "valor", categoria: "mercado",
    })
  })

  it("mantém meta mensal geral fora do parser de categoria", () => {
    expect(parseMetaCategoria("meta 3000")).toBeNull()
  })
})
