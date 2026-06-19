import { describe, expect, it } from "vitest"
import {
  avaliarAutorizacaoBetaCandidatos,
  carregarConfig,
  gerarVariantesNumeroBrasil,
  grupoAutorizadoBeta,
  mascararNumeroBeta,
  normalizarNumeroBeta,
  normalizarNumeroWhatsApp,
  normalizarJidBeta,
  usuarioAutorizadoBeta,
} from "../src/config.js"

describe("config - beta fechado", () => {
  it("mantém mensagens interativas desligadas por padrão", () => {
    const config = carregarConfig({})

    expect(config.whatsappInteractiveEnabled).toBe(false)
    expect(config.whatsappMenuMode).toBe("text")
  })

  it("permite ativar mensagens interativas explicitamente", () => {
    const config = carregarConfig({
      WHATSAPP_INTERACTIVE_ENABLED: "true",
    })

    expect(config.whatsappInteractiveEnabled).toBe(true)
    expect(config.whatsappMenuMode).toBe("interactive")
  })

  it("WHATSAPP_MENU_MODE=text força o modo seguro mesmo com interativo habilitado", () => {
    const config = carregarConfig({
      WHATSAPP_INTERACTIVE_ENABLED: "true",
      WHATSAPP_MENU_MODE: "text",
    })

    expect(config.whatsappInteractiveEnabled).toBe(true)
    expect(config.whatsappMenuMode).toBe("text")
  })

  it("aceita o modo auto com fallback textual completo", () => {
    expect(carregarConfig({
      WHATSAPP_MENU_MODE: "auto",
    }).whatsappMenuMode).toBe("auto")
  })

  it("mantém beta desligado quando BETA_MODE está ausente", () => {
    const config = carregarConfig({})

    expect(config.beta.ativo).toBe(false)
    expect(config.beta.responderBloqueado).toBe(false)
    expect(usuarioAutorizadoBeta("5511999999999", config.beta)).toBe(true)
  })

  it("mantém interpretador de IA desligado por padrão", () => {
    const config = carregarConfig({})

    expect(config.ai).toEqual({
      enabled: false,
      provider: "openai",
      model: "",
      apiKey: "",
      geminiApiKey: "",
      geminiModel: "gemini-2.5-flash",
      geminiMaxOutputTokens: 1200,
      minConfidence: 0.85,
      confirmationConfidence: 0.60,
      timeoutMs: 8_000,
      logEnabled: false,
      logRaw: false,
    })
  })

  it("carrega configuração do interpretador sem exigir chave", () => {
    const config = carregarConfig({
      AI_INTERPRETER_ENABLED: "true",
      AI_PROVIDER: "OPENAI",
      AI_MODEL: "modelo-controlado",
      AI_API_KEY: "",
      GEMINI_API_KEY: "gemini-chave-teste",
      GEMINI_MODEL: "gemini-modelo-teste",
      GEMINI_MAX_OUTPUT_TOKENS: "2048",
      AI_MIN_CONFIDENCE: "0.90",
      AI_CONFIRMATION_CONFIDENCE: "0.65",
      AI_TIMEOUT_MS: "5000",
      AI_LOG_ENABLED: "true",
      AI_LOG_RAW: "false",
    })

    expect(config.ai).toMatchObject({
      enabled: true,
      provider: "openai",
      model: "modelo-controlado",
      apiKey: "",
      geminiApiKey: "gemini-chave-teste",
      geminiModel: "gemini-modelo-teste",
      geminiMaxOutputTokens: 2048,
      minConfidence: 0.90,
      confirmationConfidence: 0.65,
      timeoutMs: 5_000,
      logEnabled: true,
      logRaw: false,
    })
  })

  it("mantém resposta para bloqueados desligada por padrão seguro", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(config.beta.responderBloqueado).toBe(false)
  })

  it("permite ativar resposta de beta fechado explicitamente", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_BLOCKED_REPLY: "true",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(config.beta.responderBloqueado).toBe(true)
  })

  it("lê BETA_DEBUG sem afetar autorização", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_DEBUG: "true",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(config.beta.debug).toBe(true)
    expect(config.beta.debugMostrarRaw).toBe(false)
    expect(usuarioAutorizadoBeta("5511999999999", config.beta)).toBe(true)
  })

  it("lê aliases de deploy para porta, token, banco e backup", () => {
    const config = carregarConfig({
      PORT: "4000",
      DASHBOARD_TOKEN: "token-ficticio",
      DATABASE_PATH: "./database/producao.db",
      BACKUP_DIR: "./database/backups-producao",
    })

    expect(config.painel.porta).toBe(4000)
    expect(config.painel.token).toBe("token-ficticio")
    expect(config.dbPath).toBe("./database/producao.db")
    expect(config.backupDir).toBe("./database/backups-producao")
  })

  it("permite qualquer usuário quando BETA_MODE=false", () => {
    const config = carregarConfig({
      BETA_MODE: "false",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(config.beta.ativo).toBe(false)
    expect(usuarioAutorizadoBeta("5511888888888", config.beta)).toBe(true)
  })

  it("bloqueia número fora da whitelist quando BETA_MODE=true", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(usuarioAutorizadoBeta("5511888888888", config.beta)).toBe(false)
  })

  it("permite número autorizado quando BETA_MODE=true", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5511999999999",
    })

    expect(usuarioAutorizadoBeta("5511999999999", config.beta)).toBe(true)
  })

  it("normaliza símbolos, espaços e sufixo do WhatsApp", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "+55 (11) 99999-9999, 55 11 88888-8888",
    })

    expect(config.beta.numerosAutorizados).toEqual(["5511999999999", "5511888888888"])
    expect(normalizarNumeroBeta("5511999999999@s.whatsapp.net")).toBe("5511999999999")
    expect(normalizarNumeroWhatsApp("5511999999999@c.us")).toBe("5511999999999")
    expect(normalizarJidBeta("5511999999999:2@s.whatsapp.net")).toBe("5511999999999@s.whatsapp.net")
    expect(usuarioAutorizadoBeta("5511888888888:12@s.whatsapp.net", config.beta)).toBe(true)
  })

  it("reconhece autorizado com nono dígito quando WhatsApp entrega sem nono dígito", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5515999999999",
    })

    expect(gerarVariantesNumeroBrasil("5515999999999")).toContain("551599999999")
    expect(usuarioAutorizadoBeta("551599999999@s.whatsapp.net", config.beta)).toBe(true)
  })

  it("reconhece autorizado sem nono dígito quando WhatsApp entrega com nono dígito", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "551599999999",
    })

    expect(gerarVariantesNumeroBrasil("551599999999")).toContain("5515999999999")
    expect(usuarioAutorizadoBeta("5515999999999@s.whatsapp.net", config.beta)).toBe(true)
  })

  it("reconhece múltiplos autorizados fictícios com e sem nono dígito", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5515999999999,5515987654321,551588888888,551587777777",
    })

    expect(usuarioAutorizadoBeta("5515999999999", config.beta)).toBe(true)
    expect(usuarioAutorizadoBeta("551599999999", config.beta)).toBe(true)
    expect(usuarioAutorizadoBeta("5515987654321@s.whatsapp.net", config.beta)).toBe(true)
    expect(usuarioAutorizadoBeta("551587654321@s.whatsapp.net", config.beta)).toBe(true)
  })

  it("reconhece número sem DDI quando whitelist tem DDI", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5515999999999",
    })

    expect(gerarVariantesNumeroBrasil("5515999999999")).toContain("15999999999")
    expect(usuarioAutorizadoBeta("15999999999", config.beta)).toBe(true)
  })

  it("reconhece número com DDI quando entrada vem sem DDI", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "15999999999",
    })

    expect(gerarVariantesNumeroBrasil("15999999999")).toContain("5515999999999")
    expect(usuarioAutorizadoBeta("5515999999999", config.beta)).toBe(true)
  })

  it("permite fallback opcional por JID autorizado", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_JIDS: "contato-ficticio@lid",
    })

    expect(usuarioAutorizadoBeta("contato-ficticio@lid", config.beta)).toBe(true)
    expect(usuarioAutorizadoBeta("outro-contato@lid", config.beta)).toBe(false)
  })

  it("detalha a autorização usando os mesmos candidatos do debug", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_NUMBERS: "5515999999999",
      BETA_ALLOWED_JIDS: "contato-ficticio@lid",
    })

    const resultado = avaliarAutorizacaoBetaCandidatos({
      candidateJids: [
        "120363000000000000@g.us",
        "contato-ficticio@lid",
      ],
      normalizedNumbers: ["5515888888888"],
    }, config.beta)

    expect(resultado).toMatchObject({
      autorizado: true,
      numeroAutorizado: false,
      jidAutorizado: true,
      jidsCorrespondentes: ["contato-ficticio@lid"],
    })
    expect(resultado.candidateJids)
      .not.toContain("120363000000000000@g.us")
    expect(resultado.numerosAutorizados).toContain("5515999999999")
  })

  it("lê grupos autorizados e exige participante autorizado por padrão", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_GROUPS: "120363000000000000@g.us",
    })

    expect(config.beta.gruposAutorizados).toEqual(["120363000000000000@g.us"])
    expect(config.beta.exigirParticipanteAutorizado).toBe(true)
    expect(grupoAutorizadoBeta("120363000000000000@g.us", config.beta)).toBe(true)
    expect(grupoAutorizadoBeta("120363999999999999@g.us", config.beta)).toBe(false)
  })

  it("permite desativar exigência de participante autorizado em grupo autorizado", () => {
    const config = carregarConfig({
      BETA_MODE: "true",
      BETA_ALLOWED_GROUPS: "120363000000000000@g.us",
      BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT: "false",
    })

    expect(config.beta.exigirParticipanteAutorizado).toBe(false)
  })

  it("mascara número para logs sem expor o telefone completo", () => {
    expect(mascararNumeroBeta("5511999999999")).toBe("55119****9999")
  })
})
