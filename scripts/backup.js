import "dotenv/config"
import { executarBackup } from "../src/backup.js"

const arquivo = await executarBackup()
console.log(`✅ Backup manual criado: ${arquivo}`)
