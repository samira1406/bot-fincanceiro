/**
 * @fileoverview Camada de acesso a dados — SQLite via better-sqlite3.
 *
 * Design decisions:
 *  - Síncrono: better-sqlite3 não usa promises, evitando race conditions sem fila manual.
 *  - WAL mode: leituras e escritas concorrentes sem lock total.
 *  - Migrations versionadas: schema evolui sem ALTER TABLE manual.
 *  - Prepared statements reutilizados: performance e proteção contra SQL injection.
 */

import Database   from "better-sqlite3"
import { resolve } from "path"
import fs          from "fs"
import { config }  from "./config.js"
import { logger }  from "./logger.js"
import { gerarCSVLancamentos } from "./exporters.js"
import { normalizarCategoriaPorPalavraChave } from "./categoryRules.js"

// ── Inicialização ─────────────────────────────────────────────────────────────
fs.mkdirSync(resolve(config.dbPath, ".."), { recursive: true })

const db = new Database(config.dbPath)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")
db.pragma("busy_timeout = 5000")   // espera até 5s em vez de falhar imediatamente

// ── Migrations versionadas ────────────────────────────────────────────────────
// Tabela de controle de schema
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL UNIQUE,
    aplicada_em INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )
`)

const migDir = resolve("./src/migrations")
const arquivos = fs.readdirSync(migDir)
  .filter(f => f.endsWith(".sql"))
  .sort()

for (const arquivo of arquivos) {
  const jaAplicada = db.prepare("SELECT 1 FROM _migrations WHERE nome = ?").get(arquivo)
  if (jaAplicada) continue

  const sql = fs.readFileSync(resolve(migDir, arquivo), "utf8")
  db.exec(sql)
  db.prepare("INSERT INTO _migrations (nome) VALUES (?)").run(arquivo)
  logger.info({ migration: arquivo }, "Migration aplicada")
}

logger.info({ db: config.dbPath }, "Banco de dados pronto")

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Retorna o mês atual no formato "M-YYYY".
 * @returns {string}
 */
export function mesAtual() {
  const d = new Date()
  return `${d.getMonth() + 1}-${d.getFullYear()}`
}

// ── Usuários ──────────────────────────────────────────────────────────────────

/**
 * Retorna um usuário pelo ID, ou null se não existir.
 * @param {string} id
 * @returns {object|null}
 */
export function getUsuario(id) {
  return db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id) ?? null
}

/**
 * Cria um usuário novo (INSERT OR IGNORE).
 * @param {string} id
 * @returns {object}
 */
export function criarUsuario(id) {
  db.prepare("INSERT OR IGNORE INTO usuarios (id) VALUES (?)").run(id)
  return getUsuario(id)
}

/**
 * Atualiza campos arbitrários de um usuário.
 * @param {string} id
 * @param {Record<string, any>} campos
 */
export function atualizarUsuario(id, campos) {
  const sets   = Object.keys(campos).map(k => `${k} = ?`).join(", ")
  const values = [...Object.values(campos), id]
  db.prepare(`UPDATE usuarios SET ${sets} WHERE id = ?`).run(...values)
}

/**
 * Cancela estados expirados antes de processar a mensagem seguinte.
 * @param {string} id
 */
export function limparEstadoExpirado(id) {
  const u = getUsuario(id)
  if (!u) return
  if (u.aguardando_caixinha && u.estado_expira_em && Date.now() > u.estado_expira_em) {
    atualizarUsuario(id, {
      aguardando_caixinha:     0,
      valor_sugerido_caixinha: 0,
      estado_expira_em:        null,
    })
  }
}

/** @returns {object[]} Todos os usuários com nome definido */
export function getTodosUsuarios() {
  return db.prepare("SELECT * FROM usuarios WHERE aguardando_nome = 0").all()
}

// ── Lançamentos ───────────────────────────────────────────────────────────────

/**
 * Insere um lançamento.
 * @param {{ usuarioId:string, tipo:"entrada"|"gasto", nome:string, categoria?:string, valor:number, mes?:string, tags?:string, criadoEm?:number }} p
 * @returns {number} ID do lançamento inserido
 */
export function inserirLancamento({
  usuarioId,
  tipo,
  nome,
  categoria,
  valor,
  mes,
  tags = "",
  criadoEm,
}) {
  const categoriaNorm = normalizarCategoriaPorPalavraChave(categoria ?? "geral", tipo)
  const dataLancamento = Number.isFinite(criadoEm) ? new Date(criadoEm) : null
  const mesLancamento = mes ?? (dataLancamento
    ? `${dataLancamento.getMonth() + 1}-${dataLancamento.getFullYear()}`
    : mesAtual())
  const info = dataLancamento
    ? db.prepare(`
        INSERT INTO lancamentos (
          usuario_id, tipo, nome, categoria, valor, mes, tags, criado_em
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        usuarioId,
        tipo,
        nome,
        categoriaNorm,
        valor,
        mesLancamento,
        tags,
        dataLancamento.getTime()
      )
    : db.prepare(`
        INSERT INTO lancamentos (usuario_id, tipo, nome, categoria, valor, mes, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(usuarioId, tipo, nome, categoriaNorm, valor, mesLancamento, tags)
  return info.lastInsertRowid
}

/**
 * Retorna todos os lançamentos de um usuário em um mês.
 * @param {string} usuarioId
 * @param {string} mes
 * @returns {object[]}
 */
export function getLancamentosPorMes(usuarioId, mes) {
  return db.prepare(`
    SELECT * FROM lancamentos
    WHERE usuario_id = ? AND mes = ?
    ORDER BY criado_em ASC
  `).all(usuarioId, mes)
}

/**
 * Retorna os últimos lançamentos de um usuário.
 * @param {string} usuarioId
 * @param {number} [limite=5]
 * @returns {object[]}
 */
export function getUltimosLancamentos(usuarioId, limite = 5) {
  return db.prepare(`
    SELECT * FROM lancamentos
    WHERE usuario_id = ?
    ORDER BY criado_em DESC, id DESC
    LIMIT ?
  `).all(usuarioId, limite)
}

/**
 * Retorna lançamentos de um usuário a partir de um timestamp.
 * @param {string} usuarioId
 * @param {string} tipo
 * @param {number} desde  timestamp em ms
 * @returns {object[]}
 */
export function getLancamentosPorPeriodo(usuarioId, tipo, desde) {
  return db.prepare(`
    SELECT * FROM lancamentos
    WHERE usuario_id = ? AND tipo = ? AND criado_em >= ?
    ORDER BY criado_em ASC
  `).all(usuarioId, tipo, desde)
}

/**
 * Retorna gastos agrupados por categoria para um mês.
 * @param {string} usuarioId
 * @param {string} mes
 * @returns {{ categoria:string, total:number }[]}
 */
export function getGastosPorCategoria(usuarioId, mes) {
  return db.prepare(`
    SELECT categoria, SUM(valor) as total
    FROM lancamentos
    WHERE usuario_id = ? AND mes = ? AND tipo = 'gasto'
    GROUP BY categoria
    ORDER BY total DESC
  `).all(usuarioId, mes)
}

/**
 * Retorna todos os lançamentos de um mês (todos os usuários) para o painel web.
 * @param {string} mes
 * @returns {object[]}
 */
export function getLancamentosGrupoPorMes(mes) {
  return db.prepare(`
    SELECT l.*, u.nome as nome_usuario
    FROM lancamentos l
    JOIN usuarios u ON u.id = l.usuario_id
    WHERE l.mes = ?
    ORDER BY l.criado_em DESC
  `).all(mes)
}

/**
 * Retorna o último lançamento de um usuário.
 * @param {string} usuarioId
 * @returns {object|null}
 */
export function getUltimoLancamento(usuarioId) {
  return db.prepare(`
    SELECT * FROM lancamentos WHERE usuario_id = ?
    ORDER BY criado_em DESC, id DESC LIMIT 1
  `).get(usuarioId) ?? null
}

/**
 * Busca um lançamento apenas quando ele pertence ao usuário informado.
 * @param {string} usuarioId
 * @param {number} id
 * @returns {object|null}
 */
export function getLancamentoDoUsuario(usuarioId, id) {
  return db.prepare(`
    SELECT * FROM lancamentos
    WHERE id = ? AND usuario_id = ?
  `).get(id, usuarioId) ?? null
}

/**
 * Atualiza campos editáveis de um lançamento pertencente ao usuário.
 * @param {string} usuarioId
 * @param {number} id
 * @param {{ valor?:number, categoria?:string, tipo?:"entrada"|"gasto", nome?:string, criadoEm?:number }} campos
 * @returns {object|null}
 */
export function atualizarLancamentoDoUsuario(usuarioId, id, campos) {
  const atual = getLancamentoDoUsuario(usuarioId, id)
  if (!atual) return null

  const atualizacoes = {}
  if (campos.valor !== undefined) {
    const valor = Number(campos.valor)
    if (!Number.isFinite(valor) || valor <= 0 || valor > config.valorMaximo) return null
    atualizacoes.valor = valor
  }
  if (campos.tipo !== undefined) {
    if (!["entrada", "gasto"].includes(campos.tipo)) return null
    atualizacoes.tipo = campos.tipo
  }
  if (campos.categoria !== undefined) {
    atualizacoes.categoria = normalizarCategoriaPorPalavraChave(
      campos.categoria,
      campos.tipo ?? atual.tipo
    )
  }
  if (campos.nome !== undefined) {
    const nome = String(campos.nome).trim()
    if (!nome) return null
    atualizacoes.nome = nome
  }
  if (campos.criadoEm !== undefined) {
    const data = new Date(Number(campos.criadoEm))
    if (Number.isNaN(data.getTime())) return null
    atualizacoes.criado_em = data.getTime()
    atualizacoes.mes = `${data.getMonth() + 1}-${data.getFullYear()}`
  }

  const entradas = Object.entries(atualizacoes)
  if (!entradas.length) return atual

  const sets = entradas.map(([campo]) => `${campo} = ?`).join(", ")
  const valores = entradas.map(([, valor]) => valor)
  db.prepare(`
    UPDATE lancamentos
    SET ${sets}
    WHERE id = ? AND usuario_id = ?
  `).run(...valores, id, usuarioId)

  return getLancamentoDoUsuario(usuarioId, id)
}

/**
 * Atualiza apenas o valor de um lançamento pertencente ao usuário.
 * @param {string} usuarioId
 * @param {number} id
 * @param {number} valor
 * @returns {boolean}
 */
export function atualizarValorLancamento(usuarioId, id, valor) {
  return atualizarLancamentoDoUsuario(usuarioId, id, { valor }) !== null
}

/**
 * Deleta um lançamento por ID.
 * @param {number} id
 */
export function deletarLancamento(id) {
  db.prepare("DELETE FROM lancamentos WHERE id = ?").run(id)
}

/**
 * Deleta um lançamento somente se ele pertencer ao usuário informado.
 * @param {string} usuarioId
 * @param {number} id
 * @returns {boolean}
 */
export function deletarLancamentoDoUsuario(usuarioId, id) {
  const info = db.prepare(`
    DELETE FROM lancamentos
    WHERE id = ? AND usuario_id = ?
  `).run(id, usuarioId)
  return info.changes === 1
}

/**
 * Deleta lançamentos de um usuário a partir de um timestamp.
 * @param {string} usuarioId
 * @param {number} desde  timestamp em ms
 * @returns {number} Quantidade de registros deletados
 */
export function deletarLancamentosDesde(usuarioId, desde) {
  return db.prepare(`
    DELETE FROM lancamentos WHERE usuario_id = ? AND criado_em >= ?
  `).run(usuarioId, desde).changes
}

/**
 * Remove somente dados financeiros do usuário, preservando cadastro e sessão.
 * @param {string} usuarioId
 * @returns {{ lancamentos:number, metasCategoria:number }}
 */
export function limparDadosFinanceirosUsuario(usuarioId) {
  const executar = db.transaction((id) => {
    const metasCategoria = db.prepare(
      "DELETE FROM metas_categoria WHERE usuario_id = ?"
    ).run(id).changes
    const lancamentos = db.prepare(
      "DELETE FROM lancamentos WHERE usuario_id = ?"
    ).run(id).changes

    db.prepare(`
      UPDATE usuarios
      SET meta_mensal = NULL,
          aguardando_caixinha = 0,
          valor_sugerido_caixinha = 0,
          estado_expira_em = NULL
      WHERE id = ?
    `).run(id)

    return { lancamentos, metasCategoria }
  })

  return executar(usuarioId)
}

/**
 * Indica se o usuário já possui dados fictícios recentes.
 * @param {string} usuarioId
 * @param {number} [desde]
 * @returns {boolean}
 */
export function temDadosExemploRecentes(
  usuarioId,
  desde = Date.now() - (30 * 24 * 60 * 60 * 1000)
) {
  return Boolean(db.prepare(`
    SELECT 1 FROM lancamentos
    WHERE usuario_id = ?
      AND tags LIKE '%dado_exemplo%'
      AND criado_em >= ?
    LIMIT 1
  `).get(usuarioId, desde))
}

// ── Feedback do beta ─────────────────────────────────────────────────────────

const TIPOS_FEEDBACK_BETA = new Set(["feedback", "bug", "avaliacao"])
const STATUS_FEEDBACK_BETA = new Set(["novo", "lido", "resolvido"])

/**
 * Registra feedback estruturado de um beta tester.
 * @param {{ usuarioId:string, tipo:"feedback"|"bug"|"avaliacao", texto?:string, nota?:number|null, contexto?:string }} dados
 * @returns {number|null}
 */
export function inserirFeedbackBeta({
  usuarioId,
  tipo,
  texto = "",
  nota = null,
  contexto = "",
}) {
  if (!getUsuario(usuarioId) || !TIPOS_FEEDBACK_BETA.has(tipo)) return null
  if (tipo === "avaliacao" && (!Number.isInteger(nota) || nota < 0 || nota > 10)) {
    return null
  }

  const info = db.prepare(`
    INSERT INTO feedback_beta (
      usuario_id, tipo, texto, nota, status, contexto
    )
    VALUES (?, ?, ?, ?, 'novo', ?)
  `).run(
    usuarioId,
    tipo,
    String(texto).trim(),
    nota,
    String(contexto).trim()
  )
  return info.lastInsertRowid
}

/**
 * Lista feedbacks recentes, opcionalmente filtrados por status.
 * @param {{ limite?:number, status?:string }} [opcoes]
 * @returns {object[]}
 */
export function listarFeedbacksBeta({ limite = 10, status } = {}) {
  const limiteSeguro = Math.min(Math.max(Number(limite) || 10, 1), 100)
  if (status && !STATUS_FEEDBACK_BETA.has(status)) return []

  if (status) {
    return db.prepare(`
      SELECT * FROM feedback_beta
      WHERE status = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(status, limiteSeguro)
  }

  return db.prepare(`
    SELECT * FROM feedback_beta
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limiteSeguro)
}

/**
 * Retorna métricas agregadas do beta sem detalhar usuários.
 * @returns {object}
 */
export function obterResumoFeedbackBeta() {
  const totais = db.prepare(`
    SELECT
      SUM(CASE WHEN tipo = 'feedback' AND status = 'novo' THEN 1 ELSE 0 END) AS feedbacks_novos,
      SUM(CASE WHEN tipo = 'bug' AND status = 'novo' THEN 1 ELSE 0 END) AS bugs_novos,
      AVG(CASE WHEN tipo = 'avaliacao' THEN nota END) AS media_notas,
      COUNT(*) AS total
    FROM feedback_beta
  `).get()

  return {
    feedbacksNovos: totais?.feedbacks_novos ?? 0,
    bugsNovos: totais?.bugs_novos ?? 0,
    mediaNotas: totais?.media_notas === null || totais?.media_notas === undefined
      ? null
      : Math.round(totais.media_notas * 100) / 100,
    total: totais?.total ?? 0,
  }
}

/**
 * Atualiza o status operacional de um feedback.
 * @param {number} id
 * @param {"novo"|"lido"|"resolvido"} status
 * @returns {boolean}
 */
export function atualizarStatusFeedbackBeta(id, status) {
  if (!STATUS_FEEDBACK_BETA.has(status)) return false
  return db.prepare(`
    UPDATE feedback_beta
    SET status = ?
    WHERE id = ?
  `).run(status, id).changes === 1
}

// ── Agregações ────────────────────────────────────────────────────────────────

/**
 * Retorna a soma de lançamentos de um tipo para um usuário em um mês.
 * @param {string} usuarioId
 * @param {"entrada"|"gasto"} tipo
 * @param {string} mes
 * @returns {number}
 */
export function getSomaPorTipo(usuarioId, tipo, mes) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total
    FROM lancamentos WHERE usuario_id = ? AND tipo = ? AND mes = ?
  `).get(usuarioId, tipo, mes)
  return row?.total ?? 0
}

/**
 * Retorna os últimos N meses com dados de um usuário.
 * @param {string} usuarioId
 * @param {number} [limite=6]
 * @returns {string[]}
 */
export function getMesesComDados(usuarioId, limite = 6) {
  return db.prepare(`
    SELECT DISTINCT mes FROM lancamentos
    WHERE usuario_id = ?
    ORDER BY criado_em DESC LIMIT ?
  `).all(usuarioId, limite).map(r => r.mes)
}

// ── Metas ─────────────────────────────────────────────────────────────────────

/**
 * Define (ou atualiza) a meta mensal de gastos de um usuário.
 * @param {string} usuarioId
 * @param {number} valor
 */
export function definirMeta(usuarioId, valor) {
  atualizarUsuario(usuarioId, { meta_mensal: valor })
}

/**
 * Retorna a meta mensal de um usuário, ou null se não definida.
 * @param {string} usuarioId
 * @returns {number|null}
 */
export function getMeta(usuarioId) {
  return getUsuario(usuarioId)?.meta_mensal ?? null
}

// ── Metas por categoria ───────────────────────────────────────────────────────

function mesAnoParaMesChave(mes, ano) {
  return `${mes}-${ano}`
}

function normalizarCategoria(categoria) {
  return normalizarCategoriaPorPalavraChave(categoria, "gasto")
}

/**
 * Cria ou atualiza uma meta mensal por categoria.
 * @param {string} usuarioId
 * @param {string} categoria
 * @param {number} valorLimite
 * @param {number} mes
 * @param {number} ano
 * @returns {{ criada:boolean, meta:object }}
 */
export function criarOuAtualizarMetaCategoria(usuarioId, categoria, valorLimite, mes, ano) {
  const categoriaNorm = normalizarCategoria(categoria)
  const existente = buscarMetaCategoria(usuarioId, categoriaNorm, mes, ano)

  db.prepare(`
    INSERT INTO metas_categoria (
      usuario_id, categoria, valor_limite, periodo_mes, periodo_ano
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(usuario_id, categoria, periodo_mes, periodo_ano)
    DO UPDATE SET
      valor_limite = excluded.valor_limite,
      atualizado_em = unixepoch() * 1000
  `).run(usuarioId, categoriaNorm, valorLimite, mes, ano)

  return {
    criada: !existente,
    meta: buscarMetaCategoria(usuarioId, categoriaNorm, mes, ano),
  }
}

/**
 * Lista metas de categoria de um usuário em um mês/ano.
 * @param {string} usuarioId
 * @param {number} mes
 * @param {number} ano
 * @returns {object[]}
 */
export function listarMetasCategoria(usuarioId, mes, ano) {
  return db.prepare(`
    SELECT * FROM metas_categoria
    WHERE usuario_id = ? AND periodo_mes = ? AND periodo_ano = ?
    ORDER BY categoria ASC
  `).all(usuarioId, mes, ano)
}

/**
 * Busca uma meta de categoria de um usuário em um mês/ano.
 * @param {string} usuarioId
 * @param {string} categoria
 * @param {number} mes
 * @param {number} ano
 * @returns {object|null}
 */
export function buscarMetaCategoria(usuarioId, categoria, mes, ano) {
  return db.prepare(`
    SELECT * FROM metas_categoria
    WHERE usuario_id = ? AND categoria = ? AND periodo_mes = ? AND periodo_ano = ?
  `).get(usuarioId, normalizarCategoria(categoria), mes, ano) ?? null
}

/**
 * Calcula gastos do usuário em uma categoria durante um mês/ano.
 * @param {string} usuarioId
 * @param {string} categoria
 * @param {number} mes
 * @param {number} ano
 * @returns {number}
 */
export function calcularGastoCategoriaNoPeriodo(usuarioId, categoria, mes, ano) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(valor), 0) as total
    FROM lancamentos
    WHERE usuario_id = ?
      AND tipo = 'gasto'
      AND categoria = ?
      AND mes = ?
  `).get(usuarioId, normalizarCategoria(categoria), mesAnoParaMesChave(mes, ano))
  return row?.total ?? 0
}

// ── Exportação CSV ────────────────────────────────────────────────────────────

/**
 * Gera o conteúdo CSV de todos os lançamentos de um usuário em um mês.
 * @param {string} usuarioId
 * @param {string} mes
 * @returns {string}
 */
export function gerarCSV(usuarioId, mes) {
  const lancamentos = getLancamentosPorMes(usuarioId, mes)
  return gerarCSVLancamentos(lancamentos)
}

/** Expõe a instância db para o painel web (somente leitura) */
export { db }
