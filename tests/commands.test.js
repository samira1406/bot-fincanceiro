import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/config.js", () => ({
  config: {
    dbPath:              ":memory:",
    logLevel:            "silent",
    palavrasEntrada:     ["salario", "freela"],
    valorMaximo:         100_000,
    caixinhaPercentual:  0.3,
    timeoutEstadoMs:     600_000,
  },
}))

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logMensagem: vi.fn(),
}))

const { processarMensagem } = await import("../src/commands.js")
const {
  criarUsuario, atualizarUsuario, inserirLancamento,
  getUltimoLancamento, db,
} = await import("../src/database.js")

let sock

function prepararUsuario(id) {
  criarUsuario(id)
  atualizarUsuario(id, { nome: "Teste", aguardando_nome: 0 })
}

function ultimaResposta() {
  return sock.sendMessage.mock.calls.at(-1)?.[1]?.text
}

beforeEach(() => {
  db.exec(`
    DELETE FROM lancamentos;
    DELETE FROM usuarios;
  `)
  sock = { sendMessage: vi.fn() }
})

describe("processarMensagem - histórico", () => {
  it("responde mensagem amigável quando não há lançamentos", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "histórico")

    expect(ultimaResposta()).toContain("Você ainda não tem lançamentos registrados")
  })

  it("aceita ultimos lancamentos e lista registros do usuário", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })

    await processarMensagem(sock, "grupo", "user-a", "ultimos lancamentos")

    expect(ultimaResposta()).toContain("Últimos lançamentos")
    expect(ultimaResposta()).toContain("Despesa")
    expect(ultimaResposta()).toContain("R$ 35,00")
  })
})

describe("processarMensagem - corrigir último", () => {
  it("corrige o valor do último lançamento do usuário", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })

    await processarMensagem(sock, "grupo", "user-a", "corrigir último para 45")

    expect(ultimaResposta()).toContain("Antes: R$ 35,00")
    expect(ultimaResposta()).toContain("Agora: R$ 45,00")
    expect(getUltimoLancamento("user-a").valor).toBe(45)
  })
})

describe("processarMensagem - apagar último", () => {
  it("aceita excluir último e não apaga lançamento de outro usuário", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })
    inserirLancamento({ usuarioId: "user-b", tipo: "gasto", nome: "uber", categoria: "transporte", valor: 20, mes: "6-2026" })

    await processarMensagem(sock, "grupo", "user-a", "excluir último")

    expect(ultimaResposta()).toContain("apaguei seu último lançamento")
    expect(getUltimoLancamento("user-a")).toBeNull()
    expect(getUltimoLancamento("user-b").nome).toBe("uber")
  })
})
