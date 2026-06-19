import { describe, expect, it } from "vitest"
import {
  categoriaEhEntrada,
  detectarCategoriaCanonica,
  normalizarCategoriaCanonica,
  normalizarCategoriaPorPalavraChave,
} from "../src/categoryRules.js"

describe("categoryRules", () => {
  it.each([
    ["atacadão", "mercado"],
    ["ifood", "ifood"],
    ["uber", "uber"],
    ["internet casa", "internet"],
    ["farmácia", "farmacia"],
    ["petshop", "petshop"],
    ["cinema", "lazer"],
    ["netflix", "netflix"],
  ])("normaliza gasto %s para %s", (texto, categoria) => {
    expect(normalizarCategoriaPorPalavraChave(texto, "gasto")).toBe(categoria)
  })

  it.each([
    ["salário", "salario"],
    ["pix", "pix"],
    ["freela", "freelance"],
    ["comissionamento", "comissao"],
    ["cliente", "servico"],
  ])("normaliza entrada %s para %s", (texto, categoria) => {
    expect(normalizarCategoriaPorPalavraChave(texto, "entrada")).toBe(categoria)
    expect(categoriaEhEntrada(texto)).toBe(true)
  })

  it("encontra palavras-chave dentro de descrições maiores", () => {
    expect(detectarCategoriaCanonica("compra no max atacadista centro", "gasto"))
      .toBe("mercado")
    expect(detectarCategoriaCanonica("projeto de comissionamento", "entrada"))
      .toBe("comissao")
  })

  it("preserva categoria personalizada quando não há correspondência", () => {
    expect(normalizarCategoriaPorPalavraChave("curso profissional", "gasto"))
      .toBe("curso profissional")
  })

  it.each([
    ["mercd", "mercado"],
    ["ifodi", "ifood"],
    ["ubber", "uber"],
    ["farma", "farmacia"],
    ["netiflix", "netflix"],
    ["alugel", "aluguel"],
  ])("corrige alias claro %s para %s", (texto, category) => {
    expect(normalizarCategoriaCanonica(texto, { tipo: "gasto" }))
      .toMatchObject({
        category,
        confidence: 0.98,
        source: "alias",
        original: texto,
      })
  })

  it("normaliza aliases de entrada como frila", () => {
    expect(normalizarCategoriaCanonica("frila", { tipo: "entrada" }))
      .toMatchObject({
        category: "freelance",
        source: "alias",
      })
  })

  it("usa fuzzy apenas para correspondência única", () => {
    expect(normalizarCategoriaCanonica("mercadoo", { tipo: "gasto" }))
      .toMatchObject({
        category: "mercado",
        source: "fuzzy",
      })
    expect(normalizarCategoriaCanonica("banana azul", { tipo: "gasto" }))
      .toMatchObject({
        category: "banana azul",
        source: "unknown",
        confidence: 0,
      })
  })
})
