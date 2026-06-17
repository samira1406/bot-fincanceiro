/**
 * @fileoverview Painel interno/admin local.
 *
 * Rotas principais:
 *   GET  /health              -> health check publico e minimo
 *   GET  /admin               -> painel HTML protegido por token
 *   GET  /painel              -> alias do painel
 *   GET  /dashboard           -> alias do painel
 *   GET  /api/admin/*         -> APIs internas protegidas por token
 */

import crypto from "crypto"
import express from "express"
import fs from "fs"
import fsp from "fs/promises"
import path from "path"

import { executarBackup } from "../backup.js"
import { config, mascararIdentificadorBeta } from "../config.js"
import {
  db,
  gerarCSV,
  getLancamentosGrupoPorMes,
  getSomaPorTipo,
  getTodosUsuarios,
  mesAtual,
} from "../database.js"
import { logger } from "../logger.js"
import { obterNomeExibicaoUsuario } from "../formatters.js"
import { obterRuntimeState, registrarEvento, sanitizarValorPainel } from "../runtimeState.js"

const app = express()
app.use(express.json())

const SERVICE_NAME = "bot-financas-whatsapp"
const APP_VERSION = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map(parte => parte.trim())
      .filter(Boolean)
      .map(parte => {
        const indice = parte.indexOf("=")
        if (indice === -1) return [parte, ""]
        return [parte.slice(0, indice), decodeURIComponent(parte.slice(indice + 1))]
      })
  )
}

function obterToken(req) {
  const authorization = String(req.headers.authorization ?? "")
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : ""
  const cookies = parseCookies(req.headers.cookie)

  return String(req.headers["x-token"] || req.query.token || bearer || cookies.dashboard_token || "")
}

function tokenSeguroIgual(recebido, esperado) {
  if (!recebido || !esperado) return false

  const a = Buffer.from(String(recebido))
  const b = Buffer.from(String(esperado))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function auth(req, res, next) {
  const token = obterToken(req)
  if (!tokenSeguroIgual(token, config.painel.token)) {
    return res.status(401).json({ erro: "nao_autorizado" })
  }

  if (req.query.token) {
    res.setHeader(
      "Set-Cookie",
      `dashboard_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`
    )
  }

  return next()
}

function sanitizarCaminho(caminho) {
  const valor = String(caminho ?? "")
  if (!valor) return ""
  if (valor === ":memory:") return ":memory:"

  const normalizado = valor.replace(/\\/g, "/")
  if (!path.isAbsolute(valor)) return normalizado

  const partes = normalizado.split("/").filter(Boolean)
  return `.../${partes.slice(-3).join("/")}`
}

function bytesParaMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100
}

function tamanhoArquivoDb() {
  try {
    if (!config.dbPath || config.dbPath === ":memory:" || !fs.existsSync(config.dbPath)) return 0
    return bytesParaMb(fs.statSync(config.dbPath).size)
  } catch {
    return 0
  }
}

function valorUnico(sql, fallback = 0) {
  const row = db.prepare(sql).get()
  return row?.total ?? fallback
}

export function obterMetricasBanco() {
  const mes = mesAtual()

  try {
    const ultimoMs = valorUnico("SELECT MAX(criado_em) as total FROM lancamentos", null)
    const totalReceitasMes = db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM lancamentos
      WHERE tipo = 'entrada' AND mes = ?
    `).get(mes)?.total ?? 0
    const totalDespesasMes = db.prepare(`
      SELECT COALESCE(SUM(valor), 0) as total
      FROM lancamentos
      WHERE tipo = 'gasto' AND mes = ?
    `).get(mes)?.total ?? 0

    return {
      ok: true,
      path: sanitizarCaminho(config.dbPath),
      sizeMb: tamanhoArquivoDb(),
      totalUsuarios: valorUnico("SELECT COUNT(*) as total FROM usuarios"),
      totalLancamentos: valorUnico("SELECT COUNT(*) as total FROM lancamentos"),
      totalReceitas: valorUnico("SELECT COUNT(*) as total FROM lancamentos WHERE tipo = 'entrada'"),
      totalDespesas: valorUnico("SELECT COUNT(*) as total FROM lancamentos WHERE tipo = 'gasto'"),
      totalMetas: valorUnico("SELECT COUNT(*) as total FROM metas_categoria"),
      ultimoLancamentoAt: ultimoMs ? new Date(ultimoMs).toISOString() : null,
      resumoMesAtual: {
        mes,
        receitas: totalReceitasMes,
        despesas: totalDespesasMes,
      },
    }
  } catch (err) {
    return {
      ok: false,
      erro: sanitizarValorPainel(err.message),
      path: sanitizarCaminho(config.dbPath),
      sizeMb: tamanhoArquivoDb(),
      totalUsuarios: 0,
      totalLancamentos: 0,
      totalReceitas: 0,
      totalDespesas: 0,
      totalMetas: 0,
      ultimoLancamentoAt: null,
      resumoMesAtual: { mes, receitas: 0, despesas: 0 },
    }
  }
}

function listarBetaSeguro() {
  const beta = config.beta ?? {}
  const numeros = beta.numerosAutorizados ?? []
  const jids = beta.jidsAutorizados ?? []
  const grupos = beta.gruposAutorizados ?? []

  return {
    ativo: Boolean(beta.ativo),
    responderBloqueado: Boolean(beta.responderBloqueado),
    exigirParticipanteAutorizado: Boolean(beta.exigirParticipanteAutorizado),
    quantidades: {
      numeros: numeros.length,
      jids: jids.length,
      grupos: grupos.length,
    },
    autorizadosMascarados: {
      numeros: numeros.map(mascararIdentificadorBeta),
      jids: jids.map(mascararIdentificadorBeta),
      grupos: grupos.map(mascararIdentificadorBeta),
    },
  }
}

export async function listarBackupsRecentes(limite = 8) {
  try {
    if (!fs.existsSync(config.backupDir)) return []

    const arquivos = await fsp.readdir(config.backupDir)
    const backups = []

    for (const arquivo of arquivos) {
      if (!arquivo.endsWith(".db")) continue
      const caminho = path.join(config.backupDir, arquivo)
      const stat = await fsp.stat(caminho)
      backups.push({
        nome: arquivo,
        criadoEm: stat.mtime.toISOString(),
        tamanhoBytes: stat.size,
        tamanhoMb: bytesParaMb(stat.size),
      })
    }

    return backups
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())
      .slice(0, limite)
  } catch (err) {
    registrarEvento("erro_backup_listagem", { erro: err.message })
    return []
  }
}

async function ultimoBackup() {
  const [backup] = await listarBackupsRecentes(1)
  return backup ?? null
}

async function montarStatus() {
  const runtime = obterRuntimeState()
  const database = obterMetricasBanco()
  const memoryMb = bytesParaMb(process.memoryUsage().rss)

  return {
    ok: true,
    service: SERVICE_NAME,
    version: APP_VERSION,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb,
    env: process.env.NODE_ENV ?? "development",
    startedAt: runtime.iniciadoEm,
    bot: runtime.bot,
    database: {
      ok: database.ok,
      path: database.path,
      sizeMb: database.sizeMb,
    },
    beta: {
      ativo: Boolean(config.beta?.ativo),
      numerosAutorizados: config.beta?.numerosAutorizados?.length ?? 0,
      jidsAutorizados: config.beta?.jidsAutorizados?.length ?? 0,
      gruposAutorizados: config.beta?.gruposAutorizados?.length ?? 0,
    },
    ultimoBackup: await ultimoBackup(),
  }
}

function renderAdminHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot-Finanças - Painel Interno</title>
  <style>
    :root {
      --bg: #eef2f7;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --ink: #172033;
      --muted: #667085;
      --line: #d8e0ec;
      --brand: #245ca8;
      --brand-strong: #173d72;
      --teal: #0f766e;
      --teal-soft: #e6f5f2;
      --amber: #a8670f;
      --amber-soft: #fff4d8;
      --red: #b42318;
      --red-soft: #fde8e6;
      --blue-soft: #e9f1ff;
      --shadow: 0 18px 45px rgba(25, 39, 63, .08);
      --shadow-soft: 0 8px 22px rgba(25, 39, 63, .06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: linear-gradient(180deg, #f8fafc 0, var(--bg) 360px), var(--bg);
      line-height: 1.5;
      overflow-x: hidden;
    }
    button, input { font: inherit; }
    button {
      border: 0;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
      transition: transform .16s ease, box-shadow .16s ease, background .16s ease, opacity .16s ease;
    }
    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: .62; cursor: wait; transform: none; }
    .shell {
      width: min(1240px, calc(100% - 32px));
      margin: 0 auto 48px;
    }
    .topbar {
      padding: 24px 0 14px;
      color: var(--muted);
      font-size: .88rem;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    .topbar strong { color: var(--ink); }
    .hero {
      background: var(--surface);
      border: 1px solid rgba(216, 224, 236, .95);
      border-radius: 8px;
      box-shadow: var(--shadow);
      padding: 24px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 22px;
      align-items: center;
      overflow: hidden;
    }
    .eyebrow {
      color: var(--brand);
      font-size: .78rem;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin: 0 0 6px;
    }
    h1 {
      margin: 0;
      font-size: clamp(1.55rem, 2.2vw, 2.35rem);
      letter-spacing: 0;
      line-height: 1.08;
    }
    .hero-subtitle {
      margin: 10px 0 0;
      color: var(--muted);
      max-width: 760px;
      overflow-wrap: anywhere;
    }
    .hero-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      min-width: 230px;
    }
    .primary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      background: var(--brand);
      color: #fff;
      min-height: 44px;
      padding: 0 16px;
      box-shadow: 0 12px 24px rgba(36, 92, 168, .22);
      white-space: normal;
    }
    .primary-button:hover { background: var(--brand-strong); }
    .primary-button svg { width: 18px; height: 18px; }
    .action-message {
      min-height: 20px;
      color: var(--muted);
      font-size: .86rem;
      text-align: right;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-top: 18px;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow-soft);
      padding: 16px;
      min-height: 138px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
      transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
    }
    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow);
      border-color: #bfd0e6;
    }
    .metric-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .metric-label {
      color: var(--muted);
      font-size: .78rem;
      text-transform: uppercase;
      font-weight: 900;
      letter-spacing: .04em;
    }
    .metric-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--blue-soft);
      color: var(--brand);
      flex: 0 0 auto;
    }
    .metric-icon svg { width: 19px; height: 19px; }
    .metric-value {
      display: block;
      font-size: clamp(1.35rem, 2vw, 1.9rem);
      line-height: 1.05;
      font-weight: 900;
      word-break: break-word;
    }
    .metric-hint {
      color: var(--muted);
      font-size: .88rem;
      min-height: 21px;
      overflow-wrap: anywhere;
    }
    .tone-ok .metric-icon { background: var(--teal-soft); color: var(--teal); }
    .tone-warn .metric-icon { background: var(--amber-soft); color: var(--amber); }
    .tone-err .metric-icon { background: var(--red-soft); color: var(--red); }
    .tone-ok .metric-value { color: var(--teal); }
    .tone-warn .metric-value { color: var(--amber); }
    .tone-err .metric-value { color: var(--red); }
    .section-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(340px, .92fr);
      gap: 16px;
      margin-top: 16px;
    }
    .section-panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow-soft);
      padding: 18px;
      min-width: 0;
    }
    .section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .section-title {
      margin: 0;
      font-size: 1rem;
      line-height: 1.2;
    }
    .section-caption {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: .9rem;
    }
    .kv-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 0;
    }
    .kv-item {
      background: var(--surface-soft);
      border: 1px solid #e8eef6;
      border-radius: 8px;
      padding: 12px;
      min-width: 0;
    }
    .kv-item dt {
      color: var(--muted);
      font-size: .74rem;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .kv-item dd {
      margin: 0;
      font-weight: 750;
      word-break: break-word;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: .82rem;
      font-weight: 900;
      border: 1px solid transparent;
      white-space: nowrap;
      max-width: 100%;
    }
    .badge .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 4px rgba(0, 0, 0, .04);
    }
    .badge.ok { color: var(--teal); background: var(--teal-soft); border-color: #bfe6dd; }
    .badge.warn { color: var(--amber); background: var(--amber-soft); border-color: #f6d88c; }
    .badge.err { color: var(--red); background: var(--red-soft); border-color: #f4bbb6; }
    .badge.neutral { color: var(--brand); background: var(--blue-soft); border-color: #cbdcf7; }
    .backup-list {
      display: grid;
      gap: 10px;
    }
    .backup-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border: 1px solid #e8eef6;
      border-radius: 8px;
      background: var(--surface-soft);
    }
    .backup-name {
      display: block;
      font-weight: 850;
      word-break: break-word;
    }
    .backup-meta {
      color: var(--muted);
      font-size: .86rem;
      margin-top: 3px;
    }
    .backup-size {
      color: var(--brand);
      background: var(--blue-soft);
      border-radius: 999px;
      padding: 6px 9px;
      font-weight: 900;
      font-size: .82rem;
      white-space: nowrap;
    }
    .empty-state {
      border: 1px dashed #c7d4e5;
      border-radius: 8px;
      background: #fbfdff;
      padding: 18px;
      color: var(--muted);
      text-align: center;
    }
    .event-list {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: 420px;
      overflow: auto;
      scrollbar-width: thin;
    }
    .event-item {
      border: 1px solid #e8eef6;
      border-radius: 8px;
      background: var(--surface-soft);
      padding: 12px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
    }
    .event-marker {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--brand);
      margin-top: 7px;
      box-shadow: 0 0 0 4px var(--blue-soft);
    }
    .event-type {
      font-weight: 900;
      margin-bottom: 2px;
    }
    .event-time {
      color: var(--muted);
      font-size: .84rem;
      margin-bottom: 7px;
    }
    .event-details {
      display: inline-block;
      max-width: 100%;
      color: #344054;
      background: #eef4fb;
      border: 1px solid #dce8f7;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: .84rem;
      word-break: break-word;
    }
    code {
      color: var(--brand);
      background: #eef4fb;
      padding: 2px 5px;
      border-radius: 4px;
      word-break: break-word;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (max-width: 1080px) {
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .section-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 700px) {
      .shell {
        width: calc(100vw - 56px);
        max-width: calc(100vw - 56px);
        margin-left: 24px;
        margin-right: 32px;
        padding-left: 0;
        padding-right: 0;
        overflow: hidden;
      }
      .topbar, .hero, .section-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .hero, .section-panel, .metric-card {
        width: 100%;
        max-width: 100%;
      }
      .hero { display: flex; padding: 20px; }
      .hero-actions {
        width: 100%;
        align-items: stretch;
        min-width: 0;
      }
      .action-message { text-align: left; }
      .primary-button { width: 100%; }
      .badge {
        white-space: normal;
        overflow-wrap: anywhere;
      }
      .summary-grid, .kv-grid { grid-template-columns: 1fr; }
      .metric-card { min-height: 124px; }
      .backup-item { grid-template-columns: 1fr; }
      .backup-size { width: fit-content; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        transition-duration: .01ms !important;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="topbar" aria-label="Resumo do painel">
      <span><strong>Operação interna</strong> - monitoramento local do bot</span>
      <span id="last-refresh" aria-live="polite">Atualizando...</span>
    </div>

    <section class="hero" aria-labelledby="page-title">
      <div>
        <p class="eyebrow">Bot-Finanças</p>
        <h1 id="page-title">Bot-Finanças - Painel Interno</h1>
        <p class="hero-subtitle">Acompanhe saúde do serviço, WhatsApp, beta fechado, banco, backups e eventos recentes em um só lugar.</p>
      </div>
      <div class="hero-actions">
        <span id="ambiente-pill" class="badge neutral"><span class="dot"></span>Carregando ambiente</span>
        <button id="backup-button" class="primary-button" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 3v10"></path><path d="m8 9 4 4 4-4"></path><path d="M5 17a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3"></path>
          </svg>
          Gerar backup agora
        </button>
        <span id="action-message" class="action-message" aria-live="polite"></span>
      </div>
    </section>

    <section aria-labelledby="summary-title">
      <h2 id="summary-title" class="sr-only">Resumo operacional</h2>
      <div class="summary-grid" id="cards"></div>
    </section>

    <div class="section-grid">
      <section class="section-panel">
        <div class="section-head">
          <div>
            <h2 class="section-title">WhatsApp e serviço</h2>
            <p class="section-caption">Conexão, tempo online e fluxo de mensagens desde o start.</p>
          </div>
          <span id="bot-badge" class="badge neutral"><span class="dot"></span>Carregando</span>
        </div>
        <dl class="kv-grid" id="bot-data"></dl>
      </section>

      <section class="section-panel">
        <div class="section-head">
          <div>
            <h2 class="section-title">Beta fechado</h2>
            <p class="section-caption">Somente leitura, com autorizados sempre mascarados.</p>
          </div>
          <span id="beta-badge" class="badge neutral"><span class="dot"></span>Carregando</span>
        </div>
        <dl class="kv-grid" id="beta-data"></dl>
      </section>
    </div>

    <div class="section-grid">
      <section class="section-panel">
        <div class="section-head">
          <div>
            <h2 class="section-title">Banco de dados</h2>
            <p class="section-caption">Acessibilidade, tamanho, contagens e totais agregados.</p>
          </div>
          <span id="database-badge" class="badge neutral"><span class="dot"></span>Carregando</span>
        </div>
        <dl class="kv-grid" id="database-data"></dl>
      </section>

      <section class="section-panel">
        <div class="section-head">
          <div>
            <h2 class="section-title">Backups recentes</h2>
            <p class="section-caption">Últimos arquivos encontrados na pasta configurada.</p>
          </div>
        </div>
        <div id="backups-data" class="backup-list"></div>
      </section>
    </div>

    <section class="section-panel">
      <div class="section-head">
        <div>
          <h2 class="section-title">Eventos recentes</h2>
          <p class="section-caption">Últimos eventos em memória, sem conteúdo sensível.</p>
        </div>
      </div>
      <ul id="events-data" class="event-list"></ul>
    </section>
  </main>

  <script>
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token")
    if (tokenFromUrl) {
      sessionStorage.setItem("dashboardToken", tokenFromUrl)
      window.history.replaceState({}, "", window.location.pathname)
    }
    const token = sessionStorage.getItem("dashboardToken") || tokenFromUrl || ""

    const fmtDate = (value) => value ? new Date(value).toLocaleString("pt-BR") : "-"
    const fmtMb = (value) => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " MB"
    const fmtMoney = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const escapeHtml = (value) => String(value ?? "-").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char])

    async function api(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      })
      if (!response.ok) throw new Error("Falha ao carregar painel")
      return response.json()
    }

    const icons = {
      service: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"></path><path d="M5 8h14"></path><path d="M5 16h14"></path></svg>',
      whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12a7 7 0 1 1 3 5.7L5 19l1.3-3A7 7 0 0 1 5 12Z"></path><path d="M9 10h.01"></path><path d="M12 10h.01"></path><path d="M15 10h.01"></path></svg>',
      database: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="7" ry="3"></ellipse><path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path><path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3"></path></svg>',
      beta: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"></path><path d="m9 12 2 2 4-5"></path></svg>',
      users: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
      entries: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>',
      income: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path></svg>',
      expense: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"></path><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path><path d="M6 7l1 14h10l1-14"></path></svg>',
    }

    function statusBadge(text, tone) {
      return '<span class="badge ' + tone + '"><span class="dot"></span>' + escapeHtml(text) + '</span>'
    }

    function setBadge(id, text, tone) {
      const el = document.getElementById(id)
      el.className = "badge " + tone
      el.innerHTML = '<span class="dot"></span>' + escapeHtml(text)
    }

    function fmtDuration(seconds) {
      const total = Number(seconds || 0)
      const days = Math.floor(total / 86400)
      const hours = Math.floor((total % 86400) / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      if (days > 0) return days + "d " + hours + "h"
      if (hours > 0) return hours + "h " + minutes + "min"
      if (minutes > 0) return minutes + "min"
      return total + "s"
    }

    function renderDl(target, items) {
      document.getElementById(target).innerHTML = items.map(([label, value]) => (
        '<div class="kv-item"><dt>' + escapeHtml(label) + '</dt><dd>' + value + '</dd></div>'
      )).join("")
    }

    function renderCards(status, metrics, beta) {
      const botOk = status.bot.status === "conectado"
      const dbOk = Boolean(metrics.ok)
      const cards = [
        { label: "Serviço", value: status.ok ? "Online" : "Offline", tone: status.ok ? "ok" : "err", icon: icons.service, hint: "Health check ativo" },
        { label: "WhatsApp", value: status.bot.status || "desconhecido", tone: botOk ? "ok" : "warn", icon: icons.whatsapp, hint: botOk ? "Conexão aberta" : "Acompanhar conexão" },
        { label: "Banco", value: dbOk ? "Acessível" : "Atenção", tone: dbOk ? "ok" : "err", icon: icons.database, hint: metrics.path || "Sem caminho" },
        { label: "Beta", value: beta.ativo ? "Ativo" : "Inativo", tone: beta.ativo ? "warn" : "ok", icon: icons.beta, hint: beta.ativo ? "Acesso controlado" : "Acesso aberto" },
        { label: "Usuários", value: metrics.totalUsuarios, tone: "neutral", icon: icons.users, hint: "Cadastrados no banco" },
        { label: "Lançamentos", value: metrics.totalLancamentos, tone: "neutral", icon: icons.entries, hint: "Registros totais" },
        { label: "Receitas", value: metrics.totalReceitas, tone: "ok", icon: icons.income, hint: fmtMoney(metrics.resumoMesAtual.receitas) + " no mês" },
        { label: "Despesas", value: metrics.totalDespesas, tone: "warn", icon: icons.expense, hint: fmtMoney(metrics.resumoMesAtual.despesas) + " no mês" },
      ]
      document.getElementById("cards").innerHTML = cards.map((card) => (
        '<article class="metric-card tone-' + escapeHtml(card.tone) + '">' +
          '<div class="metric-top"><span class="metric-label">' + escapeHtml(card.label) + '</span><span class="metric-icon">' + card.icon + '</span></div>' +
          '<div><strong class="metric-value">' + escapeHtml(card.value) + '</strong><div class="metric-hint">' + escapeHtml(card.hint) + '</div></div>' +
        '</article>'
      )).join("")
    }

    function renderBackups(backups) {
      document.getElementById("backups-data").innerHTML = backups.length
        ? backups.map((backup) => (
          '<article class="backup-item">' +
            '<div><span class="backup-name">' + escapeHtml(backup.nome) + '</span>' +
            '<div class="backup-meta">' + escapeHtml(fmtDate(backup.criadoEm)) + '</div></div>' +
            '<span class="backup-size">' + escapeHtml(fmtMb(backup.tamanhoMb ?? (backup.tamanhoBytes / 1024 / 1024))) + '</span>' +
          '</article>'
        )).join("")
        : '<div class="empty-state"><strong>Nenhum backup encontrado.</strong><br>Use o botão acima para gerar o primeiro backup manual.</div>'
    }

    function renderEvents(events) {
      document.getElementById("events-data").innerHTML = events.length
        ? events.slice(0, 50).map((event) => (
          '<li class="event-item">' +
            '<span class="event-marker" aria-hidden="true"></span>' +
            '<div><div class="event-type">' + escapeHtml(event.tipo) + '</div>' +
            '<div class="event-time">' + escapeHtml(fmtDate(event.ts)) + '</div>' +
            '<code class="event-details">' + escapeHtml(JSON.stringify(event.detalhes || {})) + '</code></div>' +
          '</li>'
        )).join("")
        : '<li class="empty-state">Nenhum evento recente.</li>'
    }

    async function refresh() {
      const [status, metrics, beta, backups, events] = await Promise.all([
        api("/api/admin/status"),
        api("/api/admin/metrics"),
        api("/api/admin/beta"),
        api("/api/admin/backups"),
        api("/api/admin/events"),
      ])

      const ambiente = status["env"] === "production" ? "Produção" : (beta.ativo ? "Beta" : "Local")
      setBadge("ambiente-pill", ambiente + " - " + status.service, "neutral")
      setBadge("bot-badge", status.bot.status || "desconhecido", status.bot.status === "conectado" ? "ok" : "warn")
      setBadge("beta-badge", beta.ativo ? "Beta ativo" : "Beta inativo", beta.ativo ? "warn" : "ok")
      setBadge("database-badge", metrics.ok ? "Banco ok" : "Atenção", metrics.ok ? "ok" : "err")
      document.getElementById("last-refresh").textContent = "Atualizado em " + new Date().toLocaleTimeString("pt-BR")

      renderCards(status, metrics, beta)
      renderDl("bot-data", [
        ["Status", statusBadge(status.bot.status || "desconhecido", status.bot.status === "conectado" ? "ok" : "warn")],
        ["Uptime", escapeHtml(fmtDuration(status.uptimeSeconds))],
        ["Memória", escapeHtml(fmtMb(status.memoryMb))],
        ["Última conexão", escapeHtml(fmtDate(status.bot.lastConnectedAt))],
        ["Última mensagem", escapeHtml(fmtDate(status.bot.lastMessageAt))],
        ["Mensagens processadas", escapeHtml(status.bot.mensagensProcessadas)],
        ["Ignoradas por beta", escapeHtml(status.bot.ignoradasBeta)],
        ["Ignoradas por grupo", escapeHtml(status.bot.ignoradasGrupo)],
        ["Ignoradas fromMe", escapeHtml(status.bot.ignoradasFromMe)],
        ["Último erro", escapeHtml(status.bot.lastError || "-")],
      ])
      renderDl("beta-data", [
        ["BETA_MODE", escapeHtml(beta.ativo ? "ativo" : "inativo")],
        ["BETA_BLOCKED_REPLY", escapeHtml(String(beta.responderBloqueado))],
        ["Exige participante em grupo", escapeHtml(String(beta.exigirParticipanteAutorizado))],
        ["Números autorizados", escapeHtml(beta.quantidades.numeros)],
        ["JIDs autorizados", escapeHtml(beta.quantidades.jids)],
        ["Grupos autorizados", escapeHtml(beta.quantidades.grupos)],
        ["Números mascarados", "<code>" + escapeHtml(beta.autorizadosMascarados.numeros.join(", ") || "-") + "</code>"],
        ["JIDs mascarados", "<code>" + escapeHtml(beta.autorizadosMascarados.jids.join(", ") || "-") + "</code>"],
        ["Grupos mascarados", "<code>" + escapeHtml(beta.autorizadosMascarados.grupos.join(", ") || "-") + "</code>"],
      ])
      renderDl("database-data", [
        ["Status", metrics.ok ? statusBadge("Acessível", "ok") : statusBadge("Erro", "err")],
        ["Caminho", "<code>" + escapeHtml(metrics.path) + "</code>"],
        ["Tamanho", escapeHtml(fmtMb(metrics.sizeMb))],
        ["Usuários", escapeHtml(metrics.totalUsuarios)],
        ["Lançamentos", escapeHtml(metrics.totalLancamentos)],
        ["Metas", escapeHtml(metrics.totalMetas)],
        ["Último lançamento", escapeHtml(fmtDate(metrics.ultimoLancamentoAt))],
        ["Receitas do mês", escapeHtml(fmtMoney(metrics.resumoMesAtual.receitas))],
        ["Despesas do mês", escapeHtml(fmtMoney(metrics.resumoMesAtual.despesas))],
      ])
      renderBackups(backups.backups)
      renderEvents(events.eventos)
    }

    document.getElementById("backup-button").addEventListener("click", async () => {
      const button = document.getElementById("backup-button")
      const message = document.getElementById("action-message")
      button.disabled = true
      button.textContent = "Gerando..."
      message.textContent = "Criando backup manual..."
      try {
        await api("/api/admin/backup", { method: "POST" })
        message.textContent = "Backup criado com sucesso."
        await refresh()
      } catch (err) {
        message.textContent = "Não foi possível gerar o backup."
      } finally {
        button.disabled = false
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10"></path><path d="m8 9 4 4 4-4"></path><path d="M5 17a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3"></path></svg>Gerar backup agora'
      }
    })

    refresh().catch(() => {
      document.getElementById("last-refresh").textContent = "Não foi possível carregar o painel."
      document.getElementById("action-message").textContent = "Confira o token e tente novamente."
    })
    setInterval(() => refresh().catch(() => {}), 15000)
  </script>
</body>
</html>`
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: SERVICE_NAME,
  })
})

app.get(["/", "/admin", "/painel", "/dashboard"], auth, (req, res) => {
  res.type("html").send(renderAdminHtml())
})

app.get("/api/admin/status", auth, async (req, res) => {
  res.json(await montarStatus())
})

app.get("/api/admin/metrics", auth, (req, res) => {
  res.json(obterMetricasBanco())
})

app.get("/api/admin/beta", auth, (req, res) => {
  res.json(listarBetaSeguro())
})

app.get("/api/admin/backups", auth, async (req, res) => {
  res.json({
    backupDir: sanitizarCaminho(config.backupDir),
    backups: await listarBackupsRecentes(),
  })
})

app.post("/api/admin/backup", auth, async (req, res) => {
  try {
    const arquivo = await executarBackup()
    const nome = path.basename(arquivo)
    registrarEvento("backup_criado", { arquivo: nome })
    res.json({ ok: true, arquivo: nome })
  } catch (err) {
    const erro = sanitizarValorPainel(err.message)
    registrarEvento("erro_backup", { erro })
    logger.error({ err: erro }, "Erro no backup manual")
    res.status(500).json({ ok: false, erro })
  }
})

app.get("/api/admin/events", auth, (req, res) => {
  res.json({ eventos: obterRuntimeState().eventos })
})

// Rotas antigas mantidas para compatibilidade com ferramentas internas.
app.get("/api/stats", auth, (req, res) => {
  const mes = mesAtual()
  const usuarios = getTodosUsuarios()

  const stats = usuarios.map(u => ({
    id: mascararIdentificadorBeta(u.id),
    nome: sanitizarValorPainel(obterNomeExibicaoUsuario(u) ?? "Usuário"),
    entradas: getSomaPorTipo(u.id, "entrada", mes),
    gastos: getSomaPorTipo(u.id, "gasto", mes),
    meta: u.meta_mensal ?? null,
  }))

  const totalE = stats.reduce((s, u) => s + u.entradas, 0)
  const totalG = stats.reduce((s, u) => s + u.gastos, 0)

  res.json({
    mes,
    totalUsuarios: usuarios.length,
    totalEntradas: totalE,
    totalGastos: totalG,
    saldoGeral: totalE - totalG,
    usuarios: stats,
  })
})

app.get("/api/lancamentos/:mes", auth, (req, res) => {
  const { mes } = req.params
  const lancamentos = getLancamentosGrupoPorMes(mes).map(lancamento => ({
    ...lancamento,
    usuario_id: mascararIdentificadorBeta(lancamento.usuario_id),
    nome_usuario: sanitizarValorPainel(obterNomeExibicaoUsuario(lancamento.nome_usuario) ?? "Usuário"),
  }))
  res.json({ mes, total: lancamentos.length, lancamentos })
})

app.get("/api/usuarios", auth, (req, res) => {
  const usuarios = getTodosUsuarios().map(u => ({
    id: mascararIdentificadorBeta(u.id),
    nome: sanitizarValorPainel(obterNomeExibicaoUsuario(u) ?? "Usuário"),
    meta: u.meta_mensal ?? null,
    criado_em: new Date(u.criado_em).toISOString(),
  }))
  res.json({ total: usuarios.length, usuarios })
})

app.get("/api/exportar/:usuarioId/:mes", auth, (req, res) => {
  const { usuarioId, mes } = req.params
  const csv = gerarCSV(usuarioId, mes)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="financas-${mes}.csv"`)
  res.send(csv)
})

app.post("/api/backup", auth, async (req, res) => {
  try {
    const arquivo = await executarBackup()
    const nome = path.basename(arquivo)
    registrarEvento("backup_criado", { arquivo: nome })
    res.json({ ok: true, arquivo: nome })
  } catch (err) {
    const erro = sanitizarValorPainel(err.message)
    logger.error({ err: erro }, "Erro no backup manual")
    res.status(500).json({ ok: false, erro })
  }
})

export { app }

export function iniciarPainel(statusBot) {
  if (statusBot) {
    app.locals.statusBot = statusBot
  }

  const server = app.listen(config.painel.porta, () => {
    logger.info({ porta: config.painel.porta }, "Painel interno iniciado")
    logger.info(`Dashboard: http://localhost:${config.painel.porta}/admin`)
  })

  return server
}
