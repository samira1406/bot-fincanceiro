import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  atualizarPendenciaAI,
  iniciarPendenciaAI,
  limparPendenciaAI,
  obterPendenciaAI,
  resetPendenciasAIParaTestes,
} from "../src/pendingAI.js"

beforeEach(() => {
  resetPendenciasAIParaTestes()
  vi.useRealTimers()
})

describe("pendingAI", () => {
  it("isola pendências por usuário", () => {
    iniciarPendenciaAI("user-a", "confirmacao", { intent: "registrar_despesa" })

    expect(obterPendenciaAI("user-a")).toMatchObject({
      etapa: "confirmacao",
    })
    expect(obterPendenciaAI("user-b")).toBeNull()
  })

  it("atualiza etapa e limpa sem afetar outro usuário", () => {
    iniciarPendenciaAI("user-a", "valor", { intent: "registrar_despesa" })
    iniciarPendenciaAI("user-b", "confirmacao", { intent: "consultar_saldo" })

    atualizarPendenciaAI("user-a", { etapa: "categoria" })
    limparPendenciaAI("user-a")

    expect(obterPendenciaAI("user-a")).toBeNull()
    expect(obterPendenciaAI("user-b")).not.toBeNull()
  })

  it("expira automaticamente", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-19T12:00:00-03:00"))
    iniciarPendenciaAI("user-a", "confirmacao", { intent: "registrar_despesa" })

    vi.advanceTimersByTime(601_000)

    expect(obterPendenciaAI("user-a")).toBeNull()
  })
})
