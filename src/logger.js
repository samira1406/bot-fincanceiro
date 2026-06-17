import pino   from "pino"
import fs     from "fs"
import { config, mascararNumeroBeta } from "./config.js"

const isDev = process.env.NODE_ENV !== "production"

fs.mkdirSync("./logs", { recursive: true })

export const logger = pino(
  { level: config.logLevel },
  isDev
    ? pino.transport({ target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } })
    : pino.destination({ dest: "./logs/bot.log", sync: false })
)

/**
 * Loga mensagem recebida sem expor o conteúdo.
 * @param {string} usuarioId
 * @param {string} comando  — apenas a primeira palavra (o comando)
 */
export function logMensagem(usuarioId, comando) {
  logger.info({ usuarioId: mascararNumeroBeta(usuarioId), comando }, "msg recebida")
}
