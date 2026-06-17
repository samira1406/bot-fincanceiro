import { beforeEach, describe, expect, it, vi } from "vitest"
import ExcelJS from "exceljs"

const configMock = vi.hoisted(() => {
  const normalizarNumeroBeta = (valor) =>
    String(valor ?? "").split("@")[0].split(":")[0].replace(/\D/g, "")

  return {
    config: {
      dbPath:              ":memory:",
      logLevel:            "silent",
      palavrasEntrada:     ["salario", "freela"],
      valorMaximo:         100_000,
      caixinhaPercentual:  0.3,
      timeoutEstadoMs:     600_000,
      beta:                { ativo: false, responderBloqueado: false, numerosAutorizados: [] },
    },
    normalizarNumeroBeta,
    mascararNumeroBeta: (valor) => {
      const numero = normalizarNumeroBeta(valor)
      if (!numero) return ""
      if (numero.length <= 8) return "****"
      return `${numero.slice(0, 5)}****${numero.slice(-4)}`
    },
  }
})

vi.mock("../src/config.js", () => ({
  config: configMock.config,
  normalizarNumeroBeta: configMock.normalizarNumeroBeta,
  mascararNumeroBeta: configMock.mascararNumeroBeta,
  usuarioAutorizadoBeta: (usuarioId, beta = configMock.config.beta) => {
    if (!beta?.ativo) return true

    const numero = configMock.normalizarNumeroBeta(usuarioId)
    const autorizados = new Set(
      (beta.numerosAutorizados ?? [])
        .map(configMock.normalizarNumeroBeta)
        .filter(Boolean)
    )

    return autorizados.has(numero)
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
  getSomaPorTipo, getUltimoLancamento, getUsuario, mesAtual, db,
} = await import("../src/database.js")

let sock

function prepararUsuario(id) {
  criarUsuario(id)
  atualizarUsuario(id, { nome: "Teste", aguardando_nome: 0 })
}

function ultimaResposta() {
  return sock.sendMessage.mock.calls.at(-1)?.[1]?.text
}

function chamadaDocumento() {
  return sock.sendMessage.mock.calls.find(([, payload]) => payload.document)
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
  configMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }
})

describe("processarMensagem - beta fechado", () => {
  it("permite usuário normalmente quando BETA_MODE=false", async () => {
    configMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }
    prepararUsuario("5511999999999")

    await processarMensagem(sock, "grupo", "5511999999999", "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("despesa registrada")
    expect(getUltimoLancamento("5511999999999").valor).toBe(35)
  })

  it("permite usuário normalmente quando BETA_MODE está ausente", async () => {
    delete configMock.config.beta
    prepararUsuario("5511999999999")

    await processarMensagem(sock, "grupo", "5511999999999", "recebi 2500 salario")

    expect(ultimaResposta()).toContain("entrada registrada")
    expect(getUltimoLancamento("5511999999999").tipo).toBe("entrada")
  })

  it("ignora silenciosamente número não autorizado com BETA_MODE=true", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }

    await processarMensagem(sock, "grupo", "5511888888888", "ajuda")

    expect(sock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5511888888888")).toBeNull()
  })

  it("responde beta fechado quando BETA_BLOCKED_REPLY=true", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: true, numerosAutorizados: ["5511999999999"] }

    await processarMensagem(sock, "grupo", "5511888888888", "ajuda")

    expect(ultimaResposta()).toContain("Este bot está em beta fechado")
    expect(ultimaResposta()).toContain("liberar seu número")
    expect(getUsuario("5511888888888")).toBeNull()
  })

  it("permite número autorizado com BETA_MODE=true", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }
    prepararUsuario("5511999999999")

    await processarMensagem(sock, "grupo", "5511999999999", "ajuda")

    expect(ultimaResposta()).toContain("assistente financeiro")
    expect(ultimaResposta()).toContain("gastei 35 no mercado")
  })

  it("permite número autorizado mesmo com sufixo do WhatsApp", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }
    const usuarioId = "5511999999999@s.whatsapp.net"
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("despesa registrada")
    expect(getUltimoLancamento(usuarioId).categoria).toBe("mercado")
  })

  it("número não autorizado não registra lançamento", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }
    const usuarioId = "5511777777777@s.whatsapp.net"

    await processarMensagem(sock, "grupo", usuarioId, "gastei 35 no mercado")

    expect(sock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario(usuarioId)).toBeNull()
    expect(getUltimoLancamento(usuarioId)).toBeNull()
  })
})

describe("processarMensagem - ajuda e onboarding", () => {
  it.each([
    "ajuda",
    "comandos",
    "como usar",
    "menu",
    "inicio",
    "início",
    "start",
  ])("responde ajuda para %s", async (mensagem) => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", mensagem)

    expect(ultimaResposta()).toContain("assistente financeiro")
    expect(ultimaResposta()).toContain("gastei 35 no mercado")
    expect(ultimaResposta()).toContain("exportar planilha")
  })

  it("responde mensagem útil quando não entende", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "banana azul")

    expect(ultimaResposta()).toContain("Não consegui entender essa mensagem")
    expect(ultimaResposta()).toContain("recebi 2500 salario")
    expect(ultimaResposta()).toContain("ajuda")
  })
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

describe("processarMensagem - exportação CSV", () => {
  it("envia CSV do usuário atual com categorias formatadas", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })
    inserirLancamento({ usuarioId: "user-a", tipo: "entrada", nome: "salario", categoria: "salario", valor: 2500, mes: mesAtual() })
    inserirLancamento({ usuarioId: "user-b", tipo: "gasto", nome: "uber", categoria: "transporte", valor: 99, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-a", "exportar csv")

    const [, documento] = chamadaDocumento()
    const csv = documento.document.toString("utf8")

    expect(documento.fileName).toMatch(/^extrato_usuario_[a-f0-9]{8}_\d{4}-\d{2}\.csv$/)
    expect(documento.mimetype).toBe("text/csv")
    expect(csv.split("\n")[0]).toBe("data,tipo,categoria,descricao,valor")
    expect(csv).toContain("despesa,Mercado,mercado,35.00")
    expect(csv).toContain("receita,Salário,salario,2500.00")
    expect(csv).not.toContain("uber")
    expect(ultimaResposta()).toContain("Sua planilha foi gerada com sucesso")
  })

  it("mantém exportar csv gerando CSV", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-a", "exportar csv")

    const [, documento] = chamadaDocumento()
    expect(documento.fileName).toMatch(/\.csv$/)
    expect(documento.mimetype).toBe("text/csv")
  })

  it("comando exportar planilha gera XLSX", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-a", "exportar planilha")

    const [, documento] = chamadaDocumento()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(documento.document)

    expect(documento.fileName).toMatch(/^controle_financeiro_teste_\d{4}-\d{2}\.xlsx$/)
    expect(documento.mimetype).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["Resumo", "Lancamentos"])
    expect(ultimaResposta()).toContain("Sua planilha Excel foi gerada com sucesso")
  })

  it("comando planilha bonita gera XLSX", async () => {
    prepararUsuario("user-a")
    inserirLancamento({ usuarioId: "user-a", tipo: "entrada", nome: "salario", categoria: "salario", valor: 2500, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-a", "planilha bonita")

    const [, documento] = chamadaDocumento()
    expect(documento.fileName).toMatch(/\.xlsx$/)
    expect(documento.mimetype).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  })

  it("usuário A não exporta dados do usuário B no XLSX", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })
    inserirLancamento({ usuarioId: "user-b", tipo: "gasto", nome: "uber", categoria: "transporte", valor: 99, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-a", "xlsx")

    const [, documento] = chamadaDocumento()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(documento.document)
    const valores = JSON.stringify(workbook.getWorksheet("Lancamentos").getSheetValues())

    expect(valores).toContain("mercado")
    expect(valores).not.toContain("uber")
  })

  it.each([
    "exportar",
    "exportar csv",
    "baixar planilha",
    "gerar planilha",
    "minha planilha",
    "exportar planilha",
    "planilha bonita",
    "planilha excel",
    "exportar excel",
    "xlsx",
    "exportar xlsx",
  ])("responde mensagem amigável sem lançamentos para %s", async (mensagem) => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", mensagem)

    expect(chamadaDocumento()).toBeUndefined()
    expect(ultimaResposta()).toContain("Você ainda não tem lançamentos para exportar")
    expect(ultimaResposta()).toContain("gastei 35 no mercado")
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
