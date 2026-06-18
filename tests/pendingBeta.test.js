import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/config.js", () => ({
  config: { timeoutEstadoMs: 1000 },
}))

const {
  iniciarAvaliacaoBeta,
  obterAvaliacaoBetaPendente,
  resetPendenciasBetaParaTestes,
  selecionarNotaAvaliacaoBeta,
} = await import("../src/pendingBeta.js")

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-06-18T12:00:00-03:00"))
  resetPendenciasBetaParaTestes()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("pendingBeta", () => {
  it("isola avaliação por usuário e avança para comentário", () => {
    iniciarAvaliacaoBeta("user-a")

    expect(obterAvaliacaoBetaPendente("user-a")).toMatchObject({
      etapa: "nota",
      nota: null,
    })
    expect(obterAvaliacaoBetaPendente("user-b")).toBeNull()

    selecionarNotaAvaliacaoBeta("user-a", 8)
    expect(obterAvaliacaoBetaPendente("user-a")).toMatchObject({
      etapa: "comentario",
      nota: 8,
    })
  })

  it("expira automaticamente", () => {
    iniciarAvaliacaoBeta("user-expira")
    vi.advanceTimersByTime(1001)
    expect(obterAvaliacaoBetaPendente("user-expira")).toBeNull()
  })
})
