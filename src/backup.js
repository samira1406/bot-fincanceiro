/**
 * @fileoverview Backup automático do banco SQLite.
 *
 * Estratégia:
 *  - Usa a API nativa de backup do SQLite (online, sem lock total).
 *  - Salva em ./database/backups/financas-YYYY-MM-DD-HH-mm-ss.db
 *  - Mantém apenas os últimos N dias (configurável).
 */

import { db }    from "./database.js"
import { config } from "./config.js"
import { logger } from "./logger.js"
import fs         from "fs-extra"
import path       from "path"

/**
 * Executa o backup do banco e limpa backups antigos.
 * @returns {Promise<string>} Caminho do arquivo de backup criado
 */
export async function executarBackup() {
  await fs.ensureDir(config.backupDir)

  const timestamp = new Date().toISOString()
    .replace("T", "-")
    .replace(/\..+$/, "")
    .replace(/:/g, "-")
  const destino = path.join(config.backupDir, `financas-${timestamp}.db`)

  // Backup online — não bloqueia escritas em andamento
  await db.backup(destino)
  logger.info({ destino }, "Backup criado")

  // Remove backups mais antigos que N dias
  await limparBackupsAntigos()

  return destino
}

/**
 * Remove backups mais antigos que config.backupMantenerDias.
 */
async function limparBackupsAntigos() {
  const arquivos = await fs.readdir(config.backupDir)
  const limite   = Date.now() - config.backupMantenerDias * 24 * 60 * 60 * 1000

  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".db")) continue
    const caminho = path.join(config.backupDir, arquivo)
    const stat    = await fs.stat(caminho)
    if (stat.mtimeMs < limite) {
      await fs.remove(caminho)
      logger.info({ arquivo }, "Backup antigo removido")
    }
  }
}
