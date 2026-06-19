import { beforeEach, describe, expect, it, vi } from "vitest"

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("../src/logger.js", () => ({
  logger: loggerMock,
  logMensagem: vi.fn(),
}))

const { interpretarMensagemComIA } = await import("../src/aiInterpreter.js")

function respostaValida() {
  return {
    intent: "registrar_despesa",
    confidence: 0.91,
    needs_confirmation: false,
    reason: "Gasto com valor e categoria claros.",
    transaction: {
      type: "despesa",
      amount: 35,
      category: "Mercado",
      description: "mercado",
      date_reference: "hoje",
    },
    query: { metric: null, category: null, period: null },
    clarification: { question: null, options: [] },
  }
}

function configAI(sobrescrever = {}) {
  return {
    enabled: true,
    provider: "openai",
    model: "modelo-teste",
    apiKey: "sk-chave-secreta-de-teste",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    geminiMaxOutputTokens: 1200,
    minConfidence: 0.85,
    confirmationConfidence: 0.60,
    timeoutMs: 500,
    logEnabled: false,
    logRaw: false,
    ...sobrescrever,
  }
}

function configGemini(sobrescrever = {}) {
  return configAI({
    provider: "gemini",
    model: "",
    apiKey: "sk-openai-que-nao-pode-aparecer",
    geminiApiKey: "gemini-chave-secreta-de-teste",
    geminiModel: "gemini-2.5-flash",
    ...sobrescrever,
  })
}

function respostaGemini(texto) {
  return {
    candidates: [{
      content: {
        parts: [{ text: texto }],
      },
    }],
  }
}

beforeEach(() => {
  loggerMock.info.mockClear()
  loggerMock.warn.mockClear()
  loggerMock.error.mockClear()
})

describe("interpretarMensagemComIA", () => {
  it("não chama provider quando a IA está desligada", async () => {
    const providerCall = vi.fn()

    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configAI({ enabled: false }),
      providerCall,
    })

    expect(resultado).toBeNull()
    expect(providerCall).not.toHaveBeenCalled()
  })

  it("não quebra quando API key ou modelo estão ausentes", async () => {
    const fetchImpl = vi.fn()

    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configAI({ apiKey: "", model: "" }),
      fetchImpl,
    })

    expect(resultado).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("valida resposta estruturada fornecida pelo provider", async () => {
    const resultado = await interpretarMensagemComIA("gstei 35 no mercd", null, {
      aiConfig: configAI(),
      providerCall: vi.fn(async () => respostaValida()),
    })

    expect(resultado).toMatchObject({
      intent: "registrar_despesa",
      action: "executar",
    })
  })

  it("normaliza aliases do Gemini antes de devolver a interpretação", async () => {
    const resposta = respostaValida()
    resposta.intent = "consulta_despesas"
    resposta.transaction = {
      type: null,
      amount: null,
      category: null,
      description: null,
      date_reference: null,
    }
    resposta.query = {
      metric: "despesas",
      category: "ifod",
      period: "esse_mes",
    }

    const resultado = await interpretarMensagemComIA(
      "qnt foi ifod esse mes",
      null,
      {
        aiConfig: configGemini(),
        providerCall: vi.fn(async () => resposta),
      }
    )

    expect(resultado).toMatchObject({
      intent: "consultar_gastos",
      action: "executar",
      query: {
        metric: "gastos",
        category: "ifood",
        period: "este_mes",
      },
    })
  })

  it("usa Responses API com JSON Schema estrito", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify(respostaValida()),
      }),
    }))

    await interpretarMensagemComIA("gstei 35 no mercd", null, {
      aiConfig: configAI(),
      fetchImpl,
    })

    const [url, opcoes] = fetchImpl.mock.calls[0]
    const body = JSON.parse(opcoes.body)
    expect(url).toBe("https://api.openai.com/v1/responses")
    expect(body.text.format).toMatchObject({
      type: "json_schema",
      name: "bot_financas_interpretation",
      strict: true,
    })
    expect(body.store).toBe(false)
    expect(body.tools).toBeUndefined()
  })

  it("usa Gemini generateContent com JSON mode compatível", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini(
        `\`\`\`json\n${JSON.stringify(respostaValida())}\n\`\`\``
      ),
    }))

    const resultado = await interpretarMensagemComIA(
      "gstei 35 no mercd",
      null,
      {
        aiConfig: configGemini(),
        fetchImpl,
      }
    )

    expect(resultado).toMatchObject({
      intent: "registrar_despesa",
      action: "executar",
    })
    const [url, opcoes] = fetchImpl.mock.calls[0]
    const body = JSON.parse(opcoes.body)
    expect(url).toContain(
      "/v1beta/models/gemini-2.5-flash:generateContent"
    )
    expect(opcoes.headers["x-goog-api-key"])
      .toBe("gemini-chave-secreta-de-teste")
    expect(opcoes.headers.Authorization).toBeUndefined()
    expect(body.systemInstruction.parts[0].text)
      .toContain("interpretador restrito")
    expect(body.contents[0].parts[0].text)
      .toContain("gstei 35 no mercd")
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      maxOutputTokens: 1200,
      temperature: 0,
    })
    expect(body.generationConfig).not.toHaveProperty("responseFormat")
    expect(JSON.stringify(body)).not.toContain(
      '"mimeType":"application/json"'
    )
  })

  it("Gemini sem chave não quebra nem chama o provider", async () => {
    const fetchImpl = vi.fn()

    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configGemini({ geminiApiKey: "" }),
      fetchImpl,
    })

    expect(resultado).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("Gemini usa AI_MODEL quando GEMINI_MODEL está vazio", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini(JSON.stringify(respostaValida())),
    }))

    await interpretarMensagemComIA("gstei 35 no mercd", null, {
      aiConfig: configGemini({
        geminiModel: "",
        model: "gemini-modelo-fallback",
      }),
      fetchImpl,
    })

    expect(fetchImpl.mock.calls[0][0])
      .toContain("/models/gemini-modelo-fallback:generateContent")
  })

  it("JSON inválido não quebra e retorna null", async () => {
    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configAI(),
      providerCall: vi.fn(async () => "texto livre"),
    })

    expect(resultado).toBeNull()
  })

  it("loga diagnóstico técnico seguro de erro HTTP do provider", async () => {
    const mensagem = "conteúdo financeiro privado que não deve ir ao log"
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: {
          code: "invalid_json_schema",
          type: "invalid_request_error",
          message: "Invalid schema. Bearer sk-chave-secreta-de-teste",
        },
      }),
    }))

    const resultado = await interpretarMensagemComIA(mensagem, null, {
      aiConfig: configAI({ logEnabled: true, logRaw: false }),
      fetchImpl,
    })

    expect(resultado).toBeNull()
    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      provider: "openai",
      model: "modelo-teste",
      error: "provider_error",
      httpStatus: 400,
      errorCode: "invalid_json_schema",
      errorType: "invalid_request_error",
      timeout: false,
      invalidJson: false,
      structuredOutputError: true,
    })
    expect(payload.errorMessage).toContain("Invalid schema")
    expect(payload.errorMessage).not.toContain("sk-chave-secreta-de-teste")
    expect(payload).not.toHaveProperty("message")
    expect(JSON.stringify(payload)).not.toContain(mensagem)
  })

  it("erro HTTP do Gemini é sanitizado sem expor nenhuma chave", async () => {
    const mensagem = "conteúdo privado do beta"
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({
        error: {
          code: 429,
          status: "RESOURCE_EXHAUSTED",
          message:
            "Quota da gemini-chave-secreta-de-teste e sk-openai-que-nao-pode-aparecer excedida",
        },
      }),
    }))

    await interpretarMensagemComIA(mensagem, null, {
      aiConfig: configGemini({ logEnabled: true, logRaw: false }),
      fetchImpl,
    })

    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      error: "provider_error",
      httpStatus: 429,
      errorCode: "RESOURCE_EXHAUSTED",
      errorType: "gemini_api_error",
      timeout: false,
      invalidJson: false,
    })
    const log = JSON.stringify(payload)
    expect(log).not.toContain("gemini-chave-secreta-de-teste")
    expect(log).not.toContain("sk-openai-que-nao-pode-aparecer")
    expect(log).not.toContain(mensagem)
  })

  it("JSON inválido do Gemini não quebra e é identificado no log", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini("```json\nnão é json\n```"),
    }))

    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configGemini({ logEnabled: true }),
      fetchImpl,
    })

    expect(resultado).toBeNull()
    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      provider: "gemini",
      errorCode: "no_json_object",
      invalidJson: true,
      responseTextLength: "```json\nnão é json\n```".length,
      responseStartsWithBrace: false,
      responseEndsWithBrace: false,
      braceBalance: 0,
      hasFence: true,
      parseStage: "no_json_object",
    })
    expect(loggerMock.info.mock.calls.at(-1)[0])
      .not.toHaveProperty("responseTextPreviewSanitized")
  })

  it("resposta vazia do Gemini cai no fallback sem quebrar", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini(""),
    }))

    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configGemini({ logEnabled: true, logRaw: false }),
      fetchImpl,
    })

    expect(resultado).toBeNull()
    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      errorCode: "no_json_object",
      invalidJson: true,
      responseTextLength: 0,
      parseStage: "empty",
    })
  })

  it("loga truncamento MAX_TOKENS sem registrar o texto bruto", async () => {
    const respostaParcial = "{\"intent\":\"registrar_despesa\""
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: respostaParcial }] },
        }],
      }),
    }))

    await interpretarMensagemComIA("gastei um valor privado", null, {
      aiConfig: configGemini({ logEnabled: true, logRaw: false }),
      fetchImpl,
    })

    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      errorCode: "json_invalido",
      invalidJson: true,
      responseTextLength: respostaParcial.length,
      responseStartsWithBrace: true,
      responseEndsWithBrace: false,
      braceBalance: 1,
      parseStage: "json_incomplete",
      finishReason: "MAX_TOKENS",
    })
    expect(payload).not.toHaveProperty("responseTextPreviewSanitized")
    expect(JSON.stringify(payload)).not.toContain(respostaParcial)
  })

  it("normaliza JSON parcial valido somente para fallback seguro", async () => {
    const resultado = await interpretarMensagemComIA("mensagem ambigua", null, {
      aiConfig: configAI({ logEnabled: true, logRaw: false }),
      providerCall: vi.fn(async () => ({
        transaction: { amount: null },
      })),
    })

    expect(resultado).toMatchObject({
      intent: "desconhecido",
      confidence: 0,
      needs_confirmation: true,
      action: "reformular",
      transaction: { amount: null },
    })
    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      intent: "desconhecido",
      action: "reformular",
      partialObject: true,
    })
  })

  it("identifica objeto parcial que falha na compatibilidade", async () => {
    await interpretarMensagemComIA("gastei algo", null, {
      aiConfig: configAI({ logEnabled: true, logRaw: false }),
      providerCall: vi.fn(async () => ({
        intent: "registrar_despesa",
      })),
    })

    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      errorCode: "campos_incompativeis",
      structuredOutputError: true,
      partialObject: true,
    })
  })

  it("registra bloqueio de seguranca do Gemini sem conteudo bruto", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        promptFeedback: { blockReason: "SAFETY" },
        candidates: [],
      }),
    }))

    await interpretarMensagemComIA("mensagem privada", null, {
      aiConfig: configGemini({ logEnabled: true, logRaw: false }),
      fetchImpl,
    })

    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      errorCode: "no_json_object",
      parseStage: "empty",
      safetyBlockReason: "SAFETY",
    })
    expect(payload).not.toHaveProperty("message")
    expect(payload).not.toHaveProperty("responseTextPreviewSanitized")
  })

  it("Gemini aceita JSON com texto antes e depois", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini(
        `Aqui está o resultado:\n${JSON.stringify(respostaValida())}\nFim.`
      ),
    }))

    const resultado = await interpretarMensagemComIA(
      "gstei 35 no mercd",
      null,
      { aiConfig: configGemini(), fetchImpl }
    )

    expect(resultado).toMatchObject({
      intent: "registrar_despesa",
      action: "executar",
    })
  })

  it("Gemini aceita resposta dividida em múltiplos parts", async () => {
    const json = JSON.stringify(respostaValida())
    const meio = Math.floor(json.length / 2)
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [
              { text: json.slice(0, meio) },
              { text: json.slice(meio) },
            ],
          },
        }],
      }),
    }))

    const resultado = await interpretarMensagemComIA(
      "gstei 35 no mercd",
      null,
      { aiConfig: configGemini(), fetchImpl }
    )

    expect(resultado).toMatchObject({
      intent: "registrar_despesa",
      action: "executar",
    })
  })

  it("debug bruto de JSON inválido redige chaves e é marcado como local", async () => {
    const respostaBruta =
      "erro GEMINI_API_KEY=gemini-chave-secreta-de-teste " +
      "Bearer sk-openai-que-nao-pode-aparecer"
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => respostaGemini(respostaBruta),
    }))

    await interpretarMensagemComIA("mensagem privada", null, {
      aiConfig: configGemini({ logEnabled: true, logRaw: true }),
      fetchImpl,
    })

    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      invalidJson: true,
      localRawDebug: true,
      responseTextLength: respostaBruta.length,
    })
    expect(payload.responseTextPreviewSanitized).toContain("[REDACTED]")
    const log = JSON.stringify(payload)
    expect(log).not.toContain("gemini-chave-secreta-de-teste")
    expect(log).not.toContain("sk-openai-que-nao-pode-aparecer")
  })

  it("timeout do Gemini preserva fallback e loga provider correto", async () => {
    const resultado = await interpretarMensagemComIA(
      "mensagem privada do Gemini",
      null,
      {
        aiConfig: configGemini({
          timeoutMs: 100,
          logEnabled: true,
          logRaw: false,
        }),
        providerCall: vi.fn(() => new Promise(() => {})),
      }
    )

    expect(resultado).toBeNull()
    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      provider: "gemini",
      model: "gemini-2.5-flash",
      error: "timeout",
      errorCode: "timeout",
      timeout: true,
    })
    const log = JSON.stringify(payload)
    expect(log).not.toContain("mensagem privada do Gemini")
    expect(log).not.toContain("gemini-chave-secreta-de-teste")
    expect(log).not.toContain("sk-openai-que-nao-pode-aparecer")
  })

  it("marca JSON inválido sem registrar conteúdo bruto ou chave", async () => {
    const mensagem = "mensagem privada do usuário"

    await interpretarMensagemComIA(mensagem, null, {
      aiConfig: configAI({ logEnabled: true, logRaw: false }),
      providerCall: vi.fn(async () => "texto livre"),
    })

    const payload = loggerMock.info.mock.calls.at(-1)[0]
    expect(payload).toMatchObject({
      error: "invalid_ai_response",
      errorCode: "no_json_object",
      errorType: "invalid_json",
      invalidJson: true,
      structuredOutputError: false,
    })
    expect(payload).not.toHaveProperty("message")
    expect(JSON.stringify(payload)).not.toContain(mensagem)
    expect(JSON.stringify(payload)).not.toContain("sk-chave-secreta-de-teste")
  })

  it("marca erro de schema validado localmente", async () => {
    const resposta = respostaValida()
    resposta.intent = "transferir_dinheiro"

    await interpretarMensagemComIA("transfira 35", null, {
      aiConfig: configAI({ logEnabled: true }),
      providerCall: vi.fn(async () => resposta),
    })

    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      error: "invalid_ai_response",
      errorCode: "intent_invalida",
      errorType: "structured_output_validation",
      invalidJson: false,
      structuredOutputError: true,
    })
  })

  it("timeout não quebra e retorna null", async () => {
    const resultado = await interpretarMensagemComIA("gstei 35", null, {
      aiConfig: configAI({ timeoutMs: 100 }),
      providerCall: vi.fn(() => new Promise(() => {})),
    })

    expect(resultado).toBeNull()
  })

  it("loga timeout com campos técnicos seguros", async () => {
    await interpretarMensagemComIA("mensagem privada", null, {
      aiConfig: configAI({
        timeoutMs: 100,
        logEnabled: true,
        logRaw: false,
      }),
      providerCall: vi.fn(() => new Promise(() => {})),
    })

    expect(loggerMock.info.mock.calls.at(-1)[0]).toMatchObject({
      provider: "openai",
      model: "modelo-teste",
      error: "timeout",
      errorCode: "timeout",
      timeout: true,
      invalidJson: false,
    })
    expect(JSON.stringify(loggerMock.info.mock.calls))
      .not.toContain("mensagem privada")
  })

  it("logs opcionais nunca expõem a API key", async () => {
    await interpretarMensagemComIA("gstei 35 no mercd", null, {
      aiConfig: configAI({ logEnabled: true, logRaw: true }),
      providerCall: vi.fn(async () => respostaValida()),
    })

    const log = JSON.stringify(loggerMock.info.mock.calls)
    expect(log).toContain("registrar_despesa")
    expect(log).toContain("gstei 35 no mercd")
    expect(log).not.toContain("sk-chave-secreta-de-teste")
  })

  it("redige API key mesmo quando o erro técnico a contém", async () => {
    const providerCall = vi.fn(async () => {
      const erro = new Error(
        "Falha usando AI_API_KEY=sk-chave-secreta-de-teste"
      )
      erro.code = "provider_failure"
      erro.type = "network_error"
      throw erro
    })

    await interpretarMensagemComIA("mensagem privada", null, {
      aiConfig: configAI({ logEnabled: true, logRaw: false }),
      providerCall,
    })

    const log = JSON.stringify(loggerMock.info.mock.calls)
    expect(log).toContain("provider_failure")
    expect(log).toContain("network_error")
    expect(log).not.toContain("sk-chave-secreta-de-teste")
    expect(log).not.toContain("mensagem privada")
  })
})
