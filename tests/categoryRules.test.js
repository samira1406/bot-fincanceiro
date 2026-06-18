import { describe, expect, it } from "vitest"
import {
  categoriaEhEntrada,
  detectarCategoriaCanonica,
  normalizarCategoriaPorPalavraChave,
} from "../src/categoryRules.js"

describe("categoryRules", () => {
  it.each([
    ["atacadão", "mercado"],
    ["ifood", "alimentacao"],
    ["uber", "transporte"],
    ["internet casa", "moradia"],
    ["farmácia", "saude"],
    ["petshop", "pets"],
    ["cinema", "lazer"],
    ["netflix", "assinaturas"],
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
})
