import {
  AI_INTERPRETER_SYSTEM_PROMPT,
  criarEntradaAI,
} from "../aiPrompts.js"
import {
  analisarJsonObjectSafely,
  cleanJsonText,
  criarErroHttpProvider,
  parseJsonObjectSafely,
} from "./providerUtils.js"

export function extractGeminiText(resposta) {
  const partes = resposta?.candidates?.[0]?.content?.parts ?? []
  return partes
    .map(parte => typeof parte?.text === "string" ? parte.text : "")
    .filter(Boolean)
    .join("")
    .trim()
}

export function prepararTextoJsonGemini(resposta) {
  const texto = cleanJsonText(extractGeminiText(resposta))
  return parseJsonObjectSafely(texto) ?? texto
}

export function prepararResultadoGemini(resposta) {
  const rawText = extractGeminiText(resposta)
  const analise = analisarJsonObjectSafely(rawText)
  const candidato = resposta?.candidates?.[0] ?? {}
  const {
    value,
    ...diagnostics
  } = analise

  return {
    __aiProviderResult: true,
    value: value ?? cleanJsonText(rawText),
    rawText,
    diagnostics: {
      ...diagnostics,
      finishReason: candidato.finishReason ?? null,
      safetyBlockReason:
        resposta?.promptFeedback?.blockReason ??
        (candidato.finishReason === "SAFETY" ? "SAFETY" : null),
    },
  }
}

export async function chamarGeminiProvider({
  mensagem,
  contextoMinimo,
  providerConfig,
  fetchImpl,
  signal,
}) {
  const modelo = encodeURIComponent(providerConfig.model)
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`
  const resposta = await fetchImpl(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": providerConfig.apiKey,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: AI_INTERPRETER_SYSTEM_PROMPT }],
      },
      contents: [{
        role: "user",
        parts: [{ text: criarEntradaAI(mensagem, contextoMinimo) }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: providerConfig.maxOutputTokens ?? 1200,
        temperature: 0,
      },
    }),
  })

  if (!resposta.ok) {
    throw await criarErroHttpProvider(resposta, { provider: "gemini" })
  }

  const payload = await resposta.json()
  return prepararResultadoGemini(payload)
}
