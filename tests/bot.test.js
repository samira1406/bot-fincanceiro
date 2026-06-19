import { beforeEach, describe, expect, it, vi } from "vitest"

const botMock = vi.hoisted(() => {
  const normalizarNumeroWhatsApp = (valor) =>
    String(valor ?? "").split("@")[0].split(":")[0].replace(/\D/g, "")

  const normalizarJidBeta = (valor) => {
    const texto = String(valor ?? "").trim().toLowerCase()
    if (!texto) return ""
    const [antesArroba, depoisArroba] = texto.split("@")
    if (!depoisArroba) return texto
    const usuario = antesArroba.split(":")[0].replace(/\s+/g, "")
    return `${usuario}@${depoisArroba}`
  }

  const gerarVariantesNumeroBrasil = (valor) => {
    const numero = normalizarNumeroWhatsApp(valor)
    if (!numero) return []

    const variantes = new Set([numero])
    const candidatosLocais = new Set()

    if (numero.startsWith("55") && (numero.length === 12 || numero.length === 13)) {
      candidatosLocais.add(numero.slice(2))
    }

    if (numero.length === 10 || numero.length === 11) {
      candidatosLocais.add(numero)
    }

    for (const local of [...candidatosLocais]) {
      variantes.add(local)
      variantes.add(`55${local}`)

      if (local.length === 11 && local[2] === "9" && /[6-9]/.test(local[3] ?? "")) {
        const semNono = local.slice(0, 2) + local.slice(3)
        variantes.add(semNono)
        variantes.add(`55${semNono}`)
      }

      if (local.length === 10 && /[6-9]/.test(local[2] ?? "")) {
        const comNono = `${local.slice(0, 2)}9${local.slice(2)}`
        variantes.add(comNono)
        variantes.add(`55${comNono}`)
      }
    }

    return [...variantes]
  }

  const mascararNumeroBeta = (valor) => {
    const numero = normalizarNumeroWhatsApp(valor)
    if (!numero) return ""
    if (numero.length <= 8) return "****"
    return `${numero.slice(0, 5)}****${numero.slice(-4)}`
  }

  const mascararIdentificadorBeta = (valor) => {
    const jid = normalizarJidBeta(valor)
    const numero = normalizarNumeroWhatsApp(valor)
    if (numero.length >= 9) {
      const sufixo = jid.includes("@") ? `@${jid.split("@").at(-1)}` : ""
      return `${mascararNumeroBeta(numero)}${sufixo}`
    }
    if (jid.includes("@")) return `****@${jid.split("@").at(-1)}`
    return jid ? "****" : ""
  }

  const avaliarAutorizacaoBetaCandidatos = (
    { candidateJids = [], normalizedNumbers = [] } = {},
    beta
  ) => {
    const jidsCandidatos = [...new Set(
      candidateJids
        .map(normalizarJidBeta)
        .filter(jid => jid && !jid.endsWith("@g.us"))
    )]
    const numerosCandidatos = [...new Set(
      normalizedNumbers.flatMap(gerarVariantesNumeroBrasil)
    )]
    const numerosAutorizados = [...new Set(
      (beta?.numerosAutorizados ?? []).flatMap(gerarVariantesNumeroBrasil)
    )]
    const jidsAutorizados = [...new Set(
      (beta?.jidsAutorizados ?? []).map(normalizarJidBeta).filter(Boolean)
    )]
    const numerosCorrespondentes = numerosCandidatos
      .filter(numero => numerosAutorizados.includes(numero))
    const jidsCorrespondentes = jidsCandidatos
      .filter(jid => jidsAutorizados.includes(jid))
    const numeroAutorizado = numerosCorrespondentes.length > 0
    const jidAutorizado = jidsCorrespondentes.length > 0

    return {
      autorizado: !beta?.ativo || numeroAutorizado || jidAutorizado,
      numeroAutorizado,
      jidAutorizado,
      candidateJids: jidsCandidatos,
      normalizedNumbers: numerosCandidatos,
      numerosAutorizados,
      jidsAutorizados,
      numerosCorrespondentes,
      jidsCorrespondentes,
    }
  }

  return {
    handlers: {},
    sendMessage: vi.fn(),
    relayMessage: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    config: {
      gruposPermitidos:     [],
      grupoPermitido:       "",
      palavrasEntrada:      ["salario", "freela", "pix"],
      caixinhaPercentual:   0.3,
      valorMaximo:          100_000,
      timeoutEstadoMs:      600_000,
      whatsappInteractiveEnabled: false,
      whatsappMenuMode:     "text",
      horaLembreteMensal:   20,
      rateLimitPorMinuto:   15,
      beta:                 {
        ativo: false,
        responderBloqueado: false,
        debug: false,
        debugMostrarRaw: false,
        numerosAutorizados: [],
        jidsAutorizados: [],
        gruposAutorizados: [],
        exigirParticipanteAutorizado: true,
      },
      ai:                   { enabled: false },
      painel:               { porta: 0, token: "test" },
      backupMantenerDias:   7,
      reconexao:            { maxTentativas: 1, delayInicial: 1, delayMaximo: 1, fator: 1 },
      dbPath:               ":memory:",
      backupDir:            "./database/backups",
      authPath:             "./auth",
      logLevel:             "silent",
    },
    gerarVariantesNumeroBrasil,
    avaliarAutorizacaoBetaCandidatos,
    mascararIdentificadorBeta,
    mascararNumeroBeta,
    normalizarJidBeta,
    normalizarNumeroWhatsApp,
  }
})

vi.mock("../src/config.js", () => ({
  avaliarAutorizacaoBetaCandidatos: (
    candidatos,
    beta = botMock.config.beta
  ) => botMock.avaliarAutorizacaoBetaCandidatos(candidatos, beta),
  config: botMock.config,
  gerarVariantesNumeroBrasil: botMock.gerarVariantesNumeroBrasil,
  grupoAutorizadoBeta: (groupJid, beta = botMock.config.beta) => {
    const grupo = botMock.normalizarJidBeta(groupJid)
    if (!grupo || !grupo.endsWith("@g.us")) return false
    const gruposAutorizados = new Set(
      (beta?.gruposAutorizados ?? []).map(botMock.normalizarJidBeta).filter(Boolean)
    )
    return gruposAutorizados.has(grupo)
  },
  mascararIdentificadorBeta: botMock.mascararIdentificadorBeta,
  mascararNumeroBeta: botMock.mascararNumeroBeta,
  normalizarNumeroBeta: botMock.normalizarNumeroWhatsApp,
  normalizarJidBeta: botMock.normalizarJidBeta,
  normalizarNumeroWhatsApp: botMock.normalizarNumeroWhatsApp,
  usuarioAutorizadoBeta: (usuarioId, beta = botMock.config.beta) => {
    const jidUsuario = botMock.normalizarJidBeta(usuarioId)
    return botMock.avaliarAutorizacaoBetaCandidatos({
      candidateJids: jidUsuario ? [jidUsuario] : [],
      normalizedNumbers: jidUsuario.endsWith("@lid")
        ? []
        : botMock.gerarVariantesNumeroBrasil(usuarioId),
    }, beta).autorizado
  },
}))

vi.mock("../src/logger.js", () => ({
  logger: {
    info: botMock.loggerInfo,
    warn: botMock.loggerWarn,
    error: botMock.loggerError,
  },
  logMensagem: vi.fn(),
}))

vi.mock("../src/rateLimiter.js", () => ({
  verificarRateLimit: vi.fn(() => true),
}))

vi.mock("@whiskeysockets/baileys", () => ({
  DisconnectReason: { loggedOut: 401, badSession: 500 },
  fetchLatestBaileysVersion: vi.fn(async () => ({ version: [1, 0, 0] })),
  isJidBroadcast: vi.fn(() => false),
  makeCacheableSignalKeyStore: vi.fn(keys => keys),
  makeWASocket: vi.fn(() => ({
    ev: {
      on: vi.fn((evento, handler) => {
        botMock.handlers[evento] = handler
      }),
    },
    sendMessage: botMock.sendMessage,
    relayMessage: botMock.relayMessage,
  })),
  useMultiFileAuthState: vi.fn(async () => ({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  })),
}))

vi.mock("pino", () => ({
  default: vi.fn(() => ({})),
}))

vi.mock("qrcode-terminal", () => ({
  default: { generate: vi.fn() },
}))

vi.mock("fs-extra", () => ({
  default: {
    ensureDir: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}))

vi.mock("../src/scheduler.js", () => ({
  iniciarScheduler: vi.fn(),
}))

vi.mock("../src/web/painel.js", () => ({
  iniciarPainel: vi.fn(),
}))

const {
  debugLogIncomingIdentifiers,
  extractMessageIdentifiers,
  extrairIdentificadorRemetente,
  extrairUsuarioIdMensagem,
  iniciarBot,
  isJidGrupo,
} = await import("../src/bot.js")
const {
  atualizarUsuario, criarUsuario, db, getUltimoLancamento, getUsuario,
  inserirLancamento, mesAtual,
} = await import("../src/database.js")
const { resetPendenciasLancamentoParaTestes } = await import("../src/pendingLancamentos.js")
const { resetPendenciasEdicaoParaTestes } = await import("../src/pendingEdits.js")
const { resetPendenciasBetaParaTestes } = await import("../src/pendingBeta.js")
const { resetPendenciasAIParaTestes } = await import("../src/pendingAI.js")
const { resetMenusPendentesParaTestes } = await import("../src/interactiveMessages.js")

function prepararUsuario(id) {
  criarUsuario(id)
  atualizarUsuario(id, { nome: "Teste", aguardando_nome: 0 })
}

async function entregarMensagem({
  remoteJid,
  texto,
  message,
  id = "msg-1",
  participant,
  sender,
  pushName,
  fromMe = false,
}) {
  await botMock.handlers["messages.upsert"]({
    type: "notify",
    messages: [{
      key: { remoteJid, participant, id, fromMe },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: message ?? { conversation: texto },
      sender,
      pushName,
    }],
  })
}

beforeEach(async () => {
  resetPendenciasLancamentoParaTestes()
  resetPendenciasEdicaoParaTestes()
  resetPendenciasBetaParaTestes()
  resetPendenciasAIParaTestes()
  resetMenusPendentesParaTestes()
  botMock.handlers = {}
  botMock.sendMessage.mockClear()
  botMock.relayMessage.mockClear()
  botMock.loggerInfo.mockClear()
  botMock.loggerWarn.mockClear()
  botMock.loggerError.mockClear()
  botMock.config.whatsappInteractiveEnabled = false
  botMock.config.whatsappMenuMode = "text"
  botMock.config.beta = {
    ativo: false,
    responderBloqueado: false,
    debug: false,
    debugMostrarRaw: false,
    numerosAutorizados: [],
    jidsAutorizados: [],
    gruposAutorizados: [],
    exigirParticipanteAutorizado: true,
  }
  botMock.config.ai = { enabled: false }
  db.exec(`
    DELETE FROM feedback_beta;
    DELETE FROM metas_categoria;
    DELETE FROM lancamentos;
    DELETE FROM usuarios;
  `)
  await iniciarBot()
})

describe("bot - conversas privadas e grupos", () => {
  it("identifica JID de grupo", () => {
    expect(isJidGrupo("120363000000000@g.us")).toBe(true)
    expect(isJidGrupo("5515999999999@s.whatsapp.net")).toBe(false)
  })

  it("extrai número real de conversa privada", () => {
    const usuarioId = extrairUsuarioIdMensagem({
      key: { remoteJid: "+55 (15) 99999-9999@s.whatsapp.net" },
    })

    expect(usuarioId).toBe("5515999999999")
  })

  it.each([
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "opa",
    "e ai",
    "e aí",
    "start",
    "inicio",
    "início",
  ])("saudação %s inicia onboarding e pergunta o nome", async (texto) => {
    await entregarMensagem({
      remoteJid: "5515000000001@s.whatsapp.net",
      texto,
    })

    const usuario = getUsuario("5515000000001")
    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(usuario.nome).toBeNull()
    expect(usuario.aguardando_nome).toBe(1)
    expect(resposta).toContain("como você gostaria que eu te chamasse")
    expect(resposta).toContain("Sadu")
  })

  it("salva nome válido depois da saudação", async () => {
    await entregarMensagem({
      remoteJid: "5515000000002@s.whatsapp.net",
      texto: "oi",
      id: "msg-onboarding-1",
    })
    await entregarMensagem({
      remoteJid: "5515000000002@s.whatsapp.net",
      texto: "Sadu",
      id: "msg-onboarding-2",
    })

    const usuario = getUsuario("5515000000002")
    expect(usuario.nome).toBe("Sadu")
    expect(usuario.aguardando_nome).toBe(0)
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Perfeito, Sadu")
  })

  it("não salva criar dados de teste como nome durante onboarding", async () => {
    await entregarMensagem({
      remoteJid: "5515000000040@s.whatsapp.net",
      texto: "criar dados de teste",
      id: "msg-comando-nome-1",
    })

    const usuario = getUsuario("5515000000040")
    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(usuario.nome).toBeNull()
    expect(usuario.aguardando_nome).toBe(1)
    expect(resposta).toContain("preciso saber como posso te chamar")

    await entregarMensagem({
      remoteJid: "5515000000040@s.whatsapp.net",
      texto: "1",
      id: "msg-comando-nome-2",
    })

    expect(getUsuario("5515000000040").nome).toBeNull()
    expect(getUltimoLancamento("5515000000040")).toBeNull()
  })

  it("mudar meu nome para Sadu corrige nome contaminado", async () => {
    prepararUsuario("5515000000041")
    atualizarUsuario("5515000000041", { nome: "Criar Dados De Teste" })

    await entregarMensagem({
      remoteJid: "5515000000041@s.whatsapp.net",
      texto: "mudar meu nome para Sadu",
      id: "msg-corrigir-nome",
    })

    expect(getUsuario("5515000000041").nome).toBe("Sadu")
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toBe("Pronto, vou te chamar de Sadu a partir de agora.")
  })

  it("dados de teste e confirmação 1 chegam ao dispatcher antes do parser", async () => {
    prepararUsuario("5515000000042")

    await entregarMensagem({
      remoteJid: "5515000000042@s.whatsapp.net",
      texto: "criar dados de teste",
      id: "msg-demo-prioridade-1",
    })
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("1 - Criar dados de exemplo")

    await entregarMensagem({
      remoteJid: "5515000000042@s.whatsapp.net",
      texto: "1",
      id: "msg-demo-prioridade-2",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("Dados de exemplo criados")
    expect(getUltimoLancamento("5515000000042").valor).not.toBe(1)
    expect(db.prepare(
      "SELECT COUNT(*) AS total FROM lancamentos WHERE usuario_id = ?"
    ).get("5515000000042").total).toBe(7)
  })

  it("saudação usa o nome salvo sem perguntar novamente", async () => {
    prepararUsuario("5515000000003")
    atualizarUsuario("5515000000003", { nome: "Sadu" })

    await entregarMensagem({
      remoteJid: "5515000000003@s.whatsapp.net",
      texto: "oi",
    })

    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(resposta).toContain("Oi, Sadu")
    expect(resposta).toContain("MENU DO BOT FINANÇAS")
    expect(resposta).not.toContain("como você gostaria que eu te chamasse")
    expect(botMock.relayMessage).not.toHaveBeenCalled()
  })

  it("ajuda continua exibindo os comandos completos", async () => {
    prepararUsuario("5515000000004")

    await entregarMensagem({
      remoteJid: "5515000000004@s.whatsapp.net",
      texto: "ajuda",
    })

    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(resposta).toContain("gastei 35 no mercado")
    expect(resposta).toContain("recebi 2500 salario")
    expect(resposta).toContain("exportar planilha")
    expect(botMock.relayMessage).not.toHaveBeenCalled()
  })

  it("menu tenta envio interativo quando habilitado", async () => {
    botMock.config.whatsappInteractiveEnabled = true
    botMock.config.whatsappMenuMode = "interactive"
    prepararUsuario("5515000000009")

    await entregarMensagem({
      remoteJid: "5515000000009@s.whatsapp.net",
      texto: "menu",
      id: "msg-menu-interativo",
    })

    expect(botMock.relayMessage).toHaveBeenCalledOnce()
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("menu texto")
  })

  it("resposta interativa Ver resumo executa o resumo", async () => {
    prepararUsuario("5515000000011")

    await entregarMensagem({
      remoteJid: "5515000000011@s.whatsapp.net",
      id: "msg-clique-resumo",
      message: {
        listResponseMessage: {
          title: "Ver resumo",
          singleSelectReply: { selectedRowId: "resumo" },
        },
      },
    })

    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(resposta).toContain("RESUMO")
    expect(resposta).toContain("Saldo")
  })

  it("resposta interativa Exportar planilha gera XLSX", async () => {
    prepararUsuario("5515000000012")
    inserirLancamento({
      usuarioId: "5515000000012",
      tipo: "gasto",
      nome: "mercado",
      categoria: "mercado",
      valor: 35,
      mes: mesAtual(),
    })

    await entregarMensagem({
      remoteJid: "5515000000012@s.whatsapp.net",
      id: "msg-clique-planilha",
      message: {
        interactiveResponseMessage: {
          nativeFlowResponseMessage: {
            paramsJson: JSON.stringify({
              id: "exportar_planilha",
              title: "Exportar planilha",
            }),
          },
        },
      },
    })

    const documento = botMock.sendMessage.mock.calls
      .map(([, payload]) => payload)
      .find(payload => payload.document)
    expect(documento.fileName).toMatch(/\.xlsx$/)
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("planilha Excel foi gerada")
  })

  it("conclui 1250 + 2 + mercado sem transformar 2 em R$ 2,00", async () => {
    prepararUsuario("5515000000010")

    await entregarMensagem({
      remoteJid: "5515000000010@s.whatsapp.net",
      texto: "1250",
      id: "msg-pendencia-1",
    })
    await entregarMensagem({
      remoteJid: "5515000000010@s.whatsapp.net",
      texto: "2",
      id: "msg-pendencia-2",
    })

    expect(getUltimoLancamento("5515000000010")).toBeNull()
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("vou registrar como gasto")

    await entregarMensagem({
      remoteJid: "5515000000010@s.whatsapp.net",
      texto: "mercado",
      id: "msg-pendencia-3",
    })

    expect(getUltimoLancamento("5515000000010")).toMatchObject({
      tipo: "gasto",
      valor: 1250,
      categoria: "mercado",
    })
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toBe("Despesa registrada: R$ 1.250,00 em Mercado.")
  })

  it.each([
    "gastei 35 no mercado",
    "recebi 1250 em freelance",
    "resumo",
    "planilha",
    "exportar planilha",
    "mercado",
    "obrigado",
    "planiha",
  ])("não salva %s como nome enquanto aguarda cadastro", async (texto) => {
    criarUsuario("5515000000005")

    await entregarMensagem({
      remoteJid: "5515000000005@s.whatsapp.net",
      texto,
    })

    const usuario = getUsuario("5515000000005")
    const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
    expect(usuario.nome).toBeNull()
    expect(usuario.aguardando_nome).toBe(1)
    expect(getUltimoLancamento("5515000000005")).toBeNull()
    expect(resposta).toContain("parece mais um comando do que um nome")
    expect(resposta).toContain("Sadu")
  })

  it("aceita nome válido declarado no primeiro contato", async () => {
    await entregarMensagem({
      remoteJid: "5515000000006@s.whatsapp.net",
      texto: "meu nome é Sadu",
    })

    const usuario = getUsuario("5515000000006")
    expect(usuario.nome).toBe("Sadu")
    expect(usuario.aguardando_nome).toBe(0)
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Perfeito, Sadu")
  })

  it("prefere participante com telefone quando remoteJid privado vem como @lid", () => {
    const remetente = extrairIdentificadorRemetente({
      key: {
        remoteJid: "abc123@lid",
        participant: "5515999999999@s.whatsapp.net",
      },
    })

    expect(remetente.origem).toBe("key.participant")
    expect(remetente.identificador).toBe("5515999999999")
  })

  it("extrai candidatos LID, JID e número sem ler o texto da mensagem", () => {
    const identificadores = extractMessageIdentifiers({
      key: {
        remoteJid: "120363000000000000@g.us",
        participant: "123456789012345@lid",
      },
      participant: "5515999999999@s.whatsapp.net",
      sender: "123456789012345@lid",
      pushName: "Pessoa Teste",
      message: { conversation: "conteúdo financeiro privado" },
    })

    expect(identificadores).toMatchObject({
      isGroup: true,
      pushName: "Pessoa Teste",
      remoteJid: "120363000000000000@g.us",
      participant: "123456789012345@lid",
      sender: "123456789012345@lid",
      messageType: "conversation",
    })
    expect(identificadores.candidateLids).toContain("123456789012345@lid")
    expect(identificadores.candidateWhatsAppJids)
      .toContain("5515999999999@s.whatsapp.net")
    expect(identificadores.normalizedNumbers).toContain("5515999999999")
    expect(JSON.stringify(identificadores)).not.toContain("conteúdo financeiro privado")
  })

  it("debug cru pré-autorização mostra LID privado e mantém beta silencioso", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      debug: true,
      debugMostrarRaw: true,
      numerosAutorizados: ["5515999999999"],
      jidsAutorizados: [],
      gruposAutorizados: [],
      exigirParticipanteAutorizado: true,
    }
    botMock.config.ai = {
      enabled: true,
      apiKey: "sk-chave-que-nao-pode-aparecer",
    }
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await entregarMensagem({
      remoteJid: "123456789012345@lid",
      texto: "feedback dado que não pode ser salvo",
      pushName: "Pessoa Não Autorizada",
      id: "msg-debug-lid-privado",
    })

    const saida = consoleSpy.mock.calls.flat().join("\n")
    consoleSpy.mockRestore()

    expect(saida).toContain("[DEBUG_BETA_RAW_IDENTIFIERS]")
    expect(saida).toContain('"key.remoteJid": "123456789012345@lid"')
    expect(saida).toContain('"allowedNumbersMatched": false')
    expect(saida).toContain('"allowedJidsMatched": false')
    expect(saida).toContain('"authorized": false')
    expect(saida).toContain('"action": "ignored_beta_silent"')
    expect(saida).toContain("LID_CANDIDATE=123456789012345@lid")
    expect(saida).not.toContain("dado que não pode ser salvo")
    expect(saida).not.toContain("sk-chave-que-nao-pode-aparecer")
    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(botMock.relayMessage).not.toHaveBeenCalled()
    expect(getUsuario("123456789012345@lid")).toBeNull()
    expect(getUltimoLancamento("123456789012345@lid")).toBeNull()
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)

    const logPersistente = JSON.stringify(botMock.loggerInfo.mock.calls)
    expect(logPersistente).not.toContain("123456789012345@lid")
  })

  it("debug cru pré-autorização mostra LID de participante do grupo", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      debug: true,
      debugMostrarRaw: true,
      numerosAutorizados: [],
      jidsAutorizados: [],
      gruposAutorizados: ["120363000000000000@g.us"],
      exigirParticipanteAutorizado: true,
    }
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await entregarMensagem({
      remoteJid: "120363000000000000@g.us",
      participant: "987654321098765@lid",
      texto: "teste",
      id: "msg-debug-lid-grupo",
    })

    const saida = consoleSpy.mock.calls.flat().join("\n")
    consoleSpy.mockRestore()

    expect(saida).toContain('"key.participant": "987654321098765@lid"')
    expect(saida).toContain('"isGroup": true')
    expect(saida).toContain('"action": "ignored_unauthorized_participant"')
    expect(saida).toContain("LID_CANDIDATE=987654321098765@lid")
    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("987654321098765@lid")).toBeNull()
  })

  it("não imprime identificadores crus quando BETA_DEBUG=false", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      debug: false,
      debugMostrarRaw: true,
      numerosAutorizados: [],
      jidsAutorizados: [],
      gruposAutorizados: [],
      exigirParticipanteAutorizado: true,
    }
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await entregarMensagem({
      remoteJid: "111122223333444@lid",
      texto: "teste",
      id: "msg-sem-debug-raw",
    })

    const saida = consoleSpy.mock.calls.flat().join("\n")
    consoleSpy.mockRestore()

    expect(saida).not.toContain("[DEBUG_BETA_RAW_IDENTIFIERS]")
    expect(saida).not.toContain("111122223333444@lid")
    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("111122223333444@lid")).toBeNull()
  })

  it("não imprime identificadores crus quando apenas BETA_DEBUG está ativo", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      debug: true,
      debugMostrarRaw: false,
      numerosAutorizados: [],
      jidsAutorizados: [],
      gruposAutorizados: [],
      exigirParticipanteAutorizado: true,
    }
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await entregarMensagem({
      remoteJid: "555566667777888@lid",
      texto: "teste",
      id: "msg-debug-mascarado",
    })

    const saida = consoleSpy.mock.calls.flat().join("\n")
    consoleSpy.mockRestore()

    expect(saida).not.toContain("[DEBUG_BETA_RAW_IDENTIFIERS]")
    expect(saida).not.toContain("555566667777888@lid")
    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("555566667777888@lid")).toBeNull()
  })

  it("mensagem privada com número autorizado funciona", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5515999999999"] }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage).toHaveBeenCalled()
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515999999999").valor).toBe(35)
  })

  it("mensagem privada com @lid autorizado funciona", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: [],
      jidsAutorizados: ["contato-ficticio@lid"],
      gruposAutorizados: [],
      exigirParticipanteAutorizado: true,
    }
    prepararUsuario("contato-ficticio@lid")

    await entregarMensagem({
      remoteJid: "contato-ficticio@lid",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("contato-ficticio@lid").valor).toBe(35)
  })

  it("mensagem privada com whitelist contendo símbolos funciona", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["+55 (15) 99999-9999"] }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515999999999").categoria).toBe("mercado")
  })

  it("mensagem privada sem DDI é autorizada quando whitelist tem DDI", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5515999999999"] }
    prepararUsuario("15999999999")

    await entregarMensagem({
      remoteJid: "15999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("15999999999").valor).toBe(35)
  })

  it("mensagem privada com DDI é autorizada quando whitelist está sem DDI", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["15999999999"] }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515999999999").valor).toBe(35)
  })

  it("BETA_DEBUG=true não quebra fluxo autorizado", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      debug: true,
      debugMostrarRaw: false,
      numerosAutorizados: ["5515999999999"],
      jidsAutorizados: [],
    }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515999999999").valor).toBe(35)
  })

  it("mensagem privada com número não autorizado é ignorada sem resposta ou cadastro", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5515999999999"] }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
    expect(getUltimoLancamento("5515888888888")).toBeNull()
  })

  it("número não autorizado não recebe boas-vindas ao enviar oi", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "oi",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
  })

  it.each([
    "feedback teste",
    "reportar erro fechamento demorou",
    "avaliar beta",
    "começar teste",
    "criar dados de teste",
    "limpar meus dados",
  ])("beta silencioso ignora %s sem resposta ou cadastro", async (texto) => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
    }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto,
      id: `msg-bloqueado-${texto}`,
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(botMock.relayMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
    expect(db.prepare("SELECT COUNT(*) AS total FROM feedback_beta").get().total)
      .toBe(0)
  })

  it("primeiro contato autorizado recebe onboarding específico do beta", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
    }

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "oi",
      id: "msg-onboarding-beta",
    })

    expect(getUsuario("5515999999999")).toMatchObject({
      nome: null,
      aguardando_nome: 1,
    })
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("beta controlado")
    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("começar teste")
  })

  it("começar teste autorizado mostra tutorial mesmo no primeiro contato", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
    }

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "começar teste",
      id: "msg-tutorial-beta",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("BEM-VINDO AO BETA")
    expect(getUsuario("5515999999999")).not.toBeNull()
  })

  it("fluxo completo autorizado percorre o caminho real sem cair no fallback", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
      jidsAutorizados: [],
      gruposAutorizados: [],
      exigirParticipanteAutorizado: true,
    }
    prepararUsuario("5515999999999")
    atualizarUsuario("5515999999999", { nome: "Sadu" })

    const passos = [
      ["começar teste", "BEM-VINDO AO BETA"],
      ["checklist beta", "CHECKLIST DE TESTE"],
      ["feedback achei fácil de usar", "feedback foi registrado"],
      ["reportar erro o fechamento demorou", "Registrei esse erro"],
      ["avaliar beta", "0 a 10"],
      ["8", "principal motivo"],
      ["achei útil, mas falta áudio", "Avaliação registrada"],
      ["extrato", "Você ainda não tem lançamentos registrados"],
    ]

    for (let indice = 0; indice < passos.length; indice++) {
      const [texto, esperado] = passos[indice]
      await entregarMensagem({
        remoteJid: "5515999999999@s.whatsapp.net",
        texto,
        id: `msg-fluxo-beta-real-${indice}`,
      })
      const resposta = botMock.sendMessage.mock.calls.at(-1)[1].text
      expect(resposta).toContain(esperado)
      expect(resposta).not.toContain("ainda não entendi direitinho")
    }

    const registros = db.prepare(`
      SELECT tipo, texto, nota FROM feedback_beta
      WHERE usuario_id = ?
      ORDER BY id ASC
    `).all("5515999999999")
    expect(registros).toEqual([
      { tipo: "feedback", texto: "achei fácil de usar", nota: null },
      { tipo: "bug", texto: "o fechamento demorou", nota: null },
      {
        tipo: "avaliacao",
        texto: "achei útil, mas falta áudio",
        nota: 8,
      },
    ])
    expect(getUltimoLancamento("5515999999999")).toBeNull()
  })

  it("fluxo real também aceita comecar teste sem acento", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
    }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "5515999999999@s.whatsapp.net",
      texto: "comecar teste",
      id: "msg-tutorial-sem-acento",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text)
      .toContain("BEM-VINDO AO BETA")
  })

  it("beta silencioso não envia menu para número não autorizado", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5511999999999"],
    }
    botMock.config.whatsappInteractiveEnabled = true
    botMock.config.whatsappMenuMode = "interactive"

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "menu",
      id: "msg-menu-bloqueado",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(botMock.relayMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
  })

  it("número não autorizado não registra receita", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5515999999999"] }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "recebi 2500 salario",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
    expect(getUltimoLancamento("5515888888888")).toBeNull()
  })

  it("responde beta fechado apenas quando BETA_BLOCKED_REPLY=true", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: true, numerosAutorizados: ["5515999999999"] }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "ajuda",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Este bot está em beta fechado")
    expect(getUsuario("5515888888888")).toBeNull()
  })

  it("BETA_MODE=false permite usuário privado", async () => {
    botMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }
    prepararUsuario("5515888888888")

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515888888888").valor).toBe(35)
  })

  it("BETA_MODE ausente permite usuário privado", async () => {
    delete botMock.config.beta
    prepararUsuario("5515888888888")

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515888888888").valor).toBe(35)
  })

  it("mensagem de grupo é ignorada sem resposta, usuário ou lançamento", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5515999999999"] }

    await entregarMensagem({
      remoteJid: "120363000000000@g.us",
      participant: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515999999999")).toBeNull()
    expect(getUltimoLancamento("5515999999999")).toBeNull()
  })

  it("grupo não autorizado não recebe boas-vindas ao enviar oi", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: false, numerosAutorizados: ["5511999999999"] }

    await entregarMensagem({
      remoteJid: "120363000000000@g.us",
      participant: "5515999999999@s.whatsapp.net",
      texto: "oi",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515999999999")).toBeNull()
  })

  it("grupo autorizado processa participante autorizado por número", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
      jidsAutorizados: [],
      gruposAutorizados: ["120363000000000000@g.us"],
      exigirParticipanteAutorizado: true,
    }
    prepararUsuario("5515999999999")

    await entregarMensagem({
      remoteJid: "120363000000000000@g.us",
      participant: "5515999999999@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515999999999").valor).toBe(35)
  })

  it("grupo autorizado processa participante autorizado por @lid", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: [],
      jidsAutorizados: ["participante-ficticio@lid"],
      gruposAutorizados: ["120363000000000000@g.us"],
      exigirParticipanteAutorizado: true,
    }
    prepararUsuario("participante-ficticio@lid")

    await entregarMensagem({
      remoteJid: "120363000000000000@g.us",
      participant: "participante-ficticio@lid",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("participante-ficticio@lid").valor).toBe(35)
  })

  it("grupo autorizado ignora participante não autorizado por padrão", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: ["5515999999999"],
      jidsAutorizados: [],
      gruposAutorizados: ["120363000000000000@g.us"],
      exigirParticipanteAutorizado: true,
    }

    await entregarMensagem({
      remoteJid: "120363000000000000@g.us",
      participant: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
    expect(getUltimoLancamento("5515888888888")).toBeNull()
  })

  it("grupo autorizado pode processar sem exigir participante autorizado quando configurado", async () => {
    botMock.config.beta = {
      ativo: true,
      responderBloqueado: false,
      numerosAutorizados: [],
      jidsAutorizados: [],
      gruposAutorizados: ["120363000000000000@g.us"],
      exigirParticipanteAutorizado: false,
    }
    prepararUsuario("5515888888888")

    await entregarMensagem({
      remoteJid: "120363000000000000@g.us",
      participant: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
    })

    expect(botMock.sendMessage.mock.calls.at(-1)[1].text).toContain("Despesa registrada")
    expect(getUltimoLancamento("5515888888888").valor).toBe(35)
  })

  it("grupo não recebe resposta de beta fechado para número não autorizado", async () => {
    botMock.config.beta = { ativo: true, responderBloqueado: true, numerosAutorizados: ["5515999999999"] }

    await entregarMensagem({
      remoteJid: "120363000000000@g.us",
      participant: "5515888888888@s.whatsapp.net",
      texto: "ajuda",
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
  })

  it("mensagem fromMe=true é ignorada", async () => {
    botMock.config.beta = { ativo: false, responderBloqueado: false, numerosAutorizados: [] }

    await entregarMensagem({
      remoteJid: "5515888888888@s.whatsapp.net",
      texto: "gastei 35 no mercado",
      fromMe: true,
    })

    expect(botMock.sendMessage).not.toHaveBeenCalled()
    expect(getUsuario("5515888888888")).toBeNull()
    expect(getUltimoLancamento("5515888888888")).toBeNull()
  })
})
