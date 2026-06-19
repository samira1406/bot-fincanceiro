import { describe, expect, it } from "vitest"
import {
  GEMINI_DEFAULT_MODEL,
  resolverConfiguracaoProvider,
} from "../src/aiProviders/index.js"
import {
  extractGeminiText,
  prepararResultadoGemini,
  prepararTextoJsonGemini,
} from "../src/aiProviders/geminiProvider.js"
import {
  analisarJsonObjectSafely,
  cleanJsonText,
  diagnosticarTextoJson,
  extractFirstJsonObject,
  parseJsonObjectSafely,
} from "../src/aiProviders/providerUtils.js"

describe("seleção de providers da IA", () => {
  it("mantém OpenAI usando AI_API_KEY e AI_MODEL", () => {
    const provider = resolverConfiguracaoProvider({
      provider: "openai",
      apiKey: "openai-key",
      model: "openai-model",
      geminiApiKey: "gemini-key",
      geminiModel: "gemini-model",
    })

    expect(provider).toMatchObject({
      provider: "openai",
      apiKey: "openai-key",
      model: "openai-model",
    })
  })

  it("Gemini usa suas variáveis próprias", () => {
    const provider = resolverConfiguracaoProvider({
      provider: "gemini",
      apiKey: "openai-key",
      model: "openai-model",
      geminiApiKey: "gemini-key",
      geminiModel: "gemini-model",
      geminiMaxOutputTokens: 2048,
    })

    expect(provider).toMatchObject({
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-model",
      maxOutputTokens: 2048,
    })
  })

  it("Gemini usa AI_MODEL e depois default interno como fallback", () => {
    expect(resolverConfiguracaoProvider({
      provider: "gemini",
      model: "modelo-fallback",
      geminiApiKey: "gemini-key",
      geminiModel: "",
    }).model).toBe("modelo-fallback")

    expect(resolverConfiguracaoProvider({
      provider: "gemini",
      model: "",
      geminiApiKey: "gemini-key",
      geminiModel: "",
    }).model).toBe(GEMINI_DEFAULT_MODEL)
  })

  it("não seleciona provider ainda não implementado", () => {
    expect(resolverConfiguracaoProvider({
      provider: "ollama",
    })).toBeNull()
  })
})

describe("extração segura do JSON do Gemini", () => {
  it("extrai candidates[0].content.parts[0].text", () => {
    expect(extractGeminiText({
      candidates: [{
        content: { parts: [{ text: "{\"ok\":true}" }] },
      }],
    })).toBe("{\"ok\":true}")
  })

  it("concatena múltiplos parts de texto", () => {
    const resposta = {
      candidates: [{
        content: {
          parts: [
            { text: "{\"intent\":" },
            { inlineData: { mimeType: "text/plain" } },
            { text: "\"desconhecido\"}" },
          ],
        },
      }],
    }

    expect(extractGeminiText(resposta))
      .toBe("{\"intent\":\"desconhecido\"}")
    expect(prepararTextoJsonGemini(resposta))
      .toEqual({ intent: "desconhecido" })
  })

  it("remove fence json, BOM e espaços", () => {
    const texto = "\uFEFF  ```json\n{\"ok\":true}\n```  "

    expect(cleanJsonText(texto)).toBe("{\"ok\":true}")
    expect(parseJsonObjectSafely(texto)).toEqual({ ok: true })
  })

  it("não altera cercas Markdown legítimas dentro de string JSON", () => {
    const texto = "{\"texto\":\"use ```json como exemplo\"}"

    expect(cleanJsonText(texto)).toBe(texto)
    expect(parseJsonObjectSafely(texto)).toEqual({
      texto: "use ```json como exemplo",
    })
  })

  it("extrai o primeiro objeto JSON válido com texto antes e depois", () => {
    const texto =
      "Claro! {isto não é json} resultado: {\"ok\":true,\"texto\":\"chave } dentro\"} fim"

    expect(parseJsonObjectSafely(texto)).toEqual({
      ok: true,
      texto: "chave } dentro",
    })
  })

  it("extrai objeto balanceado respeitando strings e escapes", () => {
    const texto = "prefixo {\"texto\":\"aspas: \\\" e chave }\",\"n\":1} sufixo"

    expect(extractFirstJsonObject(texto))
      .toBe("{\"texto\":\"aspas: \\\" e chave }\",\"n\":1}")
  })

  it("trata string JSON escapada e rejeita array principal", () => {
    const objeto = { intent: "desconhecido" }

    expect(parseJsonObjectSafely(JSON.stringify(JSON.stringify(objeto))))
      .toEqual(objeto)
    expect(parseJsonObjectSafely("[{\"intent\":\"desconhecido\"}]"))
      .toBeNull()
  })

  it("retorna null para vazio, texto livre ou objeto incompleto", () => {
    expect(parseJsonObjectSafely("")).toBeNull()
    expect(parseJsonObjectSafely("nenhum json aqui")).toBeNull()
    expect(parseJsonObjectSafely("prefixo {\"ok\": true")).toBeNull()
  })

  it("classifica objeto ausente, JSON quebrado e JSON incompleto", () => {
    expect(analisarJsonObjectSafely("resposta livre")).toMatchObject({
      value: null,
      parseStage: "no_json_object",
    })
    expect(analisarJsonObjectSafely("{ok:true}")).toMatchObject({
      value: null,
      parseStage: "json_broken",
    })
    expect(analisarJsonObjectSafely("{\"ok\":true")).toMatchObject({
      value: null,
      parseStage: "json_incomplete",
      responseStartsWithBrace: true,
      responseEndsWithBrace: false,
      braceBalance: 1,
    })
  })

  it("preserva metadados seguros do Gemini sem misturar com o JSON", () => {
    const resultado = prepararResultadoGemini({
      candidates: [{
        finishReason: "MAX_TOKENS",
        content: { parts: [{ text: "{\"intent\":\"desconhecido\"" }] },
      }],
      promptFeedback: {},
    })

    expect(resultado).toMatchObject({
      __aiProviderResult: true,
      rawText: "{\"intent\":\"desconhecido\"",
      diagnostics: {
        responseTextLength: 24,
        responseStartsWithBrace: true,
        responseEndsWithBrace: false,
        braceBalance: 1,
        hasFence: false,
        parseStage: "json_incomplete",
        finishReason: "MAX_TOKENS",
        safetyBlockReason: null,
      },
    })
    expect(resultado.value).toBe("{\"intent\":\"desconhecido\"")
  })

  it("diagnostica fences sem expor o conteudo no objeto de metricas", () => {
    const diagnostico = diagnosticarTextoJson("```json\n{\"ok\":true}\n```")

    expect(diagnostico).toEqual({
      responseTextLength: 23,
      responseStartsWithBrace: true,
      responseEndsWithBrace: true,
      braceBalance: 0,
      hasFence: true,
    })
    expect(diagnostico).not.toHaveProperty("text")
  })
})
