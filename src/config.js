import * as dotenv from "dotenv"

if (process.env.NODE_ENV !== "test") {
  dotenv.config()
}

/**
 * @param {string} key
 * @param {string|undefined} fallback
 * @returns {string}
 */
function requireEnv(env, key, fallback) {
  const val = env[key]
  if (val === undefined || val === "") {
    if (fallback !== undefined) return fallback
    throw new Error(`Variável de ambiente obrigatória não definida: ${key}`)
  }
  return val
}

function boolEnv(env, key, fallback = false) {
  const val = env[key]
  if (val === undefined || val === "") return fallback
  return ["true", "1", "sim", "yes"].includes(val.trim().toLowerCase())
}

function numberEnv(env, key, fallback, { min = -Infinity, max = Infinity } = {}) {
  const numero = Number(env[key] ?? fallback)
  if (!Number.isFinite(numero)) return fallback
  return Math.min(max, Math.max(min, numero))
}

function firstEnv(env, keys, fallback) {
  for (const key of keys) {
    const val = env[key]
    if (val !== undefined && val !== "") return val
  }
  if (fallback !== undefined) return fallback
  throw new Error(`Variável de ambiente obrigatória não definida: ${keys.join(" ou ")}`)
}

function menuModeEnv(env) {
  const modo = String(env.WHATSAPP_MENU_MODE ?? "").trim().toLowerCase()
  if (["text", "interactive", "auto"].includes(modo)) return modo
  return boolEnv(env, "WHATSAPP_INTERACTIVE_ENABLED", false)
    ? "interactive"
    : "text"
}

export function normalizarNumeroWhatsApp(valor) {
  const base = String(valor ?? "").split("@")[0].split(":")[0]
  return base.replace(/\D/g, "")
}

export function normalizarJidBeta(valor) {
  const texto = String(valor ?? "").trim().toLowerCase()
  if (!texto) return ""
  const [antesArroba, depoisArroba] = texto.split("@")
  if (!depoisArroba) return texto
  const usuario = antesArroba.split(":")[0].replace(/\s+/g, "")
  return `${usuario}@${depoisArroba}`
}

function isJidLid(valor) {
  return normalizarJidBeta(valor).endsWith("@lid")
}

export function normalizarNumeroBeta(valor) {
  return normalizarNumeroWhatsApp(valor)
}

export function gerarVariantesNumeroBrasil(valor) {
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

export function mascararNumeroBeta(valor) {
  const numero = normalizarNumeroWhatsApp(valor)
  if (!numero) return ""
  if (numero.length <= 8) return "****"
  return `${numero.slice(0, 5)}****${numero.slice(-4)}`
}

export function mascararIdentificadorBeta(valor) {
  const jid = normalizarJidBeta(valor)
  const numero = normalizarNumeroWhatsApp(valor)
  if (numero.length >= 9) {
    const sufixo = jid.includes("@") ? `@${jid.split("@").at(-1)}` : ""
    return `${mascararNumeroBeta(numero)}${sufixo}`
  }
  if (jid.includes("@")) {
    const [usuario, dominio] = jid.split("@")
    const prefixo = usuario.length <= 4 ? "****" : `${usuario.slice(0, 4)}****${usuario.slice(-4)}`
    return `${prefixo}@${dominio}`
  }
  return jid ? "****" : ""
}

function parseNumerosBeta(valor) {
  return String(valor ?? "")
    .split(",")
    .map(normalizarNumeroWhatsApp)
    .filter(Boolean)
}

function parseJidsBeta(valor) {
  return String(valor ?? "")
    .split(",")
    .map(normalizarJidBeta)
    .filter(Boolean)
}

export function carregarConfig(env = process.env) {
  const gruposPrincipais = [requireEnv(env, "GRUPO_PERMITIDO", "120363408102479565@g.us")]
  const gruposExtras     = (env.GRUPOS_EXTRAS ?? "")
    .split(",").map(g => g.trim()).filter(Boolean)

  return {
    // WhatsApp — suporte a múltiplos grupos
    gruposPermitidos: [...gruposPrincipais, ...gruposExtras],
    grupoPermitido:   gruposPrincipais[0],   // mantido para compatibilidade

    palavrasEntrada: requireEnv(env, "PALAVRAS_ENTRADA", "salario,extra,freela,bonus,pix")
      .split(",").map(p => p.trim().toLowerCase()),

    // Regras financeiras
    caixinhaPercentual: Number(requireEnv(env, "CAIXINHA_PERCENTUAL", "30")) / 100,
    valorMaximo:        Number(requireEnv(env, "VALOR_MAXIMO", "100000")),

    // Comportamento
    timeoutEstadoMs:    Number(requireEnv(env, "TIMEOUT_ESTADO_MINUTOS", "10")) * 60_000,
    horaLembreteMensal: Number(requireEnv(env, "HORA_LEMBRETE_MENSAL", "20")),
    whatsappInteractiveEnabled: boolEnv(env, "WHATSAPP_INTERACTIVE_ENABLED", false),
    whatsappMenuMode: menuModeEnv(env),

    // Rate limiting
    rateLimitPorMinuto: Number(requireEnv(env, "RATE_LIMIT_MSG_POR_MINUTO", "15")),

    // Beta fechado
    beta: {
      ativo: boolEnv(env, "BETA_MODE", false),
      responderBloqueado: boolEnv(env, "BETA_BLOCKED_REPLY", false),
      debug: boolEnv(env, "BETA_DEBUG", false),
      debugMostrarRaw: boolEnv(env, "BETA_DEBUG_SHOW_RAW", false),
      numerosAutorizados: parseNumerosBeta(env.BETA_ALLOWED_NUMBERS),
      jidsAutorizados: parseJidsBeta(env.BETA_ALLOWED_JIDS),
      gruposAutorizados: parseJidsBeta(env.BETA_ALLOWED_GROUPS),
      exigirParticipanteAutorizado: boolEnv(env, "BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT", true),
    },

    // IA opcional: apenas interpretação estruturada
    ai: {
      enabled: boolEnv(env, "AI_INTERPRETER_ENABLED", false),
      provider: String(env.AI_PROVIDER ?? "openai").trim().toLowerCase(),
      model: String(env.AI_MODEL ?? "").trim(),
      apiKey: String(env.AI_API_KEY ?? "").trim(),
      geminiApiKey: String(env.GEMINI_API_KEY ?? "").trim(),
      geminiModel: String(env.GEMINI_MODEL ?? "gemini-2.5-flash").trim(),
      geminiMaxOutputTokens: numberEnv(
        env,
        "GEMINI_MAX_OUTPUT_TOKENS",
        1200,
        { min: 256, max: 8192 }
      ),
      minConfidence: numberEnv(env, "AI_MIN_CONFIDENCE", 0.85, { min: 0, max: 1 }),
      confirmationConfidence: numberEnv(
        env,
        "AI_CONFIRMATION_CONFIDENCE",
        0.60,
        { min: 0, max: 1 }
      ),
      timeoutMs: numberEnv(env, "AI_TIMEOUT_MS", 8_000, { min: 100, max: 30_000 }),
      logEnabled: boolEnv(env, "AI_LOG_ENABLED", false),
      logRaw: boolEnv(env, "AI_LOG_RAW", false),
    },

    // Painel web
    painel: {
      porta: Number(firstEnv(env, ["PAINEL_PORTA", "PORT"], "3000")),
      token: firstEnv(env, ["PAINEL_TOKEN", "DASHBOARD_TOKEN"], "dev-token-inseguro"),
    },

    // Backup
    backupMantenerDias: Number(requireEnv(env, "BACKUP_MANTER_DIAS", "7")),

    // Reconexão
    reconexao: {
      maxTentativas: 10,
      delayInicial:  3_000,
      delayMaximo:   120_000,
      fator:         2,
    },

    // Paths
    dbPath:     requireEnv(env, "DATABASE_PATH", "./database/financas.db"),
    backupDir:  requireEnv(env, "BACKUP_DIR", "./database/backups"),
    authPath:   "./auth",

    // Logs
    logLevel: requireEnv(env, "LOG_LEVEL", "info"),
  }
}

export const config = carregarConfig()

export function grupoAutorizadoBeta(groupJid, beta = config.beta) {
  const grupo = normalizarJidBeta(groupJid)
  if (!grupo || !grupo.endsWith("@g.us")) return false

  const gruposAutorizados = new Set(
    (beta?.gruposAutorizados ?? [])
      .map(normalizarJidBeta)
      .filter(Boolean)
  )

  return gruposAutorizados.has(grupo)
}

export function usuarioAutorizadoBeta(usuarioId, beta = config.beta) {
  const jidUsuario = normalizarJidBeta(usuarioId)
  const numerosCandidatos = isJidLid(jidUsuario)
    ? []
    : gerarVariantesNumeroBrasil(usuarioId)

  return avaliarAutorizacaoBetaCandidatos({
    candidateJids: jidUsuario ? [jidUsuario] : [],
    normalizedNumbers: numerosCandidatos,
  }, beta).autorizado
}

/**
 * Compara os candidatos extraídos da mensagem com a whitelist do beta.
 * O retorno detalhado é usado tanto pela decisão quanto pelo debug local.
 */
export function avaliarAutorizacaoBetaCandidatos(
  { candidateJids = [], normalizedNumbers = [] } = {},
  beta = config.beta
) {
  const jidsCandidatos = [...new Set(
    candidateJids
      .map(normalizarJidBeta)
      .filter(jid => jid && !jid.endsWith("@g.us"))
  )]
  const numerosCandidatos = [...new Set(
    normalizedNumbers.flatMap(gerarVariantesNumeroBrasil)
  )]

  const numerosAutorizados = [...new Set(
    (beta?.numerosAutorizados ?? [])
      .flatMap(gerarVariantesNumeroBrasil)
  )]
  const jidsAutorizados = [...new Set(
    (beta?.jidsAutorizados ?? [])
      .map(normalizarJidBeta)
      .filter(Boolean)
  )]

  const conjuntoNumeros = new Set(numerosAutorizados)
  const conjuntoJids = new Set(jidsAutorizados)
  const numerosCorrespondentes = numerosCandidatos
    .filter(numero => conjuntoNumeros.has(numero))
  const jidsCorrespondentes = jidsCandidatos
    .filter(jid => conjuntoJids.has(jid))
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
