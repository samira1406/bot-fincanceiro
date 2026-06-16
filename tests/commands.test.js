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
  criarOuAtualizarMetaCategoria,
  getSomaPorTipo, getUltimoLancamento, mesAtual, db,
} = await import("../src/database.js")

let sock

function prepararUsuario(id) {
  criarUsuario(id)
  atualizarUsuario(id, { nome: "Teste", aguardando_nome: 0 })
}

function ultimaResposta() {
  return sock.sendMessage.mock.calls.at(-1)?.[1]?.text
}

function periodoAtualTeste() {
  const d = new Date()
  return { mes: d.getMonth() + 1, ano: d.getFullYear() }
}

beforeEach(() => {
  db.exec(`
    DELETE FROM metas_categoria;
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

  it("mostra categorias formatadas no histórico", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "ifood", categoria: "alimentacao", valor: 80, mes: "6-2026" })
    inserirLancamento({ usuarioId: "user-a", tipo: "entrada", nome: "salario", categoria: "salario", valor: 2500, mes: "6-2026" })

    await processarMensagem(sock, "grupo", "user-a", "historico")

    expect(ultimaResposta()).toContain("Alimentação")
    expect(ultimaResposta()).toContain("Salário")
  })
})

describe("processarMensagem - receitas naturais", () => {
  it.each([
    ["recebi 2500 salario", "Salário"],
    ["recebi 2500 salário", "Salário"],
    ["entrou 500 pix", "Pix"],
    ["ganhei 1200 freelance", "Freela"],
    ["caiu 2500 salario", "Salário"],
    ["caiu salario 2500", "Salário"],
    ["salario 2500", "Salário"],
    ["2500 salario", "Salário"],
    ["receita 3000", "Receita"],
    ["entrada 3000", "Entrada"],
  ])("registra %s como receita", async (mensagem, categoriaEsperada) => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", mensagem)

    const ultimo = getUltimoLancamento("user-a")
    expect(ultimaResposta()).toContain("entrada registrada")
    expect(ultimaResposta()).toContain(categoriaEsperada)
    expect(ultimo.tipo).toBe("entrada")
  })

  it("mantém despesas antigas como despesa", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("despesa registrada")
    expect(getUltimoLancamento("user-a").tipo).toBe("gasto")
  })

  it("mantém resumo calculando receitas e despesas corretamente", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "recebi 2500 salario")
    await processarMensagem(sock, "grupo", "user-a", "gastei 35 no mercado")
    await processarMensagem(sock, "grupo", "user-a", "resumo")

    expect(getSomaPorTipo("user-a", "entrada", mesAtual())).toBe(2500)
    expect(getSomaPorTipo("user-a", "gasto", mesAtual())).toBe(35)
    expect(ultimaResposta()).toContain("Entradas: R$ 2.500,00")
    expect(ultimaResposta()).toContain("Gastos:   R$ 35,00")
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

describe("processarMensagem - metas por categoria", () => {
  it("cria meta com comando meta mercado 600", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "meta mercado 600")

    expect(ultimaResposta()).toContain("Meta criada: Mercado até R$ 600,00 neste mês.")
  })

  it("lista metas com comando metas", async () => {
    prepararUsuario("user-a")
    const { mes, ano } = periodoAtualTeste()
    criarOuAtualizarMetaCategoria("user-a", "mercado", 600, mes, ano)
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 50, mes: `${mes}-${ano}` })

    await processarMensagem(sock, "grupo", "user-a", "metas")

    expect(ultimaResposta()).toContain("Suas metas deste mês")
    expect(ultimaResposta()).toContain("Mercado: R$ 50,00 / R$ 600,00")
  })

  it("cria meta, registra gasto em mercado e lista progresso", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "meta mercado 600")
    await processarMensagem(sock, "grupo", "user-a", "gastei 50 no mercado")
    await processarMensagem(sock, "grupo", "user-a", "metas")

    expect(ultimaResposta()).toContain("Mercado: R$ 50,00 / R$ 600,00")
  })

  it("responde despesa com progresso da meta", async () => {
    prepararUsuario("user-a")
    const { mes, ano } = periodoAtualTeste()
    criarOuAtualizarMetaCategoria("user-a", "mercado", 600, mes, ano)
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 370, mes: `${mes}-${ano}` })

    await processarMensagem(sock, "grupo", "user-a", "gastei 50 no mercado")

    expect(ultimaResposta()).toContain("despesa registrada")
    expect(ultimaResposta()).toContain("em Mercado")
    expect(ultimaResposta()).toContain("Você já usou R$ 420,00")
    expect(ultimaResposta()).toContain("Ainda restam R$ 180,00")
  })

  it("responde despesa quando ultrapassa meta", async () => {
    prepararUsuario("user-a")
    const { mes, ano } = periodoAtualTeste()
    criarOuAtualizarMetaCategoria("user-a", "mercado", 600, mes, ano)
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 590, mes: `${mes}-${ano}` })

    await processarMensagem(sock, "grupo", "user-a", "gastei 50 no mercado")

    expect(ultimaResposta()).toContain("Atenção: você ultrapassou sua meta de Mercado")
    expect(ultimaResposta()).toContain("Gasto atual: R$ 640,00")
    expect(ultimaResposta()).toContain("Excedente: R$ 40,00")
  })

  it("usuário A não vê meta do usuário B", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")
    const { mes, ano } = periodoAtualTeste()
    criarOuAtualizarMetaCategoria("user-b", "mercado", 600, mes, ano)

    await processarMensagem(sock, "grupo", "user-a", "metas")

    expect(ultimaResposta()).toContain("Você ainda não criou metas")
    expect(ultimaResposta()).not.toContain("Mercado")
  })

  it("usuário A não recebe gastos de mercado do usuário B", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")

    await processarMensagem(sock, "grupo", "user-a", "meta mercado 600")
    await processarMensagem(sock, "grupo", "user-b", "gastei 50 no mercado")
    await processarMensagem(sock, "grupo", "user-a", "metas")

    expect(ultimaResposta()).toContain("Mercado: R$ 0,00 / R$ 600,00")
  })
})
