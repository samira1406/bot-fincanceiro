import "dotenv/config"

/**
 * @param {string} key
 * @param {string|undefined} fallback
 * @returns {string}
 */
function requireEnv(key, fallback) {
  const val = process.env[key]
  if (val === undefined || val === "") {
    if (fallback !== undefined) return fallback
    throw new Error(`Variável de ambiente obrigatória não definida: ${key}`)
  }
  return val
}

const gruposPrincipais = [requireEnv("GRUPO_PERMITIDO", "120363408102479565@g.us")]
const gruposExtras     = (process.env.GRUPOS_EXTRAS ?? "")
  .split(",").map(g => g.trim()).filter(Boolean)

export const config = {
  // WhatsApp — suporte a múltiplos grupos
  gruposPermitidos: [...gruposPrincipais, ...gruposExtras],
  grupoPermitido:   gruposPrincipais[0],   // mantido para compatibilidade

  palavrasEntrada: requireEnv("PALAVRAS_ENTRADA", "salario,extra,freela,bonus,pix")
    .split(",").map(p => p.trim().toLowerCase()),

  // Regras financeiras
  caixinhaPercentual: Number(requireEnv("CAIXINHA_PERCENTUAL", "30")) / 100,
  valorMaximo:        Number(requireEnv("VALOR_MAXIMO", "100000")),

  // Comportamento
  timeoutEstadoMs:    Number(requireEnv("TIMEOUT_ESTADO_MINUTOS", "10")) * 60_000,
  horaLembreteMensal: Number(requireEnv("HORA_LEMBRETE_MENSAL", "20")),

  // Rate limiting
  rateLimitPorMinuto: Number(requireEnv("RATE_LIMIT_MSG_POR_MINUTO", "15")),

  // Painel web
  painel: {
    porta: Number(requireEnv("PAINEL_PORTA", "3000")),
    token: requireEnv("PAINEL_TOKEN", "dev-token-inseguro"),
  },

  // Backup
  backupMantenerDias: Number(requireEnv("BACKUP_MANTER_DIAS", "7")),

  // Reconexão
  reconexao: {
    maxTentativas: 10,
    delayInicial:  3_000,
    delayMaximo:   120_000,
    fator:         2,
  },

  // Paths
  dbPath:     "./database/financas.db",
  backupDir:  "./database/backups",
  authPath:   "./auth",

  // Logs
  logLevel: requireEnv("LOG_LEVEL", "info"),
}
