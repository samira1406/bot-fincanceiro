/**
 * @fileoverview Painel web de administração.
 *
 * Endpoints:
 *   GET  /health                 → health check (público)
 *   GET  /api/stats              → estatísticas gerais (requer token)
 *   GET  /api/lancamentos/:mes   → lançamentos do mês (requer token)
 *   GET  /api/usuarios           → lista de usuários (requer token)
 *   GET  /api/exportar/:mes      → CSV do mês (requer token)
 *   POST /api/backup             → força backup manual (requer token)
 */

import express from "express"
import { config }                from "../config.js"
import { logger }                from "../logger.js"
import {
  getTodosUsuarios, getLancamentosGrupoPorMes,
  getSomaPorTipo, mesAtual,
} from "../database.js"
import { executarBackup }        from "../backup.js"

const app = express()
app.use(express.json())

// ── Middleware de autenticação ─────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers["x-token"] || req.query.token
  if (token !== config.painel.token) {
    return res.status(401).json({ erro: "Token inválido" })
  }
  next()
}

// ── Health check (público, para monitoramento externo) ────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:  "ok",
    uptime:  Math.round(process.uptime()),
    version: "3.0.0",
    ts:      new Date().toISOString(),
  })
})

// ── Stats gerais ──────────────────────────────────────────────────────────
app.get("/api/stats", auth, (req, res) => {
  const mes      = mesAtual()
  const usuarios = getTodosUsuarios()

  const stats = usuarios.map(u => ({
    id:      u.id,
    nome:    u.nome,
    entradas: getSomaPorTipo(u.id, "entrada", mes),
    gastos:   getSomaPorTipo(u.id, "gasto",   mes),
    meta:     u.meta_mensal ?? null,
  }))

  const totalE = stats.reduce((s, u) => s + u.entradas, 0)
  const totalG = stats.reduce((s, u) => s + u.gastos, 0)

  res.json({
    mes,
    totalUsuarios:  usuarios.length,
    totalEntradas:  totalE,
    totalGastos:    totalG,
    saldoGeral:     totalE - totalG,
    usuarios:       stats,
  })
})

// ── Lançamentos do mês ────────────────────────────────────────────────────
app.get("/api/lancamentos/:mes", auth, (req, res) => {
  const { mes } = req.params
  const lancamentos = getLancamentosGrupoPorMes(mes)
  res.json({ mes, total: lancamentos.length, lancamentos })
})

// ── Lista de usuários ─────────────────────────────────────────────────────
app.get("/api/usuarios", auth, (req, res) => {
  const usuarios = getTodosUsuarios().map(u => ({
    id:        u.id,
    nome:      u.nome,
    meta:      u.meta_mensal ?? null,
    criado_em: new Date(u.criado_em).toISOString(),
  }))
  res.json({ total: usuarios.length, usuarios })
})

// ── Exportar CSV ──────────────────────────────────────────────────────────
app.get("/api/exportar/:usuarioId/:mes", auth, (req, res) => {
  const { usuarioId, mes } = req.params
  const { gerarCSV } = require("../database.js")
  const csv = gerarCSV(usuarioId, mes)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="financas-${usuarioId}-${mes}.csv"`)
  res.send(csv)
})

// ── Backup manual ─────────────────────────────────────────────────────────
app.post("/api/backup", auth, async (req, res) => {
  try {
    const arquivo = await executarBackup()
    res.json({ ok: true, arquivo })
  } catch (err) {
    logger.error({ err: err.message }, "Erro no backup manual")
    res.status(500).json({ erro: err.message })
  }
})

// ── Interface web simples (dashboard HTML) ────────────────────────────────
app.get("/", auth, (req, res) => {
  const mes      = mesAtual()
  const usuarios = getTodosUsuarios()
  const stats    = usuarios.map(u => ({
    nome:     u.nome,
    entradas: getSomaPorTipo(u.id, "entrada", mes),
    gastos:   getSomaPorTipo(u.id, "gasto",   mes),
    meta:     u.meta_mensal ?? "-",
  }))
  const totalE = stats.reduce((s, u) => s + u.entradas, 0)
  const totalG = stats.reduce((s, u) => s + u.gastos, 0)

  const linhas = stats.map(u => `
    <tr>
      <td>${u.nome}</td>
      <td>R$ ${u.entradas.toFixed(2)}</td>
      <td>R$ ${u.gastos.toFixed(2)}</td>
      <td>R$ ${(u.entradas - u.gastos).toFixed(2)}</td>
      <td>${u.meta === "-" ? "-" : "R$ " + u.meta.toFixed(2)}</td>
    </tr>`).join("")

  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Bot Finanças — Painel</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #f8f9fa; }
    h1 { color: #1a1a2e; }
    .cards { display: flex; gap: 16px; margin: 24px 0; }
    .card { background: white; padding: 20px; border-radius: 8px; flex: 1; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .card h3 { margin: 0 0 8px; font-size: .75rem; text-transform: uppercase; color: #666; }
    .card p { margin: 0; font-size: 1.6rem; font-weight: 700; }
    .positivo { color: #16a34a; }
    .negativo { color: #dc2626; }
    table { width: 100%; background: white; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    th { background: #1a1a2e; color: white; padding: 12px 16px; text-align: left; font-size: .8rem; text-transform: uppercase; }
    td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    tr:last-child td { border: none; }
    .badge { background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 99px; font-size: .75rem; }
  </style>
</head>
<body>
  <h1>💰 Bot Finanças — Painel</h1>
  <p>Mês atual: <strong>${mes}</strong> &nbsp; <span class="badge">${usuarios.length} membros</span></p>

  <div class="cards">
    <div class="card">
      <h3>Total Entradas</h3>
      <p class="positivo">R$ ${totalE.toFixed(2)}</p>
    </div>
    <div class="card">
      <h3>Total Gastos</h3>
      <p class="negativo">R$ ${totalG.toFixed(2)}</p>
    </div>
    <div class="card">
      <h3>Saldo Geral</h3>
      <p class="${(totalE - totalG) >= 0 ? "positivo" : "negativo"}">R$ ${(totalE - totalG).toFixed(2)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Membro</th><th>Entradas</th><th>Gastos</th><th>Saldo</th><th>Meta</th></tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  <p style="margin-top:24px;color:#666;font-size:.8rem">
    <a href="/api/stats?token=${config.painel.token}">JSON Stats</a> ·
    <a href="/api/usuarios?token=${config.painel.token}">Usuários</a> ·
    <a href="/api/lancamentos/${mes}?token=${config.painel.token}">Lançamentos</a>
  </p>
</body>
</html>`)
})

// ── Iniciar servidor ──────────────────────────────────────────────────────
export function iniciarPainel(statusBot) {
  // Injeta referência ao status do bot no health check
  app.locals.statusBot = statusBot

  app.listen(config.painel.porta, () => {
    logger.info({ porta: config.painel.porta }, "Painel web iniciado")
    logger.info(
      `   Dashboard: http://localhost:${config.painel.porta}/?token=${config.painel.token}`
    )
  })

  return app
}
