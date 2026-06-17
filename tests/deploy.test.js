import { describe, expect, it } from "vitest"
import { createRequire } from "module"
import fs from "fs"

const require = createRequire(import.meta.url)

describe("preparacao de deploy 24/7", () => {
  it("package.json expoe scripts de operacao com PM2", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))

    expect(pkg.scripts.start).toBe("node index.js")
    expect(pkg.scripts.test).toBe("vitest run")
    expect(pkg.scripts.migrate).toBe("node migrate.js")
    expect(pkg.scripts.backup).toBe("node scripts/backup.js")
    expect(pkg.scripts["pm2:start"]).toBe("pm2 start ecosystem.config.cjs")
    expect(pkg.scripts["pm2:restart"]).toBe("pm2 restart bot-financas-whatsapp")
    expect(pkg.scripts["pm2:stop"]).toBe("pm2 stop bot-financas-whatsapp")
    expect(pkg.scripts["pm2:logs"]).toBe("pm2 logs bot-financas-whatsapp")
    expect(pkg.scripts["pm2:status"]).toBe("pm2 status")
  })

  it("ecosystem.config.cjs configura PM2 em fork com uma instancia", () => {
    const ecosystem = require("../ecosystem.config.cjs")
    const app = ecosystem.apps[0]

    expect(app.name).toBe("bot-financas-whatsapp")
    expect(app.script).toBe("index.js")
    expect(app.exec_mode).toBe("fork")
    expect(app.instances).toBe(1)
    expect(app.autorestart).toBe(true)
    expect(app.watch).toBe(false)
    expect(app.max_memory_restart).toBe("500M")
    expect(app.env.NODE_ENV).toBe("production")
  })

  it(".gitignore protege arquivos sensiveis e dados locais", () => {
    const gitignore = fs.readFileSync(".gitignore", "utf8")

    for (const item of [
      "node_modules/",
      "auth/",
      "database/*.db",
      "database/*.db-wal",
      "database/*.db-shm",
      "database/backups/",
      ".env",
      "logs/",
      "logs/*.log",
      "coverage/",
      "exports/",
    ]) {
      expect(gitignore).toContain(item)
    }
  })

  it(".env.example contem variaveis ficticias de deploy e beta", () => {
    const envExample = fs.readFileSync(".env.example", "utf8")

    expect(envExample).toContain("NODE_ENV=production")
    expect(envExample).toContain("PORT=3000")
    expect(envExample).toContain("BETA_MODE=false")
    expect(envExample).toContain("BETA_BLOCKED_REPLY=false")
    expect(envExample).toContain("BETA_DEBUG=false")
    expect(envExample).toContain("BETA_DEBUG_SHOW_RAW=false")
    expect(envExample).toContain("BETA_ALLOWED_NUMBERS=5511000000000,5511000000001")
    expect(envExample).toContain("BETA_ALLOWED_JIDS=1234567890@lid,0987654321@lid")
    expect(envExample).toContain("BETA_ALLOWED_GROUPS=120363000000000000@g.us")
    expect(envExample).toContain("BETA_GROUP_REQUIRE_AUTHORIZED_PARTICIPANT=true")
    expect(envExample).toContain("DASHBOARD_TOKEN=troque-este-token")
    expect(envExample).toContain("DATABASE_PATH=./database/financas.db")
  })

  it("health check publico nao expoe dados sensiveis", () => {
    const painel = fs.readFileSync("src/web/painel.js", "utf8")
    const healthRoute = painel.match(/app\.get\("\/health"[\s\S]*?\n\}\)/)?.[0] ?? ""

    expect(healthRoute).toContain("ok:")
    expect(healthRoute).toContain('service: SERVICE_NAME')
    expect(healthRoute).not.toContain("token")
    expect(healthRoute).not.toContain("usuarios")
    expect(healthRoute).not.toContain("process.env")
  })
})
