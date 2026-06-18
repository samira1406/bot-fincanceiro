import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/config.js", () => ({
  config: { timeoutEstadoMs: 1000 },
}))

const {
  iniciarPendenciaEdicao,
  iniciarPendenciaReset,
  obterPendenciaEdicao,
  obterPendenciaReset,
  resetPendenciasEdicaoParaTestes,
} = await import("../src/pendingEdits.js")

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-06-18T12:00:00-03:00"))
  resetPendenciasEdicaoParaTestes()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("pendingEdits", () => {
  it("isola estados por usuário", () => {
    iniciarPendenciaEdicao("user-a", {
      etapa: "escolher_acao",
      lancamentoId: 10,
    })
    iniciarPendenciaReset("user-b")

    expect(obterPendenciaEdicao("user-a")).toMatchObject({ lancamentoId: 10 })
    expect(obterPendenciaEdicao("user-b")).toBeNull()
    expect(obterPendenciaReset("user-b")).toMatchObject({
      fraseObrigatoria: "CONFIRMAR RESET",
    })
    expect(obterPendenciaReset("user-a")).toBeNull()
  })

  it("expira estados automaticamente", () => {
    iniciarPendenciaEdicao("user-expira", {
      etapa: "escolher_item",
      itens: [1, 2],
    })
    expect(obterPendenciaEdicao("user-expira")).not.toBeNull()

    vi.advanceTimersByTime(1001)

    expect(obterPendenciaEdicao("user-expira")).toBeNull()
  })
})
