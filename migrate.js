/**
 * migrate.js — Migra dados do formato JSON (v1/v2) para SQLite (v3).
 * Execute UMA VEZ: node migrate.js
 */
import "dotenv/config"
import fs       from "fs-extra"
import Database from "better-sqlite3"
import path     from "path"

const ARQUIVO_JSON = "./database/dados.json"
const DB_PATH      = "./database/financas.db"

if (!await fs.pathExists(ARQUIVO_JSON)) {
  console.log("ℹ️  Nenhum dados.json encontrado. Nada a migrar.")
  process.exit(0)
}

const dados    = await fs.readJson(ARQUIVO_JSON)
const usuarios = dados.usuarios ?? {}

if (!Object.keys(usuarios).length) {
  console.log("ℹ️  dados.json está vazio. Nada a migrar.")
  process.exit(0)
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, aplicada_em INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
  CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY, nome TEXT, aguardando_nome INTEGER NOT NULL DEFAULT 1, aguardando_caixinha INTEGER NOT NULL DEFAULT 0, valor_sugerido_caixinha REAL NOT NULL DEFAULT 0, estado_expira_em INTEGER, ultimo_msg_id TEXT, meta_mensal REAL, criado_em INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
  CREATE TABLE IF NOT EXISTS lancamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id TEXT NOT NULL REFERENCES usuarios(id), tipo TEXT NOT NULL CHECK(tipo IN ('entrada','gasto')), nome TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT 'geral', valor REAL NOT NULL, mes TEXT NOT NULL, criado_em INTEGER NOT NULL DEFAULT (unixepoch() * 1000));
`)

const insU = db.prepare("INSERT OR IGNORE INTO usuarios (id, nome, aguardando_nome) VALUES (?, ?, 0)")
const insL = db.prepare("INSERT INTO lancamentos (usuario_id, tipo, nome, categoria, valor, mes, criado_em) VALUES (?, ?, ?, 'geral', ?, ?, ?)")

const migrar = db.transaction(() => {
  let nu = 0, nl = 0
  for (const [id, u] of Object.entries(usuarios)) {
    insU.run(id, u.nome ?? id); nu++
    for (const e of (u.entradas ?? [])) { insL.run(id, "entrada", e.nome, e.valor, e.mes, e.timestamp ?? Date.now()); nl++ }
    for (const g of (u.gastos   ?? [])) { insL.run(id, "gasto",   g.nome, g.valor, g.mes, g.timestamp ?? Date.now()); nl++ }
  }
  return { nu, nl }
})

const { nu, nl } = migrar()
console.log(`✅ Migração concluída: ${nu} usuário(s), ${nl} lançamento(s) importados.`)
console.log(`📦 Banco criado em: ${DB_PATH}`)
console.log(`\n⚠️  Guarde uma cópia do dados.json como backup antes de excluí-lo.`)
