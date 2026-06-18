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

  return {
    handlers: {},
    sendMessage: vi.fn(),
    relayMessage: vi.fn(),
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
      painel:               { porta: 0, token: "test" },
      backupMantenerDias:   7,
      reconexao:            { maxTentativas: 1, delayInicial: 1, delayMaximo: 1, fator: 1 },
      dbPath:               ":memory:",
      backupDir:            "./database/backups",
      authPath:             "./auth",
      logLevel:             "silent",
    },
    gerarVariantesNumeroBrasil,
    mascararIdentificadorBeta,
    mascararNumeroBeta,
    normalizarJidBeta,
    normalizarNumeroWhatsApp,
  }
})

vi.mock("../src/config.js", () => ({
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
    if (!beta?.ativo) return true

    const variantesUsuario = botMock.gerarVariantesNumeroBrasil(usuarioId)
    const jidUsuario = botMock.normalizarJidBeta(usuarioId)
    const autorizados = new Set(
      (beta.numerosAutorizados ?? []).flatMap(botMock.gerarVariantesNumeroBrasil)
    )
    const jidsAutorizados = new Set(
      (beta.jidsAutorizados ?? []).map(botMock.normalizarJidBeta).filter(Boolean)
    )

    return variantesUsuario.some(variante => autorizados.has(variante)) ||
      (jidUsuario && jidsAutorizados.has(jidUsuario))
  },
}))

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

const { extrairIdentificadorRemetente, extrairUsuarioIdMensagem, iniciarBot, isJidGrupo } = await import("../src/bot.js")
const {
  atualizarUsuario, criarUsuario, db, getUltimoLancamento, getUsuario,
  inserirLancamento, mesAtual,
} = await import("../src/database.js")
const { resetPendenciasLancamentoParaTestes } = await import("../src/pendingLancamentos.js")
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
  fromMe = false,
}) {
  await botMock.handlers["messages.upsert"]({
    type: "notify",
    messages: [{
      key: { remoteJid, participant, id, fromMe },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: message ?? { conversation: texto },
    }],
  })
}

beforeEach(async () => {
  resetPendenciasLancamentoParaTestes()
  resetMenusPendentesParaTestes()
  botMock.handlers = {}
  botMock.sendMessage.mockClear()
  botMock.relayMessage.mockClear()
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
  db.exec(`
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
