import "dotenv/config"
import { logger }    from "./src/logger.js"
import { iniciarBot } from "./src/bot.js"

process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "unhandledRejection")
})

process.on("uncaughtException", (err) => {
  logger.error({ err: err.message, stack: err.stack }, "uncaughtException")
})

logger.info("🤖 Bot de Finanças v3.0 iniciando...")
iniciarBot()
