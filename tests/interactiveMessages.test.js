import { beforeEach, describe, expect, it, vi } from "vitest"

const interactiveMock = vi.hoisted(() => ({
  config: {
    timeoutEstadoMs: 600_000,
    whatsappInteractiveEnabled: false,
    whatsappMenuMode: "text",
  },
  warn: vi.fn(),
}))

vi.mock("../src/config.js", () => ({
  config: interactiveMock.config,
}))

vi.mock("../src/logger.js", () => ({
  logger: {
    warn: interactiveMock.warn,
    info: vi.fn(),
    error: vi.fn(),
  },
}))

const {
  extrairRespostaInterativa,
  mapearAcaoInterativa,
  normalizarMensagemRecebida,
  obterMenuPendente,
  resetMenusPendentesParaTestes,
  sendMenuMessage,
} = await import("../src/interactiveMessages.js")

beforeEach(() => {
  resetMenusPendentesParaTestes()
  interactiveMock.config.whatsappInteractiveEnabled = false
  interactiveMock.config.whatsappMenuMode = "text"
  interactiveMock.config.timeoutEstadoMs = 600_000
  interactiveMock.warn.mockClear()
})

describe("sendMenuMessage", () => {
  it("envia fallback textual quando interativos estão desativados", async () => {
    const sock = {
      sendMessage: vi.fn(async () => ({})),
      relayMessage: vi.fn(async () => ({})),
    }

    const resultado = await sendMenuMessage(sock, "contato", "user-a", { nome: "Sadu" })

    expect(resultado).toEqual({ interativo: false, fallback: true })
    expect(sock.relayMessage).not.toHaveBeenCalled()
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("MENU DO BOT FINANÇAS")
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("Oi, Sadu")
    expect(obterMenuPendente("user-a")).toMatchObject({ contexto: "principal" })
  })

  it("envia lista interativa quando a opção está ativa e o socket suporta", async () => {
    interactiveMock.config.whatsappInteractiveEnabled = true
    interactiveMock.config.whatsappMenuMode = "interactive"
    const sock = {
      sendMessage: vi.fn(async () => ({})),
      relayMessage: vi.fn(async () => ({})),
    }

    const resultado = await sendMenuMessage(sock, "contato", "user-a")

    expect(resultado).toEqual({ interativo: true, fallback: false })
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("menu texto")
    const payload = sock.relayMessage.mock.calls[0][1]
    const interativa = payload.viewOnceMessage.message.interactiveMessage
    expect(interativa.header.title).toContain("Bot Finanças")
    expect(interativa.nativeFlowMessage.buttons[0].name).toBe("single_select")

    const params = JSON.parse(interativa.nativeFlowMessage.buttons[0].buttonParamsJson)
    expect(params.sections[0].rows).toHaveLength(7)
    expect(params.sections[0].rows.map(row => row.id)).toContain("resumo")
    expect(params.sections[0].rows.map(row => row.id)).toContain("exportar_planilha")
  })

  it("registra warning e usa fallback quando o envio interativo falha", async () => {
    interactiveMock.config.whatsappInteractiveEnabled = true
    interactiveMock.config.whatsappMenuMode = "interactive"
    const sock = {
      sendMessage: vi.fn(async () => ({})),
      relayMessage: vi.fn(async () => {
        throw new Error("não suportado")
      }),
    }

    const resultado = await sendMenuMessage(sock, "contato", "user-a")

    expect(resultado).toEqual({ interativo: false, fallback: true })
    expect(interactiveMock.warn).toHaveBeenCalled()
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("Responda com o número")
  })

  it("modo text não tenta interativo mesmo com o booleano habilitado", async () => {
    interactiveMock.config.whatsappInteractiveEnabled = true
    interactiveMock.config.whatsappMenuMode = "text"
    const sock = {
      sendMessage: vi.fn(async () => ({})),
      relayMessage: vi.fn(async () => ({})),
    }

    await sendMenuMessage(sock, "contato", "user-a")

    expect(sock.relayMessage).not.toHaveBeenCalled()
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("MENU DO BOT FINANÇAS")
  })

  it("modo auto tenta interativo e também envia o menu textual completo", async () => {
    interactiveMock.config.whatsappMenuMode = "auto"
    const sock = {
      sendMessage: vi.fn(async () => ({})),
      relayMessage: vi.fn(async () => ({})),
    }

    const resultado = await sendMenuMessage(sock, "contato", "user-a")

    expect(resultado).toEqual({ interativo: true, fallback: true })
    expect(sock.relayMessage).toHaveBeenCalledOnce()
    expect(sock.sendMessage.mock.calls[0][1].text).toContain("MENU DO BOT FINANÇAS")
  })

  it("mantém estado de menu isolado por usuário", async () => {
    const sock = { sendMessage: vi.fn(async () => ({})) }

    await sendMenuMessage(sock, "contato-a", "user-a")

    expect(obterMenuPendente("user-a")).toMatchObject({ contexto: "principal" })
    expect(obterMenuPendente("user-b")).toBeNull()
  })

  it("expira o estado do menu após o timeout configurado", async () => {
    const relogio = vi.spyOn(Date, "now").mockReturnValue(1_000)
    const sock = { sendMessage: vi.fn(async () => ({})) }

    try {
      await sendMenuMessage(sock, "contato-a", "user-a")
      relogio.mockReturnValue(601_001)

      expect(obterMenuPendente("user-a")).toBeNull()
    } finally {
      relogio.mockRestore()
    }
  })
})

describe("normalização de respostas interativas", () => {
  it("extrai resposta de botão comum", () => {
    expect(extrairRespostaInterativa({
      buttonsResponseMessage: {
        selectedButtonId: "resumo",
        selectedDisplayText: "Ver resumo",
      },
    })).toBe("resumo")
  })

  it("extrai resposta de lista", () => {
    expect(normalizarMensagemRecebida({
      listResponseMessage: {
        title: "Ver resumo",
        singleSelectReply: { selectedRowId: "resumo" },
      },
    })).toBe("resumo")
  })

  it("extrai resposta de fluxo interativo JSON", () => {
    expect(normalizarMensagemRecebida({
      interactiveResponseMessage: {
        nativeFlowResponseMessage: {
          paramsJson: JSON.stringify({ id: "exportar_planilha", title: "Exportar planilha" }),
        },
      },
    })).toBe("planilha")
  })

  it("aceita estrutura buttonResponseMessage equivalente", () => {
    expect(normalizarMensagemRecebida({
      buttonResponseMessage: {
        selectedButtonId: "iniciar_gasto",
      },
    })).toBe("iniciar_gasto")
  })

  it("preserva mensagens de texto normais", () => {
    expect(normalizarMensagemRecebida({
      conversation: "mercado 10",
    })).toBe("mercado 10")
  })

  it("mapeia títulos e ids para comandos internos", () => {
    expect(mapearAcaoInterativa("Ver histórico")).toBe("historico")
    expect(mapearAcaoInterativa("Ajuda completa")).toBe("ajuda completa")
    expect(mapearAcaoInterativa("voltar_menu")).toBe("menu")
  })
})
