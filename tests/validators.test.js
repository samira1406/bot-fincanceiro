import { describe, it, expect, beforeAll, vi } from "vitest"
import { parseCorrecaoUltimo, parseLancamento, parseValorSimples } from "../src/validators.js"

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
        nome: "mercado", categoria: "geral", valor: 120.50,
      })
    })

    it("parseia com valor inteiro", () => {
      expect(parseLancamento("uber 30")).toEqual({
        nome: "uber", categoria: "geral", valor: 30,
      })
    })

    it("parseia com ponto decimal", () => {
      expect(parseLancamento("netflix 39.90")).toEqual({
        nome: "netflix", categoria: "geral", valor: 39.90,
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
        nome: "salario", categoria: "geral", valor: 5000,
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
