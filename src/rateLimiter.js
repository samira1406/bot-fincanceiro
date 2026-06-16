/**
 * @fileoverview Rate limiter por usuário — janela deslizante de 1 minuto.
 * Armazenado em memória: sem dependência externa, zera com o processo.
 */

import { config } from "./config.js"
import { logger }  from "./logger.js"

/** @type {Map<string, number[]>} usuarioId → timestamps de mensagens */
const janelas = new Map()

/**
 * Verifica se o usuário está dentro do limite de mensagens por minuto.
 * @param {string} usuarioId
 * @returns {boolean} true = pode processar | false = bloqueado
 */
export function verificarRateLimit(usuarioId) {
  const agora   = Date.now()
  const janela  = 60_000
  const limite  = config.rateLimitPorMinuto

  const timestamps = (janelas.get(usuarioId) ?? [])
    .filter(ts => agora - ts < janela)   // mantém apenas os da última janela

  if (timestamps.length >= limite) {
    logger.warn({ usuarioId, msgs: timestamps.length }, "Rate limit atingido")
    return false
  }

  timestamps.push(agora)
  janelas.set(usuarioId, timestamps)
  return true
}

// Limpeza periódica para evitar crescimento indefinido da Map
setInterval(() => {
  const agora  = Date.now()
  const janela = 60_000
  for (const [id, timestamps] of janelas) {
    const recentes = timestamps.filter(ts => agora - ts < janela)
    if (recentes.length === 0) janelas.delete(id)
    else janelas.set(id, recentes)
  }
}, 5 * 60_000)
