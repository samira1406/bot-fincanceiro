/**
 * Testes de integração para a camada de banco de dados.
 * Usa um banco em memória (`:memory:`) para não tocar no banco real.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

// ── Mock do config para usar banco em memória ─────────────────────────────────
vi.mock("../src/config.js", () => ({
  config: {
    dbPath:          ":memory:",
    logLevel:        "silent",
    palavrasEntrada: ["salario"],
    valorMaximo:     100_000,
  },
}))

// Mock logger para silenciar output nos testes
vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logMensagem: vi.fn(),
}))

// Importa DEPOIS dos mocks
const {
  getUsuario, criarUsuario, atualizarUsuario, limparEstadoExpirado,
  inserirLancamento, getLancamentosPorMes, getGastosPorCategoria,
  getUltimosLancamentos, getUltimoLancamento,
  atualizarValorLancamento, deletarLancamento, deletarLancamentoDoUsuario,
  deletarLancamentosDesde,
  getTodosUsuarios, getSomaPorTipo, definirMeta, getMeta,
  getMesesComDados, gerarCSV, mesAtual, db,
} = await import("../src/database.js")

beforeEach(() => {
  db.exec(`
    DELETE FROM lancamentos;
    DELETE FROM usuarios;
  `)
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Usuários", () => {
  it("criarUsuario cria e retorna o usuário", () => {
    const u = criarUsuario("test-001")
    expect(u.id).toBe("test-001")
    expect(u.aguardando_nome).toBe(1)
  })

  it("getUsuario retorna null para inexistente", () => {
    expect(getUsuario("nao-existe")).toBeNull()
  })

  it("atualizarUsuario atualiza campos", () => {
    criarUsuario("test-002")
    atualizarUsuario("test-002", { nome: "Maria", aguardando_nome: 0 })
    const u = getUsuario("test-002")
    expect(u.nome).toBe("Maria")
    expect(u.aguardando_nome).toBe(0)
  })

  it("getTodosUsuarios retorna apenas com nome definido", () => {
    criarUsuario("test-sem-nome")
    criarUsuario("test-com-nome")
    atualizarUsuario("test-com-nome", { nome: "Ana", aguardando_nome: 0 })
    const todos = getTodosUsuarios()
    const ids   = todos.map(u => u.id)
    expect(ids).toContain("test-com-nome")
    expect(ids).not.toContain("test-sem-nome")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Lançamentos", () => {
  const UID = "user-lancamentos"

  beforeEach(() => {
    criarUsuario(UID)
    atualizarUsuario(UID, { nome: "Teste", aguardando_nome: 0 })
  })

  it("inserirLancamento retorna um ID", () => {
    const id = inserirLancamento({
      usuarioId: UID, tipo: "gasto", nome: "mercado",
      categoria: "alimentacao", valor: 100, mes: "6-2026",
    })
    expect(typeof id).toBe("number")
    expect(id).toBeGreaterThan(0)
  })

  it("getLancamentosPorMes retorna apenas do mês correto", () => {
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "a", categoria: "geral", valor: 10, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "b", categoria: "geral", valor: 20, mes: "5-2026" })
    const l = getLancamentosPorMes(UID, "6-2026")
    expect(l.every(x => x.mes === "6-2026")).toBe(true)
  })

  it("getSomaPorTipo soma corretamente", () => {
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "x", categoria: "geral", valor: 100, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "y", categoria: "geral", valor: 200, mes: "6-2026" })
    expect(getSomaPorTipo(UID, "gasto", "6-2026")).toBe(300)
  })

  it("getSomaPorTipo retorna 0 para mês sem dados", () => {
    expect(getSomaPorTipo(UID, "gasto", "1-2000")).toBe(0)
  })

  it("getGastosPorCategoria agrupa corretamente", () => {
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "mcn", categoria: "alimentacao", valor: 50, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "bus", categoria: "transporte", valor: 30, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "pao", categoria: "alimentacao", valor: 20, mes: "6-2026" })
    const grupos = getGastosPorCategoria(UID, "6-2026")
    const alim   = grupos.find(g => g.categoria === "alimentacao")
    expect(alim?.total).toBe(70)
  })

  it("getUltimoLancamento retorna o mais recente", () => {
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "primeiro", categoria: "geral", valor: 10, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "ultimo",   categoria: "geral", valor: 99, mes: "6-2026" })
    const u = getUltimoLancamento(UID)
    expect(u.nome).toBe("ultimo")
  })

  it("getUltimosLancamentos lista os mais recentes primeiro", () => {
    for (let i = 1; i <= 3; i++) {
      inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: `item${i}`, categoria: "geral", valor: i, mes: "6-2026" })
    }
    const ultimos = getUltimosLancamentos(UID, 5)
    expect(ultimos.map(l => l.nome)).toEqual(["item3", "item2", "item1"])
  })

  it("getUltimosLancamentos limita histórico a 5 registros", () => {
    for (let i = 1; i <= 6; i++) {
      inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: `item${i}`, categoria: "geral", valor: i, mes: "6-2026" })
    }
    const ultimos = getUltimosLancamentos(UID, 5)
    expect(ultimos).toHaveLength(5)
    expect(ultimos.map(l => l.nome)).toEqual(["item6", "item5", "item4", "item3", "item2"])
  })

  it("atualizarValorLancamento corrige último lançamento do usuário correto", () => {
    const outro = "outro-user"
    criarUsuario(outro)
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })
    inserirLancamento({ usuarioId: outro, tipo: "gasto", nome: "uber", categoria: "transporte", valor: 22, mes: "6-2026" })

    const ultimo = getUltimoLancamento(UID)
    expect(atualizarValorLancamento(UID, ultimo.id, 45)).toBe(true)

    expect(getUltimoLancamento(UID).valor).toBe(45)
    expect(getUltimoLancamento(outro).valor).toBe(22)
  })

  it("atualizarValorLancamento não corrige lançamento de outro usuário", () => {
    const outro = "outro-user"
    criarUsuario(outro)
    const idOutro = inserirLancamento({ usuarioId: outro, tipo: "gasto", nome: "uber", categoria: "transporte", valor: 22, mes: "6-2026" })

    expect(atualizarValorLancamento(UID, idOutro, 99)).toBe(false)
    expect(getUltimoLancamento(outro).valor).toBe(22)
  })

  it("deletarLancamento remove o registro", () => {
    const id = inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "del", categoria: "geral", valor: 1, mes: "6-2026" })
    deletarLancamento(id)
    const todos = getLancamentosPorMes(UID, "6-2026")
    expect(todos.find(l => l.id === id)).toBeUndefined()
  })

  it("deletarLancamentoDoUsuario apaga último lançamento do usuário correto", () => {
    const outro = "outro-user"
    criarUsuario(outro)
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "primeiro", categoria: "geral", valor: 10, mes: "6-2026" })
    inserirLancamento({ usuarioId: outro, tipo: "gasto", nome: "outro", categoria: "geral", valor: 20, mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "gasto", nome: "ultimo", categoria: "geral", valor: 30, mes: "6-2026" })

    const ultimo = getUltimoLancamento(UID)
    expect(deletarLancamentoDoUsuario(UID, ultimo.id)).toBe(true)

    expect(getUltimosLancamentos(UID, 5).map(l => l.nome)).toEqual(["primeiro"])
    expect(getUltimoLancamento(outro).nome).toBe("outro")
  })

  it("deletarLancamentoDoUsuario não apaga lançamento de outro usuário", () => {
    const outro = "outro-user"
    criarUsuario(outro)
    const idOutro = inserirLancamento({ usuarioId: outro, tipo: "gasto", nome: "outro", categoria: "geral", valor: 20, mes: "6-2026" })

    expect(deletarLancamentoDoUsuario(UID, idOutro)).toBe(false)
    expect(getUltimoLancamento(outro).nome).toBe("outro")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Metas", () => {
  const UID = "user-metas"

  beforeEach(() => {
    criarUsuario(UID)
    atualizarUsuario(UID, { nome: "MetaTeste", aguardando_nome: 0 })
  })

  it("getMeta retorna null quando não definida", () => {
    expect(getMeta(UID)).toBeNull()
  })

  it("definirMeta e getMeta funcionam juntos", () => {
    definirMeta(UID, 3000)
    expect(getMeta(UID)).toBe(3000)
  })

  it("definirMeta atualiza valor existente", () => {
    definirMeta(UID, 3000)
    definirMeta(UID, 5000)
    expect(getMeta(UID)).toBe(5000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Estado expirado", () => {
  const UID = "user-expire"

  beforeEach(() => {
    criarUsuario(UID)
    atualizarUsuario(UID, { nome: "ExpireTeste", aguardando_nome: 0 })
  })

  it("limparEstadoExpirado cancela estado vencido", () => {
    atualizarUsuario(UID, {
      aguardando_caixinha:     1,
      valor_sugerido_caixinha: 500,
      estado_expira_em:        Date.now() - 1000,   // já expirou
    })
    limparEstadoExpirado(UID)
    const u = getUsuario(UID)
    expect(u.aguardando_caixinha).toBe(0)
    expect(u.valor_sugerido_caixinha).toBe(0)
  })

  it("limparEstadoExpirado não cancela estado válido", () => {
    atualizarUsuario(UID, {
      aguardando_caixinha:     1,
      valor_sugerido_caixinha: 500,
      estado_expira_em:        Date.now() + 60_000,   // ainda válido
    })
    limparEstadoExpirado(UID)
    const u = getUsuario(UID)
    expect(u.aguardando_caixinha).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("Exportação CSV", () => {
  const UID = "user-csv"

  beforeEach(() => {
    criarUsuario(UID)
    atualizarUsuario(UID, { nome: "CsvTeste", aguardando_nome: 0 })
    inserirLancamento({ usuarioId: UID, tipo: "gasto",  nome: "cafe",   categoria: "alimentacao", valor: 12.5,  mes: "6-2026" })
    inserirLancamento({ usuarioId: UID, tipo: "entrada", nome: "freela", categoria: "geral",       valor: 1000, mes: "6-2026" })
  })

  it("gera CSV com header correto", () => {
    const csv = gerarCSV(UID, "6-2026")
    expect(csv).toContain("data,tipo,nome,categoria,valor")
  })

  it("CSV contém os lançamentos", () => {
    const csv = gerarCSV(UID, "6-2026")
    expect(csv).toContain("cafe")
    expect(csv).toContain("freela")
  })

  it("CSV vazio para mês sem dados", () => {
    const csv = gerarCSV(UID, "1-2000")
    const linhas = csv.split("\n").filter(Boolean)
    expect(linhas.length).toBe(1)   // só o header
  })
})
