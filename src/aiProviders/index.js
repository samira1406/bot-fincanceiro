import { chamarGeminiProvider } from "./geminiProvider.js"
import { chamarOpenAIProvider } from "./openaiProvider.js"

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash"

export function resolverConfiguracaoProvider(aiConfig = {}) {
  const provider = String(aiConfig.provider ?? "openai").trim().toLowerCase()

  if (provider === "openai") {
    return {
      provider,
      model: String(aiConfig.model ?? "").trim(),
      apiKey: String(aiConfig.apiKey ?? "").trim(),
      call: chamarOpenAIProvider,
    }
  }

  if (provider === "gemini") {
    return {
      provider,
      model: String(
        aiConfig.geminiModel ||
        aiConfig.model ||
        GEMINI_DEFAULT_MODEL
      ).trim(),
      apiKey: String(aiConfig.geminiApiKey ?? "").trim(),
      maxOutputTokens: Number(aiConfig.geminiMaxOutputTokens) || 1200,
      call: chamarGeminiProvider,
    }
  }

  return null
}

export async function chamarProviderAI(providerConfig, opcoes) {
  return providerConfig.call({
    ...opcoes,
    providerConfig,
  })
}
