import fs from "fs"
import path from "path"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const painelMock = vi.hoisted(() => {
  const tempBase = `${process.env.TEMP || process.env.TMP || "."}\\bot-painel-test-${Date.now()}-${Math.random()}`

  const normalizarNumeroWhatsApp = (valor) =>
    String(valor ?? "").split("@")[0].split(":")[0].replace(/\D/g, "")

  const normalizarJidBeta = (valor) => {
    const texto = String(valor ?? "").trim().toLowerCase()
    if (!texto) return ""
    const [antesArroba, depoisArroba] = texto.split("@")
    if (!depoisArroba) return texto
    const usuario = antesArroba.split(":")[0].replace(/\s+/g, "")
    return `${usuario}@${depoisArroba}`
  }

  const mascararNumeroBeta = (valor) => {
    const numero = normalizarNumeroWhatsApp(valor)
    if (!numero) return ""
    if (numero.length <= 8) return "****"
    return `${numero.slice(0, 5)}****${numero.slice(-4)}`
  }

  const mascararIdentificadorBeta = (valor) => {
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

  return {
    backupCalls: [],
    tempBase,
    config: {
      painel: { porta: 0, token: "token-teste" },
      beta: {
        ativo: true,
        responderBloqueado: false,
        debug: false,
        debugMostrarRaw: false,
        numerosAutorizados: ["5511999999999"],
        jidsAutorizados: ["contato-ficticio@lid"],
        gruposAutorizados: ["120363000000000000@g.us"],
        exigirParticipanteAutorizado: true,
      },
      dbPath: ":memory:",
      backupDir: `${tempBase}\\backups`,
      backupMantenerDias: 7,
      logLevel: "silent",
    },
    mascararIdentificadorBeta,
    mascararNumeroBeta,
  }
})

vi.mock("../src/config.js", () => ({
  config: painelMock.config,
  mascararIdentificadorBeta: painelMock.mascararIdentificadorBeta,
  mascararNumeroBeta: painelMock.mascararNumeroBeta,
}))

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logMensagem: vi.fn(),
}))

vi.mock("../src/backup.js", () => ({
  executarBackup: vi.fn(async () => {
    painelMock.backupCalls.push(Date.now())
    return `${painelMock.config.backupDir}\\financas-fake.db`
  }),
}))

const { app } = await import("../src/web/painel.js")
const {
  atualizarUsuario,
  criarUsuario,
  db,
  inserirLancamento,
} = await import("../src/database.js")
const {
  registrarEvento,
  resetRuntimeStateParaTestes,
} = await import("../src/runtimeState.js")

let server
let baseUrl

async function iniciarServidor() {
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const address = server.address()
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
}

async function fecharServidor() {
  if (!server) return
  await new Promise(resolve => server.close(resolve))
  server = null
}

function headersToken() {
  return { Authorization: "Bearer token-teste" }
}

async function getJson(rota, headers = headersToken()) {
  const res = await fetch(`${baseUrl}${rota}`, { headers })
  return { res, body: await res.json() }
}

beforeEach(async () => {
  db.exec(`
    DELETE FROM metas_categoria;
    DELETE FROM lancamentos;
    DELETE FROM usuarios;
  `)
  resetRuntimeStateParaTestes()
  painelMock.backupCalls = []
  painelMock.config.backupDir = `${painelMock.tempBase}\\backups`
  fs.rmSync(painelMock.tempBase, { recursive: true, force: true })
  fs.mkdirSync(painelMock.config.backupDir, { recursive: true })
  await iniciarServidor()
})

afterEach(async () => {
  await fecharServidor()
})

afterAll(() => {
  fs.rmSync(painelMock.tempBase, { recursive: true, force: true })
})

describe("painel interno/admin", () => {
  it("GET /health retorna ok sem token", async () => {
    const { res, body } = await getJson("/health", {})

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, service: "bot-financas-whatsapp" })
  })

  it("endpoints /api/admin/* bloqueiam sem token", async () => {
    const { res, body } = await getJson("/api/admin/status", {})

    expect(res.status).toBe(401)
    expect(body.erro).toBe("nao_autorizado")
  })

  it("endpoints /api/admin/* aceitam token valido por Authorization Bearer", async () => {
    const { res, body } = await getJson("/api/admin/status")

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it("status retorna uptime, memoria e service", async () => {
    const { body } = await getJson("/api/admin/status")

    expect(body.service).toBe("bot-financas-whatsapp")
    expect(body.uptimeSeconds).toEqual(expect.any(Number))
    expect(body.memoryMb).toEqual(expect.any(Number))
    expect(body.database.ok).toBe(true)
  })

  it("metricas do banco retornam contagens mesmo vazio", async () => {
    const { body } = await getJson("/api/admin/metrics")

    expect(body.ok).toBe(true)
    expect(body.totalUsuarios).toBe(0)
    expect(body.totalLancamentos).toBe(0)
    expect(body.totalMetas).toBe(0)
    expect(body.resumoMesAtual.receitas).toBe(0)
    expect(body.resumoMesAtual.despesas).toBe(0)
  })

  it("metricas agregam receitas e despesas sem detalhar usuarios", async () => {
    criarUsuario("5511999999999")
    atualizarUsuario("5511999999999", { nome: "Teste", aguardando_nome: 0 })
    inserirLancamento({ usuarioId: "5511999999999", tipo: "entrada", nome: "salario", categoria: "salario", valor: 2500, mes: "6-2026" })
    inserirLancamento({ usuarioId: "5511999999999", tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 35, mes: "6-2026" })

    const { body } = await getJson("/api/admin/metrics")

    expect(body.totalUsuarios).toBe(1)
    expect(body.totalLancamentos).toBe(2)
    expect(body.totalReceitas).toBe(1)
    expect(body.totalDespesas).toBe(1)
    expect(JSON.stringify(body)).not.toContain("5511999999999")
  })

  it("beta retorna quantidades e valores mascarados", async () => {
    const { body } = await getJson("/api/admin/beta")
    const texto = JSON.stringify(body)

    expect(body.ativo).toBe(true)
    expect(body.quantidades).toEqual({ numeros: 1, jids: 1, grupos: 1 })
    expect(texto).toContain("55119****9999")
    expect(texto).not.toContain("5511999999999")
    expect(texto).not.toContain("120363000000000000@g.us")
  })

  it("backup manual chama a funcao de backup e retorna sucesso", async () => {
    const res = await fetch(`${baseUrl}/api/admin/backup`, {
      method: "POST",
      headers: headersToken(),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.arquivo).toBe("financas-fake.db")
    expect(painelMock.backupCalls).toHaveLength(1)
  })

  it("lista de backups nao quebra quando a pasta nao existe", async () => {
    painelMock.config.backupDir = `${painelMock.tempBase}\\nao-existe`

    const { res, body } = await getJson("/api/admin/backups")

    expect(res.status).toBe(200)
    expect(body.backups).toEqual([])
  })

  it("lista backups existentes com nome, data e tamanho", async () => {
    fs.writeFileSync(path.join(painelMock.config.backupDir, "financas-2026-06-17-10-00-00.db"), "backup")

    const { body } = await getJson("/api/admin/backups")

    expect(body.backups).toHaveLength(1)
    expect(body.backups[0].nome).toBe("financas-2026-06-17-10-00-00.db")
    expect(body.backups[0].tamanhoBytes).toBeGreaterThan(0)
  })

  it("eventos recentes retornam lista e mascaram identificadores", async () => {
    registrarEvento("mensagem_processada", {
      usuarioId: "5511999999999@s.whatsapp.net",
      grupo: "120363000000000000@g.us",
    })

    const { body } = await getJson("/api/admin/events")
    const texto = JSON.stringify(body)

    expect(body.eventos).toHaveLength(1)
    expect(texto).toContain("55119****9999@s.whatsapp.net")
    expect(texto).not.toContain("5511999999999@s.whatsapp.net")
    expect(texto).not.toContain("120363000000000000@g.us")
  })

  it("painel HTML carrega sem expor token, DASHBOARD_TOKEN nem .env", async () => {
    const res = await fetch(`${baseUrl}/admin?token=token-teste`)
    const html = await res.text()

    expect(res.status).toBe(200)
    expect(html).toContain("Bot-Finanças - Painel Interno")
    expect(html).not.toContain("token-teste")
    expect(html).not.toContain("DASHBOARD_TOKEN")
    expect(html).not.toContain(".env")
  })
})
