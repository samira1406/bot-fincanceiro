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
      whatsappInteractiveEnabled: false,
      whatsappMenuMode:    "text",
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
  mascararIdentificadorBeta: configMock.mascararNumeroBeta,
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

const { handleRespostaCaixinha, processarMensagem } = await import("../src/commands.js")
const {
  criarUsuario, atualizarUsuario, inserirLancamento,
  criarOuAtualizarMetaCategoria,
  getSomaPorTipo, getUltimoLancamento, getUsuario, mesAtual, db,
} = await import("../src/database.js")
const {
  obterPendenciaLancamento,
  resetPendenciasLancamentoParaTestes,
} = await import("../src/pendingLancamentos.js")
const {
  obterMenuPendente,
  resetMenusPendentesParaTestes,
} = await import("../src/interactiveMessages.js")
const {
  obterRuntimeState,
  resetRuntimeStateParaTestes,
} = await import("../src/runtimeState.js")

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
  resetPendenciasLancamentoParaTestes()
  resetMenusPendentesParaTestes()
  resetRuntimeStateParaTestes()
  db.exec(`
    DELETE FROM metas_categoria;
    DELETE FROM lancamentos;
    DELETE FROM usuarios;
  `)
  sock = { sendMessage: vi.fn(), relayMessage: vi.fn() }
  configMock.config.whatsappInteractiveEnabled = false
  configMock.config.whatsappMenuMode = "text"
  configMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }
})

describe("processarMensagem - beta fechado", () => {
  it("permite usuário normalmente quando BETA_MODE=false", async () => {
    configMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }
    prepararUsuario("5511999999999")

    await processarMensagem(sock, "grupo", "5511999999999", "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("Despesa registrada")
    expect(getUltimoLancamento("5511999999999").valor).toBe(35)
  })

  it("permite usuário normalmente quando BETA_MODE está ausente", async () => {
    delete configMock.config.beta
    prepararUsuario("5511999999999")

    await processarMensagem(sock, "grupo", "5511999999999", "recebi 2500 salario")

    expect(ultimaResposta()).toContain("Receita registrada")
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

    expect(ultimaResposta()).toContain("MENU DO BOT FINANÇAS")
    expect(ultimaResposta()).toContain("gastei 35 no mercado")
  })

  it("permite número autorizado mesmo com sufixo do WhatsApp", async () => {
    configMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }
    const usuarioId = "5511999999999@s.whatsapp.net"
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("Despesa registrada")
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

    expect(ultimaResposta()).toContain("MENU DO BOT FINANÇAS")
    expect(ultimaResposta()).toContain("1.")
    expect(ultimaResposta()).toContain("7.")
    expect(ultimaResposta()).toContain("gastei 35 no mercado")
    expect(ultimaResposta()).toContain("exportar planilha")
  })

  it("responde mensagem útil quando não entende", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "banana azul")

    expect(ultimaResposta()).toContain("ainda não entendi direitinho")
    expect(ultimaResposta()).toContain("recebi 2500 salario")
    expect(ultimaResposta()).toContain("menu")
  })
})

describe("processarMensagem - fallback inteligente", () => {
  it("texto totalmente desconhecido retorna ajuda bonita sem registrar", async () => {
    prepararUsuario("user-fallback-geral")

    await processarMensagem(sock, "grupo", "user-fallback-geral", "banana azul")

    expect(getUltimoLancamento("user-fallback-geral")).toBeNull()
    expect(ultimaResposta()).toContain("Teste, ainda não entendi direitinho")
    expect(ultimaResposta()).toContain("mercado 35")
    expect(ultimaResposta()).toContain("menu")
  })

  it("categoria comum sem valor pede o valor", async () => {
    prepararUsuario("user-categoria-sem-valor")

    await processarMensagem(sock, "grupo", "user-categoria-sem-valor", "mercado")

    expect(getUltimoLancamento("user-categoria-sem-valor")).toBeNull()
    expect(ultimaResposta()).toContain("categoria Mercado")
    expect(ultimaResposta()).toContain("faltou o valor")
    expect(ultimaResposta()).toContain("mercado 35")
  })

  it.each([
    ["planiha", "planilha"],
    ["resumoo", "resumo"],
    ["hstoric", "historico"],
    ["ajdua", "ajuda"],
  ])("typo %s sugere %s sem registrar", async (mensagem, sugestao) => {
    const usuarioId = `user-typo-${mensagem}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, mensagem)

    expect(getUltimoLancamento(usuarioId)).toBeNull()
    expect(ultimaResposta()).toContain(`quis dizer “${sugestao}”`)
  })

  it.each([
    "obrigado",
    "valeu",
    "ok",
    "beleza",
  ])("%s recebe resposta amigável sem registrar", async (mensagem) => {
    const usuarioId = `user-agradecimento-${mensagem}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, mensagem)

    expect(getUltimoLancamento(usuarioId)).toBeNull()
    expect(ultimaResposta()).toContain("Por nada")
    expect(ultimaResposta()).toContain("resumo")
  })

  it("descrição financeira ambígua pergunta o tipo e usa os dados originais", async () => {
    prepararUsuario("user-descricao-ambigua")

    await processarMensagem(sock, "grupo", "user-descricao-ambigua", "300 manutenção")

    expect(getUltimoLancamento("user-descricao-ambigua")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-descricao-ambigua")).toMatchObject({
      etapa: "tipo",
      valor: 300,
      nome: "manutencao",
      categoria: "manutencao",
    })
    expect(ultimaResposta()).toContain("descrição “manutencao”")
    expect(ultimaResposta()).toContain("1 - Entrada")
    expect(ultimaResposta()).toContain("2 - Gasto")

    await processarMensagem(sock, "grupo", "user-descricao-ambigua", "2")

    expect(getUltimoLancamento("user-descricao-ambigua")).toMatchObject({
      tipo: "gasto",
      valor: 300,
      categoria: "manutencao",
    })
  })

  it("durante pendência de categoria resposta vaga relembra o que falta", async () => {
    prepararUsuario("user-pendencia-vaga")

    await processarMensagem(sock, "grupo", "user-pendencia-vaga", "1250")
    await processarMensagem(sock, "grupo", "user-pendencia-vaga", "2")
    await processarMensagem(sock, "grupo", "user-pendencia-vaga", "sei la")

    expect(getUltimoLancamento("user-pendencia-vaga")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-pendencia-vaga")).toMatchObject({
      etapa: "categoria",
      tipo: "gasto",
      valor: 1250,
    })
    expect(ultimaResposta()).toContain("categoria")
    expect(ultimaResposta()).toContain("gasto de R$ 1.250,00")
    expect(ultimaResposta()).toContain("cancelar")
  })

  it("aceita formatos monetários naturais sem registrar imediatamente", async () => {
    prepararUsuario("user-valor-flexivel")

    await processarMensagem(sock, "grupo", "user-valor-flexivel", "R$ 300")

    expect(getUltimoLancamento("user-valor-flexivel")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-valor-flexivel")).toMatchObject({
      valor: 300,
      etapa: "tipo",
    })
  })

  it("comando exemplos mostra sugestões rápidas", async () => {
    prepararUsuario("user-exemplos")

    await processarMensagem(sock, "grupo", "user-exemplos", "exemplos")

    expect(ultimaResposta()).toContain("Exemplos rápidos")
    expect(ultimaResposta()).toContain("paguei 50 internet")
    expect(ultimaResposta()).toContain("recebi 1250 em comissão")
  })

  it("registra somente o motivo do fallback no estado interno", async () => {
    prepararUsuario("user-evento-fallback")

    await processarMensagem(sock, "grupo", "user-evento-fallback", "banana azul")

    const evento = obterRuntimeState().eventos.find(item => item.tipo === "fallback_acionado")
    expect(evento.detalhes).toEqual({ motivo: "desconhecido_total" })
    expect(JSON.stringify(evento)).not.toContain("banana azul")
    expect(JSON.stringify(evento)).not.toContain("user-evento-fallback")
    expect(obterRuntimeState().bot.fallbacksAcionados).toBe(1)
  })

  it("cancelar também encerra a pendência da caixinha", async () => {
    prepararUsuario("user-caixinha-cancelar")
    atualizarUsuario("user-caixinha-cancelar", {
      aguardando_caixinha: 1,
      valor_sugerido_caixinha: 100,
      estado_expira_em: Date.now() + 60_000,
    })

    await handleRespostaCaixinha(
      sock,
      "grupo",
      "user-caixinha-cancelar",
      "Teste",
      "cancelar"
    )

    expect(getUsuario("user-caixinha-cancelar")).toMatchObject({
      aguardando_caixinha: 0,
      valor_sugerido_caixinha: 0,
      estado_expira_em: null,
    })
    expect(getUltimoLancamento("user-caixinha-cancelar")).toBeNull()
    expect(ultimaResposta()).toContain("cancelei esse fluxo")
  })
})

describe("processarMensagem - menu textual e interativo", () => {
  it("menu usa fallback textual e cria estado pendente por usuário", async () => {
    prepararUsuario("user-menu")

    await processarMensagem(sock, "grupo", "user-menu", "menu")

    expect(sock.relayMessage).not.toHaveBeenCalled()
    expect(ultimaResposta()).toContain("Responda com o número da opção")
    expect(ultimaResposta()).toContain("1. 💸 Registrar gasto")
    expect(ultimaResposta()).toContain("7. 📋 Ajuda completa")
    expect(obterMenuPendente("user-menu")).toMatchObject({ contexto: "principal" })
    expect(obterMenuPendente("outro-user")).toBeNull()
  })

  it("opção 1 após menu inicia orientação de gasto", async () => {
    prepararUsuario("user-menu-1")

    await processarMensagem(sock, "grupo", "user-menu-1", "menu")
    await processarMensagem(sock, "grupo", "user-menu-1", "1")

    expect(ultimaResposta()).toContain("Qual gasto você quer registrar")
    expect(ultimaResposta()).toContain("mercado 35")
    expect(obterMenuPendente("user-menu-1")).toBeNull()
  })

  it("opção 2 após menu inicia orientação de entrada", async () => {
    prepararUsuario("user-menu-2")

    await processarMensagem(sock, "grupo", "user-menu-2", "menu")
    await processarMensagem(sock, "grupo", "user-menu-2", "2")

    expect(ultimaResposta()).toContain("Qual entrada você quer registrar")
    expect(ultimaResposta()).toContain("recebi 2500 salario")
  })

  it("opção 3 após menu executa resumo", async () => {
    prepararUsuario("user-menu-3")

    await processarMensagem(sock, "grupo", "user-menu-3", "menu")
    await processarMensagem(sock, "grupo", "user-menu-3", "3")

    expect(ultimaResposta()).toContain("RESUMO")
    expect(ultimaResposta()).toContain("Saldo")
  })

  it("opção 4 após menu executa histórico", async () => {
    prepararUsuario("user-menu-4")
    inserirLancamento({
      usuarioId: "user-menu-4",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
      mes: mesAtual(),
    })

    await processarMensagem(sock, "grupo", "user-menu-4", "menu")
    await processarMensagem(sock, "grupo", "user-menu-4", "4")

    expect(ultimaResposta()).toContain("Últimos lançamentos")
    expect(ultimaResposta()).toContain("Mercado")
  })

  it("opção 5 após menu gera planilha", async () => {
    prepararUsuario("user-menu-5")
    inserirLancamento({
      usuarioId: "user-menu-5",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
      mes: mesAtual(),
    })

    await processarMensagem(sock, "grupo", "user-menu-5", "menu")
    await processarMensagem(sock, "grupo", "user-menu-5", "5")

    const [, documento] = chamadaDocumento()
    expect(documento.fileName).toMatch(/\.xlsx$/)
    expect(ultimaResposta()).toContain("planilha Excel foi gerada")
  })

  it("opção 6 abre menu de metas e suas opções funcionam", async () => {
    prepararUsuario("user-menu-6")

    await processarMensagem(sock, "grupo", "user-menu-6", "menu")
    await processarMensagem(sock, "grupo", "user-menu-6", "6")

    expect(ultimaResposta()).toContain("MENU DE METAS")
    expect(obterMenuPendente("user-menu-6")).toMatchObject({ contexto: "metas" })

    await processarMensagem(sock, "grupo", "user-menu-6", "1")
    expect(ultimaResposta()).toContain("Qual meta você quer criar")
    expect(ultimaResposta()).toContain("meta mercado 600")
  })

  it("opção 7 mostra ajuda completa", async () => {
    prepararUsuario("user-menu-7")

    await processarMensagem(sock, "grupo", "user-menu-7", "menu")
    await processarMensagem(sock, "grupo", "user-menu-7", "7")

    expect(ultimaResposta()).toContain("MENU DO BOT FINANÇAS")
    expect(ultimaResposta()).toContain("Corrigir ou excluir")
    expect(ultimaResposta()).toContain("corrigir ultimo para 45")
  })

  it("envia menu interativo quando a configuração está ativa", async () => {
    configMock.config.whatsappInteractiveEnabled = true
    configMock.config.whatsappMenuMode = "interactive"
    prepararUsuario("user-menu-interativo")

    await processarMensagem(sock, "grupo", "user-menu-interativo", "menu")

    expect(sock.relayMessage).toHaveBeenCalledOnce()
    expect(ultimaResposta()).toContain("menu texto")
  })

  it("menu texto força fallback mesmo no modo interativo", async () => {
    configMock.config.whatsappInteractiveEnabled = true
    configMock.config.whatsappMenuMode = "interactive"
    prepararUsuario("user-menu-texto")

    await processarMensagem(sock, "grupo", "user-menu-texto", "menu texto")

    expect(sock.relayMessage).not.toHaveBeenCalled()
    expect(ultimaResposta()).toContain("MENU DO BOT FINANÇAS")
    expect(ultimaResposta()).toContain("Responda com o número da opção")
  })

  it("cancelar sai do menu pendente sem executar opção", async () => {
    prepararUsuario("user-menu-cancelar")

    await processarMensagem(sock, "grupo", "user-menu-cancelar", "menu")
    await processarMensagem(sock, "grupo", "user-menu-cancelar", "cancelar")

    expect(obterMenuPendente("user-menu-cancelar")).toBeNull()
    expect(getUltimoLancamento("user-menu-cancelar")).toBeNull()
    expect(ultimaResposta()).toContain("saí desse menu")
  })

  it("pendência de valor ambíguo tem prioridade sobre opção de menu", async () => {
    prepararUsuario("user-menu-pendencia")

    await processarMensagem(sock, "grupo", "user-menu-pendencia", "1250")
    await processarMensagem(sock, "grupo", "user-menu-pendencia", "menu")
    await processarMensagem(sock, "grupo", "user-menu-pendencia", "2")

    expect(getUltimoLancamento("user-menu-pendencia")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-menu-pendencia")).toMatchObject({
      etapa: "categoria",
      tipo: "gasto",
      valor: 1250,
    })
    expect(ultimaResposta()).toContain("vou registrar como gasto")
    expect(ultimaResposta()).not.toContain("Qual entrada você quer registrar")
  })
})

describe("processarMensagem - aliases e valor ambíguo", () => {
  it.each([
    "saldo",
    "meu resumo",
    "resumo do mes",
    "resumo do mês",
  ])("usa %s como resumo", async (mensagem) => {
    prepararUsuario("user-alias-resumo")

    await processarMensagem(sock, "grupo", "user-alias-resumo", mensagem)

    expect(ultimaResposta()).toContain("RESUMO")
    expect(ultimaResposta()).toContain("Saldo")
  })

  it.each([
    "extrato",
    "ultimos",
    "últimos",
    "lancamentos",
    "lançamentos",
  ])("usa %s como histórico", async (mensagem) => {
    prepararUsuario("user-alias-historico")
    inserirLancamento({ usuarioId: "user-alias-historico", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-alias-historico", mensagem)

    expect(ultimaResposta()).toContain("Últimos lançamentos")
    expect(ultimaResposta()).toContain("Mercado")
  })

  it("não registra valor sozinho e pede o tipo", async () => {
    prepararUsuario("user-ambiguo")

    await processarMensagem(sock, "grupo", "user-ambiguo", "1250")

    expect(getUltimoLancamento("user-ambiguo")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-ambiguo")).toMatchObject({
      etapa: "tipo",
      valor: 1250,
      tipo: null,
    })
    expect(ultimaResposta()).toContain("R$ 1.250,00")
    expect(ultimaResposta()).toContain("1 - Entrada")
    expect(ultimaResposta()).toContain("2 - Gasto")
  })

  it("prioriza 2 como tipo da pendência e não como R$ 2,00", async () => {
    prepararUsuario("user-tipo-gasto")

    await processarMensagem(sock, "grupo", "user-tipo-gasto", "1250")
    await processarMensagem(sock, "grupo", "user-tipo-gasto", "2")

    expect(getUltimoLancamento("user-tipo-gasto")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-tipo-gasto")).toMatchObject({
      etapa: "categoria",
      valor: 1250,
      tipo: "gasto",
    })
    expect(ultimaResposta()).toContain("vou registrar como gasto")
    expect(ultimaResposta()).toContain("categoria ou descrição")
    expect(ultimaResposta()).not.toContain("R$ 2,00")
  })

  it("registra despesa com o valor original após 1250 + 2 + mercado", async () => {
    prepararUsuario("user-fluxo-gasto")

    await processarMensagem(sock, "grupo", "user-fluxo-gasto", "1250")
    await processarMensagem(sock, "grupo", "user-fluxo-gasto", "2")
    await processarMensagem(sock, "grupo", "user-fluxo-gasto", "mercado")

    expect(getUltimoLancamento("user-fluxo-gasto")).toMatchObject({
      tipo: "gasto",
      valor: 1250,
      categoria: "mercado",
      nome: "mercado",
    })
    expect(ultimaResposta()).toBe("Despesa registrada: R$ 1.250,00 em Mercado.")
    expect(obterPendenciaLancamento("grupo", "user-fluxo-gasto")).toBeNull()
  })

  it("registra receita com o valor original após 1250 + 1 + freelance", async () => {
    prepararUsuario("user-fluxo-entrada")

    await processarMensagem(sock, "grupo", "user-fluxo-entrada", "1250")
    await processarMensagem(sock, "grupo", "user-fluxo-entrada", "1")
    await processarMensagem(sock, "grupo", "user-fluxo-entrada", "freelance")

    expect(getUltimoLancamento("user-fluxo-entrada")).toMatchObject({
      tipo: "entrada",
      valor: 1250,
      categoria: "freelance",
      nome: "freelance",
    })
    expect(ultimaResposta()).toBe("Receita registrada: R$ 1.250,00 em Freelance.")
    expect(obterPendenciaLancamento("grupo", "user-fluxo-entrada")).toBeNull()
  })

  it.each([
    "cancelar",
    "cancela",
    "sair",
    "voltar",
  ])("%s cancela a pendência sem registrar", async (mensagem) => {
    const usuarioId = `user-cancelar-${mensagem}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "1250")
    await processarMensagem(sock, "grupo", usuarioId, mensagem)

    expect(getUltimoLancamento(usuarioId)).toBeNull()
    expect(obterPendenciaLancamento("grupo", usuarioId)).toBeNull()
    expect(ultimaResposta()).toContain("cancelei esse lançamento")
    expect(ultimaResposta()).toContain("Nenhum valor foi registrado")
  })

  it.each([
    "resumo",
    "ajuda",
    "planilha",
    "extrato",
  ])("comando %s não vira categoria e preserva a pendência", async (comando) => {
    const usuarioId = `user-comando-${comando}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "1250")
    await processarMensagem(sock, "grupo", usuarioId, "2")
    await processarMensagem(sock, "grupo", usuarioId, comando)

    expect(getUltimoLancamento(usuarioId)).toBeNull()
    expect(obterPendenciaLancamento("grupo", usuarioId)).toMatchObject({
      etapa: "categoria",
      valor: 1250,
      tipo: "gasto",
    })

    await processarMensagem(sock, "grupo", usuarioId, "mercado")
    expect(getUltimoLancamento(usuarioId)).toMatchObject({
      tipo: "gasto",
      valor: 1250,
      categoria: "mercado",
    })
  })

  it.each([
    "1",
    "entrada",
    "receita",
    "recebido",
    "ganho",
  ])("aceita %s como entrada durante a pendência", async (respostaTipo) => {
    const usuarioId = `user-entrada-${respostaTipo}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "1250")
    await processarMensagem(sock, "grupo", usuarioId, respostaTipo)
    await processarMensagem(sock, "grupo", usuarioId, "freelance")

    expect(getUltimoLancamento(usuarioId)).toMatchObject({
      tipo: "entrada",
      valor: 1250,
      categoria: "freelance",
    })
  })

  it.each([
    "2",
    "gasto",
    "despesa",
    "saida",
    "saída",
    "pago",
  ])("aceita %s como gasto durante a pendência", async (respostaTipo) => {
    const usuarioId = `user-gasto-${respostaTipo}`
    prepararUsuario(usuarioId)

    await processarMensagem(sock, "grupo", usuarioId, "1250")
    await processarMensagem(sock, "grupo", usuarioId, respostaTipo)
    await processarMensagem(sock, "grupo", usuarioId, "mercado")

    expect(getUltimoLancamento(usuarioId)).toMatchObject({
      tipo: "gasto",
      valor: 1250,
      categoria: "mercado",
    })
  })

  it("isola a pendência entre usuários", async () => {
    prepararUsuario("user-pendente-a")
    prepararUsuario("user-pendente-b")

    await processarMensagem(sock, "grupo", "user-pendente-a", "1250")
    await processarMensagem(sock, "grupo", "user-pendente-b", "mercado 10")

    expect(getUltimoLancamento("user-pendente-b")).toMatchObject({
      tipo: "gasto",
      valor: 10,
      categoria: "mercado",
    })
    expect(obterPendenciaLancamento("outro-chat", "user-pendente-a")).toMatchObject({
      etapa: "tipo",
      valor: 1250,
    })
    expect(obterPendenciaLancamento("grupo", "user-pendente-b")).toBeNull()
  })

  it.each([
    "oi",
    "ajuda",
    "resumo",
    "planilha",
  ])("não transforma %s em lançamento", async (mensagem) => {
    prepararUsuario("user-seguranca-parser")

    await processarMensagem(sock, "grupo", "user-seguranca-parser", mensagem)

    expect(getUltimoLancamento("user-seguranca-parser")).toBeNull()
  })
})

describe("processarMensagem - resumo com nome seguro", () => {
  it("usa fallback quando o nome salvo parece lançamento", async () => {
    criarUsuario("user-contaminado")
    atualizarUsuario("user-contaminado", { nome: "gastei 35 no mercado", aguardando_nome: 0 })
    inserirLancamento({ usuarioId: "user-contaminado", tipo: "entrada", nome: "salario", categoria: "salario", valor: 7000, mes: mesAtual() })
    inserirLancamento({ usuarioId: "user-contaminado", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-contaminado", "resumo")

    expect(ultimaResposta()).toContain("RESUMO DO MÊS")
    expect(ultimaResposta()).not.toContain("GASTEI 35 NO MERCADO")
    expect(ultimaResposta()).toContain("Entradas: R$ 7.000,00")
    expect(ultimaResposta()).toContain("Gastos:   R$ 35,00")
  })

  it("mantém nome válido no resumo", async () => {
    criarUsuario("user-sadu")
    atualizarUsuario("user-sadu", { nome: "Sadu", aguardando_nome: 0 })

    await processarMensagem(sock, "grupo", "user-sadu", "resumo")

    expect(ultimaResposta()).toContain("RESUMO — SADU")
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
    ["ganhei 1200 freelance", "Freelance"],
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
    expect(ultimaResposta()).toContain("Receita registrada")
    expect(ultimaResposta()).toContain(categoriaEsperada)
    expect(ultimo.tipo).toBe("entrada")
  })

  it.each([
    ["recebi 1250 em comissionamento", "Comissionamento"],
    ["Recebi 1250 em free", "Free"],
    ["recebi 1250 em freelance", "Freelance"],
    ["recebi 1250 de comissionamento", "Comissionamento"],
    ["recebi 1250 por consultoria", "Consultoria"],
    ["recebi 1250 referente a freela", "Freela"],
    ["comissao 1250", "Comissão"],
    ["comissão 1250", "Comissão"],
    ["pix 200", "Pix"],
  ])("registra receita natural %s", async (mensagem, categoriaEsperada) => {
    prepararUsuario("user-receita-natural")

    await processarMensagem(sock, "grupo", "user-receita-natural", mensagem)

    const ultimo = getUltimoLancamento("user-receita-natural")
    expect(ultimaResposta()).toContain("Receita registrada")
    expect(ultimaResposta()).toContain(categoriaEsperada)
    expect(ultimo.tipo).toBe("entrada")
  })

  it("mantém despesas antigas como despesa", async () => {
    prepararUsuario("user-a")

    await processarMensagem(sock, "grupo", "user-a", "gastei 35 no mercado")

    expect(ultimaResposta()).toContain("Despesa registrada")
    expect(getUltimoLancamento("user-a").tipo).toBe("gasto")
  })

  it.each([
    ["paguei 50 internet", "Internet", 50],
    ["comprei 20 padaria", "Padaria", 20],
    ["despesa 20 padaria", "Padaria", 20],
    ["saida 20 padaria", "Padaria", 20],
  ])("registra despesa natural %s", async (mensagem, categoriaEsperada, valor) => {
    prepararUsuario("user-despesa-natural")

    await processarMensagem(sock, "grupo", "user-despesa-natural", mensagem)

    const ultimo = getUltimoLancamento("user-despesa-natural")
    expect(ultimaResposta()).toContain("Despesa registrada")
    expect(ultimaResposta()).toContain(categoriaEsperada)
    expect(ultimo.tipo).toBe("gasto")
    expect(ultimo.valor).toBe(valor)
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

describe("processarMensagem - confirmacao de lancamento atual", () => {
  it("confirma gastei 10 no teste com valor e categoria atuais", async () => {
    prepararUsuario("user-confirmacao")

    await processarMensagem(sock, "grupo", "user-confirmacao", "gastei 10 no teste")

    expect(ultimaResposta()).toBe("Despesa registrada: R$ 10,00 em Teste.")
    expect(ultimaResposta()).not.toContain("Gastei 35 no mercado")
  })

  it("confirma gastei 35 no mercado com valor e categoria atuais", async () => {
    prepararUsuario("user-confirmacao")

    await processarMensagem(sock, "grupo", "user-confirmacao", "gastei 35 no mercado")

    expect(ultimaResposta()).toBe("Despesa registrada: R$ 35,00 em Mercado.")
  })

  it("nao contamina a segunda resposta com lancamento anterior", async () => {
    prepararUsuario("user-confirmacao")

    await processarMensagem(sock, "grupo", "user-confirmacao", "gastei 35 no mercado")
    await processarMensagem(sock, "grupo", "user-confirmacao", "gastei 10 no teste")

    expect(ultimaResposta()).toBe("Despesa registrada: R$ 10,00 em Teste.")
    expect(ultimaResposta()).not.toContain("Mercado")
    expect(ultimaResposta()).not.toContain("35")
  })

  it("mantem receita natural como receita", async () => {
    prepararUsuario("user-confirmacao")

    await processarMensagem(sock, "grupo", "user-confirmacao", "recebi 2500 salario")

    expect(ultimaResposta()).toBe("Receita registrada: R$ 2.500,00 em Salário.")
    expect(getUltimoLancamento("user-confirmacao").tipo).toBe("entrada")
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

  it.each([
    "planilha",
    "excel",
    "xlsx",
    "exportar",
  ])("alias %s gera XLSX", async (mensagem) => {
    prepararUsuario("user-alias-xlsx")
    inserirLancamento({ usuarioId: "user-alias-xlsx", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: mesAtual() })

    await processarMensagem(sock, "grupo", "user-alias-xlsx", mensagem)

    const [, documento] = chamadaDocumento()
    expect(documento.fileName).toMatch(/\.xlsx$/)
    expect(documento.mimetype).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
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
    "planilha",
    "excel",
    "exportar csv",
    "csv",
    "baixar csv",
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

    expect(ultimaResposta()).toContain("Despesa registrada")
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
