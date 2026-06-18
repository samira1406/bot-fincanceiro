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
  iniciarMenuPendente, obterMenuPendente,
  resetMenusPendentesParaTestes,
} = await import("../src/interactiveMessages.js")
const {
  iniciarPendenciaDemo, iniciarPendenciaEdicao,
  iniciarPendenciaExclusao, iniciarPendenciaReset,
  obterPendenciaDemo, obterPendenciaEdicao,
  obterPendenciaExclusao, obterPendenciaReset,
  resetPendenciasEdicaoParaTestes,
} = await import("../src/pendingEdits.js")
const {
  resetPendenciasBetaParaTestes,
} = await import("../src/pendingBeta.js")
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
  resetPendenciasEdicaoParaTestes()
  resetPendenciasBetaParaTestes()
  resetMenusPendentesParaTestes()
  resetRuntimeStateParaTestes()
  db.exec(`
    DELETE FROM feedback_beta;
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

  it.each([
    "feedback teste",
    "começar teste",
    "criar dados de teste",
    "limpar meus dados",
  ])("não autorizado não recebe resposta nem grava dados com %s", async (mensagem) => {
    configMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5511999999999"],
    }

    await processarMensagem(sock, "grupo", "5511888888888", mensagem)

    expect(sock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5511888888888")).toBeNull()
    expect(db.prepare(
      "SELECT COUNT(*) AS total FROM feedback_beta"
    ).get().total).toBe(0)
  })
})

describe("processarMensagem - fluxo do beta tester", () => {
  beforeEach(() => {
    configMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5511999999999"],
    }
    prepararUsuario("5511999999999")
  })

  it.each([
    "começar teste",
    "iniciar beta",
    "primeiro uso",
    "tutorial",
    "como testar",
  ])("%s mostra tutorial para usuário autorizado", async (mensagem) => {
    await processarMensagem(sock, "grupo", "5511999999999", mensagem)

    expect(ultimaResposta()).toContain("BEM-VINDO AO BETA")
    expect(ultimaResposta()).toContain("recebi 2500 salario")
    expect(ultimaResposta()).toContain("reportar erro")
  })

  it.each([
    "checklist beta",
    "roteiro beta",
    "teste guiado",
    "passo a passo",
  ])("%s mostra roteiro guiado", async (mensagem) => {
    await processarMensagem(sock, "grupo", "5511999999999", mensagem)

    expect(ultimaResposta()).toContain("CHECKLIST DE TESTE")
    expect(ultimaResposta()).toContain("[ ] 7. Gerar planilha")
  })

  it("feedback salva conteúdo sem registrar despesa", async () => {
    await processarMensagem(
      sock,
      "grupo",
      "5511999999999",
      "feedback mercado 35"
    )

    expect(ultimaResposta()).toContain("feedback foi registrado")
    expect(getUltimoLancamento("5511999999999")).toBeNull()
    expect(db.prepare("SELECT * FROM feedback_beta").get()).toMatchObject({
      usuario_id: "5511999999999",
      tipo: "feedback",
      texto: "mercado 35",
      status: "novo",
    })
  })

  it("feedback sem texto pede mensagem completa", async () => {
    await processarMensagem(sock, "grupo", "5511999999999", "feedback")

    expect(ultimaResposta()).toContain("feedback achei fácil")
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)
  })

  it("reportar erro salva bug estruturado", async () => {
    await processarMensagem(
      sock,
      "grupo",
      "5511999999999",
      "reportar erro fechamento bugou"
    )

    expect(ultimaResposta()).toContain("Registrei esse erro")
    expect(db.prepare("SELECT * FROM feedback_beta").get()).toMatchObject({
      tipo: "bug",
      texto: "fechamento bugou",
      contexto: "whatsapp",
    })
  })

  it("bug sem texto pede descrição", async () => {
    await processarMensagem(sock, "grupo", "5511999999999", "bug")

    expect(ultimaResposta()).toContain("Descreva o erro")
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)
  })

  it("avaliação coleta nota e comentário sem criar lançamento", async () => {
    await processarMensagem(sock, "grupo", "5511999999999", "avaliar beta")
    expect(ultimaResposta()).toContain("0 a 10")

    await processarMensagem(sock, "grupo", "5511999999999", "8")
    expect(ultimaResposta()).toContain("principal motivo")
    expect(getUltimoLancamento("5511999999999")).toBeNull()

    await processarMensagem(
      sock,
      "grupo",
      "5511999999999",
      "gostei mas falta áudio"
    )

    expect(ultimaResposta()).toContain("Avaliação registrada")
    expect(db.prepare("SELECT * FROM feedback_beta").get()).toMatchObject({
      tipo: "avaliacao",
      nota: 8,
      texto: "gostei mas falta áudio",
    })
    expect(getUltimoLancamento("5511999999999")).toBeNull()
  })

  it("recusa nota fora de 0 a 10 e mantém avaliação pendente", async () => {
    await processarMensagem(sock, "grupo", "5511999999999", "nota beta")
    await processarMensagem(sock, "grupo", "5511999999999", "15")

    expect(ultimaResposta()).toContain("nota inteira de 0 a 10")
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)
  })

  it("cancelar encerra avaliação sem salvar", async () => {
    await processarMensagem(sock, "grupo", "5511999999999", "dar nota")
    await processarMensagem(sock, "grupo", "5511999999999", "cancelar")

    expect(ultimaResposta()).toContain("Avaliação cancelada")
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)
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
    "gastei 35 no mercado",
    "mercado 35",
    "recebi 2500 salario",
  ])("não usa frase com novo valor como categoria: %s", async (mensagem) => {
    prepararUsuario("user-categoria-com-valor")

    await processarMensagem(sock, "grupo", "user-categoria-com-valor", "1")
    await processarMensagem(sock, "grupo", "user-categoria-com-valor", "2")
    await processarMensagem(sock, "grupo", "user-categoria-com-valor", mensagem)

    expect(getUltimoLancamento("user-categoria-com-valor")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-categoria-com-valor"))
      .toMatchObject({ etapa: "categoria", valor: 1, tipo: "gasto" })
    expect(ultimaResposta()).toContain("envie apenas a categoria")
    expect(ultimaResposta()).toContain("R$ 1,00")
  })

  it.each([
    "editar lançamento",
    "excluir lançamento 2",
    "limpar meus dados",
    "criar dados de teste",
  ])("orienta cancelar antes do comando %s", async (comando) => {
    prepararUsuario("user-pendencia-bloqueia-comando")

    await processarMensagem(sock, "grupo", "user-pendencia-bloqueia-comando", "300")
    await processarMensagem(sock, "grupo", "user-pendencia-bloqueia-comando", comando)

    expect(ultimaResposta()).toContain("Você tem um lançamento pendente")
    expect(ultimaResposta()).toContain("Mande cancelar")
    expect(getUltimoLancamento("user-pendencia-bloqueia-comando")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-pendencia-bloqueia-comando"))
      .toMatchObject({ valor: 300, etapa: "tipo" })
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
    ["recebi 1250 em comissionamento", "Comissão"],
    ["Recebi 1250 em free", "Freelance"],
    ["recebi 1250 em freelance", "Freelance"],
    ["recebi 1250 de comissionamento", "Comissão"],
    ["recebi 1250 por consultoria", "Consultoria"],
    ["recebi 1250 referente a freela", "Freelance"],
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
    ["comprei 20 padaria", "Alimentação", 20],
    ["despesa 20 padaria", "Alimentação", 20],
    ["saida 20 padaria", "Alimentação", 20],
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
  it("excluir último pede confirmação e não apaga lançamento de outro usuário", async () => {
    prepararUsuario("user-a")
    prepararUsuario("user-b")
    inserirLancamento({ usuarioId: "user-a", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })
    inserirLancamento({ usuarioId: "user-b", tipo: "gasto", nome: "uber", categoria: "transporte", valor: 20, mes: "6-2026" })

    await processarMensagem(sock, "grupo", "user-a", "excluir último")

    expect(ultimaResposta()).toContain("Tem certeza que deseja excluir?")
    expect(getUltimoLancamento("user-a")).not.toBeNull()

    await processarMensagem(sock, "grupo", "user-a", "1")

    expect(ultimaResposta()).toContain("Lançamento excluído com sucesso")
    expect(getUltimoLancamento("user-a")).toBeNull()
    expect(getUltimoLancamento("user-b").nome).toBe("uber")
  })
})

describe("processarMensagem - edição avançada", () => {
  it.each([
    "mudar meu nome para Sadu",
    "corrigir meu nome para Sadu",
    "me chame de Sadu",
    "alterar nome para Sadu",
  ])("%s atualiza somente o nome do usuário atual", async (mensagem) => {
    prepararUsuario("user-nome-a")
    prepararUsuario("user-nome-b")

    await processarMensagem(sock, "grupo", "user-nome-a", mensagem)

    expect(ultimaResposta()).toBe(
      "Pronto, vou te chamar de Sadu a partir de agora."
    )
    expect(getUsuario("user-nome-a").nome).toBe("Sadu")
    expect(getUsuario("user-nome-b").nome).toBe("Teste")
  })

  it("editar lançamento lista somente os itens do usuário atual", async () => {
    prepararUsuario("user-edicao-a")
    prepararUsuario("user-edicao-b")
    inserirLancamento({
      usuarioId: "user-edicao-a",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })
    inserirLancamento({
      usuarioId: "user-edicao-b",
      tipo: "gasto",
      nome: "segredo",
      categoria: "segredo",
      valor: 999,
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-edicao-a",
      "editar lançamento"
    )

    expect(ultimaResposta()).toContain("Escolha qual lançamento quer editar")
    expect(ultimaResposta()).toContain("Mercado")
    expect(ultimaResposta()).not.toContain("Segredo")
    expect(ultimaResposta()).not.toContain("999,00")
  })

  it("editar lançamento -> 2 -> 1 -> 18,90 atualiza somente o item escolhido", async () => {
    prepararUsuario("user-edicao-lista")
    const idAntigo = inserirLancamento({
      usuarioId: "user-edicao-lista",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })
    const idEscolhido = inserirLancamento({
      usuarioId: "user-edicao-lista",
      tipo: "gasto",
      nome: "uber",
      categoria: "transporte",
      valor: 12.5,
    })
    const idRecente = inserirLancamento({
      usuarioId: "user-edicao-lista",
      tipo: "entrada",
      nome: "freelance",
      categoria: "freelance",
      valor: 1250,
    })

    await processarMensagem(sock, "grupo", "user-edicao-lista", "editar lançamento")
    await processarMensagem(sock, "grupo", "user-edicao-lista", "2")
    expect(ultimaResposta()).toContain("Transporte")
    await processarMensagem(sock, "grupo", "user-edicao-lista", "1")
    expect(ultimaResposta()).toBe("Qual é o novo valor?")
    await processarMensagem(sock, "grupo", "user-edicao-lista", "18,90")

    expect(ultimaResposta()).toContain("Valor atualizado para R$ 18,90")
    expect(db.prepare("SELECT valor FROM lancamentos WHERE id = ?").get(idEscolhido).valor)
      .toBe(18.9)
    expect(db.prepare("SELECT valor FROM lancamentos WHERE id = ?").get(idAntigo).valor)
      .toBe(35)
    expect(db.prepare("SELECT valor FROM lancamentos WHERE id = ?").get(idRecente).valor)
      .toBe(1250)
  })

  it("corrige diretamente categoria, tipo, descrição e data do último", async () => {
    prepararUsuario("user-edicao-direta")
    inserirLancamento({
      usuarioId: "user-edicao-direta",
      tipo: "gasto",
      nome: "teste",
      categoria: "geral",
      valor: 30,
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-edicao-direta",
      "corrigir categoria do último para mercado"
    )
    expect(getUltimoLancamento("user-edicao-direta").categoria).toBe("mercado")
    expect(ultimaResposta()).toContain("Categoria atualizada para Mercado")

    await processarMensagem(
      sock,
      "grupo",
      "user-edicao-direta",
      "mudar último para entrada"
    )
    expect(getUltimoLancamento("user-edicao-direta").tipo).toBe("entrada")

    await processarMensagem(
      sock,
      "grupo",
      "user-edicao-direta",
      "corrigir descrição do ultimo para almoço com cliente"
    )
    expect(getUltimoLancamento("user-edicao-direta").nome)
      .toBe("almoco-com-cliente")

    await processarMensagem(
      sock,
      "grupo",
      "user-edicao-direta",
      "corrigir data do ultimo para ontem"
    )
    const data = new Date(getUltimoLancamento("user-edicao-direta").criado_em)
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    expect(data.toDateString()).toBe(ontem.toDateString())
  })

  it("alterar último para 45 preserva o usuário e atualiza somente o valor", async () => {
    prepararUsuario("user-alterar-ultimo")
    inserirLancamento({
      usuarioId: "user-alterar-ultimo",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-alterar-ultimo",
      "alterar último para 45"
    )

    expect(getUltimoLancamento("user-alterar-ultimo")).toMatchObject({
      usuario_id: "user-alterar-ultimo",
      valor: 45,
      categoria: "mercado",
    })
  })
})

describe("processarMensagem - exclusão por item", () => {
  function prepararListaExclusao(usuarioId) {
    const ids = []
    ids.push(inserirLancamento({
      usuarioId,
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    }))
    ids.push(inserirLancamento({
      usuarioId,
      tipo: "gasto",
      nome: "uber",
      categoria: "transporte",
      valor: 12.5,
    }))
    ids.push(inserirLancamento({
      usuarioId,
      tipo: "gasto",
      nome: "ifood",
      categoria: "alimentacao",
      valor: 45,
    }))
    return ids
  }

  it("excluir lançamento 2 pede confirmação antes de excluir", async () => {
    prepararUsuario("user-excluir-item")
    const ids = prepararListaExclusao("user-excluir-item")

    await processarMensagem(
      sock,
      "grupo",
      "user-excluir-item",
      "excluir lançamento 2"
    )

    expect(ultimaResposta()).toContain("Tem certeza que deseja excluir?")
    expect(ultimaResposta()).toContain("Transporte")
    expect(db.prepare("SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?")
      .get("user-excluir-item").total).toBe(3)
    expect(db.prepare("SELECT id FROM lancamentos WHERE id = ?").get(ids[1])).toBeTruthy()
  })

  it("cancelar mantém todos os lançamentos", async () => {
    prepararUsuario("user-excluir-cancelar")
    prepararListaExclusao("user-excluir-cancelar")

    await processarMensagem(
      sock,
      "grupo",
      "user-excluir-cancelar",
      "excluir lançamento 2"
    )
    await processarMensagem(sock, "grupo", "user-excluir-cancelar", "cancelar")

    expect(ultimaResposta()).toBe("Tudo certo. Nada foi excluído.")
    expect(db.prepare("SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?")
      .get("user-excluir-cancelar").total).toBe(3)
  })

  it("confirmar exclui somente o item escolhido", async () => {
    prepararUsuario("user-excluir-confirmar")
    const ids = prepararListaExclusao("user-excluir-confirmar")

    await processarMensagem(
      sock,
      "grupo",
      "user-excluir-confirmar",
      "deletar item 2"
    )
    await processarMensagem(sock, "grupo", "user-excluir-confirmar", "1")

    expect(ultimaResposta()).toBe("Lançamento excluído com sucesso.")
    expect(db.prepare("SELECT id FROM lancamentos WHERE id = ?").get(ids[1]))
      .toBeUndefined()
    expect(db.prepare("SELECT id FROM lancamentos WHERE id = ?").get(ids[0]))
      .toBeTruthy()
    expect(db.prepare("SELECT id FROM lancamentos WHERE id = ?").get(ids[2]))
      .toBeTruthy()
  })
})

describe("processarMensagem - reset seguro do usuário", () => {
  it("pede confirmação forte e não aceita frase aproximada", async () => {
    prepararUsuario("user-reset-forte")
    inserirLancamento({
      usuarioId: "user-reset-forte",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })

    await processarMensagem(sock, "grupo", "user-reset-forte", "limpar meus dados")
    expect(ultimaResposta()).toContain("CONFIRMAR RESET")
    expect(getUltimoLancamento("user-reset-forte")).not.toBeNull()

    await processarMensagem(sock, "grupo", "user-reset-forte", "confirmar reset")
    expect(ultimaResposta()).toContain("responda exatamente")
    expect(getUltimoLancamento("user-reset-forte")).not.toBeNull()
  })

  it("cancelar não apaga nada", async () => {
    prepararUsuario("user-reset-cancelar")
    inserirLancamento({
      usuarioId: "user-reset-cancelar",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })

    await processarMensagem(sock, "grupo", "user-reset-cancelar", "reset teste")
    await processarMensagem(sock, "grupo", "user-reset-cancelar", "cancelar")

    expect(ultimaResposta()).toBe("Reset cancelado. Nada foi apagado.")
    expect(getUltimoLancamento("user-reset-cancelar")).not.toBeNull()
  })

  it("CONFIRMAR RESET apaga lançamentos e metas somente do usuário atual", async () => {
    prepararUsuario("user-reset-a")
    prepararUsuario("user-reset-b")
    inserirLancamento({
      usuarioId: "user-reset-a",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })
    inserirLancamento({
      usuarioId: "user-reset-b",
      tipo: "gasto",
      nome: "uber",
      categoria: "transporte",
      valor: 50,
    })
    const { mes, ano } = periodoAtualTeste()
    criarOuAtualizarMetaCategoria("user-reset-a", "mercado", 600, mes, ano)

    await processarMensagem(sock, "grupo", "user-reset-a", "limpar meus dados")
    await processarMensagem(sock, "grupo", "user-reset-a", "CONFIRMAR RESET")

    expect(ultimaResposta()).toBe("Seus dados financeiros foram limpos com sucesso.")
    expect(getUltimoLancamento("user-reset-a")).toBeNull()
    expect(getUsuario("user-reset-a")).toMatchObject({
      nome: "Teste",
      aguardando_nome: 0,
    })
    expect(db.prepare("SELECT COUNT(*) AS total FROM metas_categoria WHERE usuario_id = ?")
      .get("user-reset-a").total).toBe(0)
    expect(getUltimoLancamento("user-reset-b").nome).toBe("uber")
  })

  it("pendência de reset impede números de virarem lançamentos", async () => {
    prepararUsuario("user-reset-prioridade")

    await processarMensagem(
      sock,
      "grupo",
      "user-reset-prioridade",
      "limpar meus dados"
    )
    await processarMensagem(sock, "grupo", "user-reset-prioridade", "1250")

    expect(ultimaResposta()).toContain("CONFIRMAR RESET")
    expect(getUltimoLancamento("user-reset-prioridade")).toBeNull()
    expect(obterPendenciaLancamento("grupo", "user-reset-prioridade")).toBeNull()
  })

  it("reset é alias seguro e inicia confirmação forte", async () => {
    prepararUsuario("user-reset-alias")

    await processarMensagem(sock, "grupo", "user-reset-alias", "reset")

    expect(ultimaResposta()).toContain("CONFIRMAR RESET")
    expect(getUltimoLancamento("user-reset-alias")).toBeNull()
  })
})

describe("processarMensagem - dados de exemplo", () => {
  it("pede confirmação e cria dados apenas para o usuário atual", async () => {
    prepararUsuario("user-demo-a")
    prepararUsuario("user-demo-b")

    await processarMensagem(sock, "grupo", "user-demo-a", "criar dados de teste")
    expect(ultimaResposta()).toContain("1 - Criar dados de exemplo")
    expect(db.prepare("SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?")
      .get("user-demo-a").total).toBe(0)

    await processarMensagem(sock, "grupo", "user-demo-a", "1")

    expect(ultimaResposta()).toContain("Dados de exemplo criados")
    expect(db.prepare("SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?")
      .get("user-demo-a").total).toBe(7)
    expect(db.prepare("SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?")
      .get("user-demo-b").total).toBe(0)
    expect(db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ? AND tags = 'dado_exemplo'"
    ).get("user-demo-a").total).toBe(7)
  })

  it("avisa sobre duplicação antes de criar novamente", async () => {
    prepararUsuario("user-demo-duplicado")

    await processarMensagem(sock, "grupo", "user-demo-duplicado", "demo dados")
    await processarMensagem(sock, "grupo", "user-demo-duplicado", "1")
    const antes = db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?"
    ).get("user-demo-duplicado").total

    await processarMensagem(
      sock,
      "grupo",
      "user-demo-duplicado",
      "gerar dados de exemplo"
    )

    expect(ultimaResposta()).toContain("Já existem dados de exemplo recentes")
    expect(db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?"
    ).get("user-demo-duplicado").total).toBe(antes)
  })

  it("consultas e fechamento funcionam após criar a demonstração", async () => {
    prepararUsuario("user-demo-consultas")

    await processarMensagem(sock, "grupo", "user-demo-consultas", "popular teste")
    await processarMensagem(sock, "grupo", "user-demo-consultas", "1")
    await processarMensagem(
      sock,
      "grupo",
      "user-demo-consultas",
      "quanto gastei com mercado?"
    )
    expect(ultimaResposta()).toBe(
      "Você gastou R$ 180,00 em Mercado neste mês."
    )

    await processarMensagem(sock, "grupo", "user-demo-consultas", "fechamento")
    expect(ultimaResposta()).toContain("FECHAMENTO DO MÊS")
    expect(ultimaResposta()).toContain("Entradas: R$ 3.750,00")
    expect(ultimaResposta()).toContain("Gastos: R$ 407,40")
  })
})

describe("processarMensagem - cancelar tudo", () => {
  it("limpa todas as pendências e menu sem apagar lançamentos", async () => {
    prepararUsuario("user-cancelar-tudo")
    inserirLancamento({
      usuarioId: "user-cancelar-tudo",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
    })

    await processarMensagem(sock, "grupo", "user-cancelar-tudo", "300")
    iniciarPendenciaEdicao("user-cancelar-tudo", {
      etapa: "escolher_item",
      itens: [1],
    })
    iniciarPendenciaExclusao("user-cancelar-tudo", { lancamentoId: 1 })
    iniciarPendenciaReset("user-cancelar-tudo")
    iniciarPendenciaDemo("user-cancelar-tudo")
    iniciarMenuPendente("user-cancelar-tudo")
    atualizarUsuario("user-cancelar-tudo", {
      aguardando_caixinha: 1,
      valor_sugerido_caixinha: 10,
      estado_expira_em: Date.now() + 60_000,
    })

    await processarMensagem(sock, "grupo", "user-cancelar-tudo", "cancelar tudo")

    expect(ultimaResposta()).toBe(
      "Cancelei as ações pendentes. Nenhum dado foi apagado."
    )
    expect(obterPendenciaLancamento("grupo", "user-cancelar-tudo")).toBeNull()
    expect(obterPendenciaEdicao("user-cancelar-tudo")).toBeNull()
    expect(obterPendenciaExclusao("user-cancelar-tudo")).toBeNull()
    expect(obterPendenciaReset("user-cancelar-tudo")).toBeNull()
    expect(obterPendenciaDemo("user-cancelar-tudo")).toBeNull()
    expect(obterMenuPendente("user-cancelar-tudo")).toBeNull()
    expect(getUsuario("user-cancelar-tudo")).toMatchObject({
      aguardando_caixinha: 0,
      valor_sugerido_caixinha: 0,
      estado_expira_em: null,
    })
    expect(getUltimoLancamento("user-cancelar-tudo")).toMatchObject({
      valor: 35,
      categoria: "mercado",
    })
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

describe("processarMensagem - consultas financeiras inteligentes", () => {
  it("consulta gasto por categoria sem registrar uma nova despesa", async () => {
    prepararUsuario("user-consulta")
    inserirLancamento({
      usuarioId: "user-consulta",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 850,
      mes: mesAtual(),
    })
    const antes = db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?"
    ).get("user-consulta").total

    await processarMensagem(
      sock,
      "grupo",
      "user-consulta",
      "quanto gastei com mercado?"
    )

    const depois = db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?"
    ).get("user-consulta").total
    expect(ultimaResposta()).toBe(
      "Você gastou R$ 850,00 em Mercado neste mês."
    )
    expect(depois).toBe(antes)
  })

  it("consulta gasto total de hoje", async () => {
    prepararUsuario("user-hoje")
    inserirLancamento({
      usuarioId: "user-hoje",
      tipo: "gasto",
      nome: "ifood",
      categoria: "ifood",
      valor: 45,
      mes: mesAtual(),
    })

    await processarMensagem(sock, "grupo", "user-hoje", "quanto gastei hoje?")

    expect(ultimaResposta()).toBe("Você gastou R$ 45,00 hoje.")
  })

  it("consulta receitas da categoria freelance", async () => {
    prepararUsuario("user-freelance")
    inserirLancamento({
      usuarioId: "user-freelance",
      tipo: "entrada",
      nome: "freela",
      categoria: "freela",
      valor: 2450,
      mes: mesAtual(),
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-freelance",
      "quanto recebi de freelance?"
    )

    expect(ultimaResposta()).toBe(
      "Você recebeu R$ 2.450,00 em Freelance neste mês."
    )
  })

  it("retorna o maior gasto do mês", async () => {
    prepararUsuario("user-maior")
    inserirLancamento({
      usuarioId: "user-maior",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 500,
      mes: mesAtual(),
    })
    inserirLancamento({
      usuarioId: "user-maior",
      tipo: "gasto",
      nome: "uber",
      categoria: "uber",
      valor: 120,
      mes: mesAtual(),
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-maior",
      "qual meu maior gasto?"
    )

    expect(ultimaResposta()).toContain("Seu maior gasto neste mês foi:")
    expect(ultimaResposta()).toContain("Mercado - R$ 500,00")
  })

  it.each(["onde gastei mais?", "top categorias", "gastos por categoria"])(
    "%s retorna ranking de categorias",
    async (mensagem) => {
      prepararUsuario("user-ranking")
      inserirLancamento({
        usuarioId: "user-ranking",
        tipo: "gasto",
        nome: "mercado",
        categoria: "mercado",
        valor: 300,
        mes: mesAtual(),
      })
      inserirLancamento({
        usuarioId: "user-ranking",
        tipo: "gasto",
        nome: "uber",
        categoria: "uber",
        valor: 100,
        mes: mesAtual(),
      })

      await processarMensagem(sock, "grupo", "user-ranking", mensagem)

      expect(ultimaResposta()).toContain("1. Mercado: R$ 300,00")
      expect(ultimaResposta()).toContain("2. Transporte: R$ 100,00")
    }
  )

  it("não mistura dados de usuários diferentes", async () => {
    prepararUsuario("user-consulta-a")
    prepararUsuario("user-consulta-b")
    inserirLancamento({
      usuarioId: "user-consulta-b",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 999,
      mes: mesAtual(),
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-consulta-a",
      "quanto gastei com mercado?"
    )

    expect(ultimaResposta()).toBe(
      "Não encontrei gastos em Mercado neste mês."
    )
  })

  it("orienta sem registrar quando a pergunta financeira é vaga", async () => {
    prepararUsuario("user-vaga")

    await processarMensagem(sock, "grupo", "user-vaga", "quanto foi?")

    expect(ultimaResposta()).toContain("Posso te ajudar com consultas como")
    expect(getUltimoLancamento("user-vaga")).toBeNull()
  })

  it("retorna mensagem amigável quando não há dados no período", async () => {
    prepararUsuario("user-sem-dados")

    await processarMensagem(
      sock,
      "grupo",
      "user-sem-dados",
      "quanto gastei hoje?"
    )

    expect(ultimaResposta()).toContain(
      "Ainda não encontrei lançamentos para esse período."
    )
  })
})

describe("processarMensagem - fechamento mensal", () => {
  it.each([
    "fechamento",
    "fechamento do mes",
    "fechamento do mês",
    "analise meu mes",
    "analise meu mês",
    "relatorio mensal",
    "relatório mensal",
  ])("%s gera o fechamento completo", async (mensagem) => {
    prepararUsuario("user-fechamento")
    inserirLancamento({
      usuarioId: "user-fechamento",
      tipo: "entrada",
      nome: "salario",
      categoria: "salario",
      valor: 7200,
      mes: mesAtual(),
    })
    inserirLancamento({
      usuarioId: "user-fechamento",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 850,
      mes: mesAtual(),
    })
    inserirLancamento({
      usuarioId: "user-fechamento",
      tipo: "gasto",
      nome: "uber",
      categoria: "uber",
      valor: 220,
      mes: mesAtual(),
    })

    await processarMensagem(
      sock,
      "grupo",
      "user-fechamento",
      mensagem
    )

    expect(ultimaResposta()).toContain("FECHAMENTO DO MÊS")
    expect(ultimaResposta()).toContain("Entradas: R$ 7.200,00")
    expect(ultimaResposta()).toContain("Gastos: R$ 1.070,00")
    expect(ultimaResposta()).toContain("1. Mercado: R$ 850,00")
    expect(ultimaResposta()).toContain("Você está positivo no mês.")
    expect(ultimaResposta()).toContain(
      "Seu maior ponto de atenção foi Mercado."
    )
  })

  it("retorna orientação quando o mês ainda não tem lançamentos", async () => {
    prepararUsuario("user-fechamento-vazio")

    await processarMensagem(
      sock,
      "grupo",
      "user-fechamento-vazio",
      "fechamento"
    )

    expect(ultimaResposta()).toContain(
      "Ainda não encontrei lançamentos para esse período."
    )
  })
})
