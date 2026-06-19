import { config } from "./config.js"
import { logger } from "./logger.js"
import { validarInterpretacaoAI } from "./aiValidation.js"
import {
  chamarProviderAI,
  resolverConfiguracaoProvider,
} from "./aiProviders/index.js"
import { analisarJsonObjectSafely } from "./aiProviders/providerUtils.js"

function resumirTextoSeguro(valor, aiConfig, limite = 240) {
  if (valor === undefined || valor === null) return null

  let texto = String(valor)
  const segredos = [
    aiConfig?.apiKey,
    aiConfig?.geminiApiKey,
    ...(aiConfig?.secretValues ?? []),
  ]
    .map(valor => String(valor ?? "").trim())
    .filter(Boolean)
  for (const segredo of segredos) {
    texto = texto.split(segredo).join("[REDACTED]")
  }

  texto = texto
    .replace(/\bBearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED]")
    .replace(/\b(AI_API_KEY|GEMINI_API_KEY)\s*=\s*\S+/giu,
      "$1=[REDACTED]")
    .replace(/(["']?(?:api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^"',\s}]+/giu,
      "$1[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()

  if (!texto) return null
  return texto.length > limite ? `${texto.slice(0, limite - 3)}...` : texto
}

function ehErroStructuredOutput(dados = {}) {
  const texto = [
    dados.error,
    dados.errorCode,
    dados.errorType,
    dados.errorMessage,
  ].filter(Boolean).join(" ").toLowerCase()

  return /(?:schema|structured|json_schema|response_format|campos_invalidos|campos_incompativeis|intent_invalida|opcoes_invalidas)/u
    .test(texto)
}

function normalizarResultadoProvider(bruto) {
  if (bruto?.__aiProviderResult === true) {
    return {
      value: bruto.value,
      rawText: typeof bruto.rawText === "string" ? bruto.rawText : "",
      diagnostics: bruto.diagnostics ?? {},
    }
  }

  const analise = analisarJsonObjectSafely(bruto)
  const rawText = typeof bruto === "string"
    ? bruto
    : JSON.stringify(bruto ?? "")

  return {
    value: analise.value ?? bruto,
    rawText,
    diagnostics: {
      ...analise,
      value: undefined,
      responseTextLength: rawText.length,
    },
  }
}

function registrarLogAI(aiConfig, dados, mensagem) {
  if (!aiConfig?.logEnabled) return
  const payload = {
    provider: resumirTextoSeguro(aiConfig.provider, aiConfig, 40),
    model: resumirTextoSeguro(aiConfig.model, aiConfig, 100),
    intent: dados.intent ?? null,
    confidence: dados.confidence ?? null,
    action: dados.action ?? null,
    needsConfirmation: dados.needsConfirmation ?? null,
    error: dados.error ?? null,
    httpStatus: Number.isInteger(dados.httpStatus) ? dados.httpStatus : null,
    errorCode: resumirTextoSeguro(dados.errorCode, aiConfig, 100),
    errorType: resumirTextoSeguro(dados.errorType, aiConfig, 100),
    errorMessage: resumirTextoSeguro(dados.errorMessage, aiConfig),
    timeout: Boolean(dados.timeout),
    invalidJson: Boolean(dados.invalidJson),
    structuredOutputError: Boolean(
      dados.structuredOutputError || ehErroStructuredOutput(dados)
    ),
    responseTextLength: Number.isInteger(dados.responseTextLength)
      ? dados.responseTextLength
      : null,
    responseStartsWithBrace:
      typeof dados.responseStartsWithBrace === "boolean"
        ? dados.responseStartsWithBrace
        : null,
    responseEndsWithBrace:
      typeof dados.responseEndsWithBrace === "boolean"
        ? dados.responseEndsWithBrace
        : null,
    braceBalance: Number.isInteger(dados.braceBalance)
      ? dados.braceBalance
      : null,
    hasFence: typeof dados.hasFence === "boolean" ? dados.hasFence : null,
    parseStage: resumirTextoSeguro(dados.parseStage, aiConfig, 80),
    finishReason: resumirTextoSeguro(dados.finishReason, aiConfig, 80),
    safetyBlockReason: resumirTextoSeguro(
      dados.safetyBlockReason,
      aiConfig,
      120
    ),
    partialObject: typeof dados.partialObject === "boolean"
      ? dados.partialObject
      : null,
  }
  if (aiConfig.logRaw) {
    payload.message = resumirTextoSeguro(mensagem, aiConfig, 300)
    if (dados.responseTextPreview !== undefined) {
      payload.responseTextPreviewSanitized = resumirTextoSeguro(
        dados.responseTextPreview,
        aiConfig,
        500
      )
      payload.localRawDebug = true
    }
  }
  logger.info(payload, "[AI_INTERPRETER]")
}

export async function interpretarMensagemComIA(
  mensagem,
  contextoMinimo = null,
  {
    aiConfig = config.ai,
    fetchImpl = globalThis.fetch,
    providerCall = null,
  } = {}
) {
  if (!aiConfig?.enabled) return null
  const providerConfig = resolverConfiguracaoProvider(aiConfig)
  const configLog = {
    ...aiConfig,
    provider: providerConfig?.provider ?? aiConfig.provider,
    model: providerConfig?.model ?? aiConfig.model,
    apiKey: providerConfig?.apiKey ?? "",
    secretValues: [aiConfig.apiKey, aiConfig.geminiApiKey],
  }

  if (!providerConfig) {
    registrarLogAI(configLog, {
      error: "provider_nao_suportado",
      errorCode: "provider_nao_suportado",
      errorType: "configuration_error",
    }, mensagem)
    return null
  }

  if (!providerCall &&
      (!providerConfig.apiKey || !providerConfig.model || !fetchImpl)) {
    registrarLogAI(configLog, {
      error: "config_incompleta",
      errorCode: "provider_config_incomplete",
      errorType: "configuration_error",
    }, mensagem)
    return null
  }

  const timeoutMs = Math.max(100, Number(aiConfig.timeoutMs) || 8_000)
  const controller = new AbortController()
  let timer

  try {
    const chamada = providerCall
      ? providerCall({
          mensagem: String(mensagem ?? ""),
          contextoMinimo,
          provider: providerConfig.provider,
          model: providerConfig.model,
          signal: controller.signal,
        })
      : chamarProviderAI(providerConfig, {
          mensagem,
          contextoMinimo,
          fetchImpl,
          signal: controller.signal,
        })

    const bruto = await Promise.race([
      chamada,
      new Promise((_, rejeitar) => {
        timer = setTimeout(() => {
          controller.abort()
          const erro = new Error("ai_timeout")
          erro.code = "timeout"
          rejeitar(erro)
        }, timeoutMs)
      }),
    ])
    const resultadoProvider = normalizarResultadoProvider(bruto)
    const validacao = validarInterpretacaoAI(resultadoProvider.value, {
      valorMaximo: config.valorMaximo,
      minConfidence: aiConfig.minConfidence,
      confirmationConfidence: aiConfig.confirmationConfidence,
      mensagemOriginal: mensagem,
    })

    if (!validacao.ok) {
      const diagnostico = {
        ...resultadoProvider.diagnostics,
        parseStage:
          resultadoProvider.diagnostics.parseStage ??
          validacao.parseStage ??
          null,
      }
      const erroJson = ["json_invalido", "no_json_object"]
        .includes(validacao.erro)
      registrarLogAI(configLog, {
        ...diagnostico,
        error: "invalid_ai_response",
        errorCode: validacao.erro,
        errorType: erroJson
          ? "invalid_json"
          : "structured_output_validation",
        errorMessage: `Resposta da IA rejeitada: ${validacao.erro}`,
        invalidJson: erroJson,
        structuredOutputError: !erroJson,
        responseTextLength: resultadoProvider.rawText.length,
        responseTextPreview: resultadoProvider.rawText,
        partialObject: validacao.normalizedPartial,
      }, mensagem)
      return null
    }

    registrarLogAI(configLog, {
      ...resultadoProvider.diagnostics,
      intent: validacao.valor.intent,
      confidence: validacao.valor.confidence,
      action: validacao.valor.action,
      needsConfirmation: validacao.valor.action === "confirmar",
      partialObject: validacao.normalizedPartial,
    }, mensagem)
    return validacao.valor
  } catch (erro) {
    const timeout = erro?.code === "timeout" || erro?.name === "AbortError"
    registrarLogAI(configLog, {
      error: timeout ? "timeout" : "provider_error",
      httpStatus: erro?.httpStatus,
      errorCode: erro?.code ?? null,
      errorType: erro?.type ?? erro?.name ?? null,
      errorMessage: erro?.message ?? null,
      timeout,
      structuredOutputError: ehErroStructuredOutput({
        errorCode: erro?.code,
        errorType: erro?.type,
        errorMessage: erro?.message,
      }),
    }, mensagem)
    return null
  } finally {
    clearTimeout(timer)
  }
}
