export async function criarErroHttpProvider(
  resposta,
  {
    provider,
    fallbackCode = "provider_http_error",
    fallbackType = "provider_http_error",
  } = {}
) {
  let corpo = null

  try {
    if (typeof resposta.text === "function") {
      const texto = await resposta.text()
      if (texto) {
        try {
          corpo = JSON.parse(texto)
        } catch {
          corpo = { error: { message: texto } }
        }
      }
    } else if (typeof resposta.json === "function") {
      corpo = await resposta.json()
    }
  } catch {
    corpo = null
  }

  const detalhe = corpo?.error ?? corpo ?? {}
  const errorCode = detalhe.status ?? detalhe.code ?? fallbackCode
  const errorType = detalhe.type ?? (
    provider ? `${provider}_api_error` : fallbackType
  )
  const erro = new Error(
    detalhe.message || `${provider ?? "provider"}_http_${resposta.status}`
  )
  erro.code = String(errorCode)
  erro.type = String(errorType || fallbackType)
  erro.httpStatus = Number.isInteger(resposta.status) ? resposta.status : null
  return erro
}

export function cleanJsonText(texto) {
  let valor = String(texto ?? "")
    .replace(/^\uFEFF/u, "")
    .trim()
  valor = valor
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim()
  return valor
}

function extrairObjetoBalanceadoAPartir(valor, inicio) {
  let profundidade = 0
  let emString = false
  let escape = false

  for (let indice = inicio; indice < valor.length; indice++) {
    const caractere = valor[indice]

    if (escape) {
      escape = false
      continue
    }
    if (emString && caractere === "\\") {
      escape = true
      continue
    }
    if (caractere === "\"") {
      emString = !emString
      continue
    }
    if (emString) continue

    if (caractere === "{") profundidade++
    if (caractere === "}") {
      profundidade--
      if (profundidade === 0) {
        return valor.slice(inicio, indice + 1).trim()
      }
    }
  }

  return null
}

function objetoJsonSimples(valor) {
  return valor !== null &&
    typeof valor === "object" &&
    !Array.isArray(valor)
}

function calcularBalanceamentoChaves(valor) {
  let balanceamento = 0
  let emString = false
  let escape = false

  for (const caractere of valor) {
    if (escape) {
      escape = false
      continue
    }
    if (emString && caractere === "\\") {
      escape = true
      continue
    }
    if (caractere === "\"") {
      emString = !emString
      continue
    }
    if (emString) continue
    if (caractere === "{") balanceamento++
    if (caractere === "}") balanceamento--
  }

  return balanceamento
}

export function diagnosticarTextoJson(texto) {
  const resposta = typeof texto === "string" ? texto : ""
  const limpo = cleanJsonText(resposta)

  return {
    responseTextLength: resposta.length,
    responseStartsWithBrace: limpo.startsWith("{"),
    responseEndsWithBrace: limpo.endsWith("}"),
    braceBalance: calcularBalanceamentoChaves(limpo),
    hasFence: /```(?:json)?/iu.test(resposta),
  }
}

export function extractFirstJsonObject(texto) {
  const valor = cleanJsonText(texto)

  for (let inicio = valor.indexOf("{"); inicio >= 0;) {
    const candidato = extrairObjetoBalanceadoAPartir(valor, inicio)
    if (candidato) return candidato
    inicio = valor.indexOf("{", inicio + 1)
  }

  return null
}

export function analisarJsonObjectSafely(valorBruto) {
  if (objetoJsonSimples(valorBruto)) {
    return {
      value: valorBruto,
      parseStage: "provider_object",
      ...diagnosticarTextoJson(""),
    }
  }
  if (Array.isArray(valorBruto)) {
    return {
      value: null,
      parseStage: "array_rejected",
      ...diagnosticarTextoJson(JSON.stringify(valorBruto)),
    }
  }
  if (typeof valorBruto !== "string") {
    return {
      value: null,
      parseStage: "invalid_type",
      ...diagnosticarTextoJson(""),
    }
  }

  let valor = cleanJsonText(valorBruto)
  const diagnostico = diagnosticarTextoJson(valorBruto)
  if (!valor) {
    return {
      value: null,
      parseStage: "empty",
      ...diagnostico,
    }
  }

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const parseado = JSON.parse(valor)
      if (objetoJsonSimples(parseado)) {
        return {
          value: parseado,
          parseStage: tentativa === 0 ? "direct_json" : "escaped_json",
          ...diagnostico,
        }
      }
      if (typeof parseado === "string") {
        valor = cleanJsonText(parseado)
        continue
      }
      return {
        value: null,
        parseStage: Array.isArray(parseado)
          ? "array_rejected"
          : "primitive_rejected",
        ...diagnostico,
      }
    } catch {
      break
    }
  }

  let encontrouAbertura = false
  let encontrouObjetoBalanceado = false

  for (let inicio = valor.indexOf("{"); inicio >= 0;) {
    encontrouAbertura = true
    const candidato = extrairObjetoBalanceadoAPartir(valor, inicio)
    if (candidato) {
      encontrouObjetoBalanceado = true
      try {
        const parseado = JSON.parse(candidato)
        if (objetoJsonSimples(parseado)) {
          return {
            value: parseado,
            parseStage: "extracted_json_object",
            ...diagnostico,
          }
        }
      } catch {
        // Continua procurando outro objeto completo.
      }
    }
    inicio = valor.indexOf("{", inicio + 1)
  }

  return {
    value: null,
    parseStage: !encontrouAbertura
      ? "no_json_object"
      : encontrouObjetoBalanceado
        ? "json_broken"
        : "json_incomplete",
    ...diagnostico,
  }
}

export function parseJsonObjectSafely(valorBruto) {
  return analisarJsonObjectSafely(valorBruto).value
}

export const limparBlocoJson = cleanJsonText
