import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../src/config.js", () => ({
  config: { rateLimitPorMinuto: 5, logLevel: "silent" },
  mascararNumeroBeta: (valor) => String(valor ?? ""),
}))
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { verificarRateLimit } = await import("../src/rateLimiter.js")

describe("verificarRateLimit", () => {
  it("permite mensagens dentro do limite", () => {
    for (let i = 0; i < 5; i++) {
      expect(verificarRateLimit("user-ok")).toBe(true)
    }
  })

  it("bloqueia quando ultrapassa o limite", () => {
    const uid = "user-bloqueado"
    for (let i = 0; i < 5; i++) verificarRateLimit(uid)
    expect(verificarRateLimit(uid)).toBe(false)
  })

  it("usuários diferentes têm janelas independentes", () => {
    const u1 = "rl-user-1"
    const u2 = "rl-user-2"
    for (let i = 0; i < 5; i++) verificarRateLimit(u1)
    // u1 está bloqueado mas u2 não
    expect(verificarRateLimit(u1)).toBe(false)
    expect(verificarRateLimit(u2)).toBe(true)
  })
})
