import { config } from "./config.js"

function normalizarComando(texto) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Valida e parseia uma mensagem de lançamento.
 *
 * Formatos aceitos:
 *   "mercado 120,50"              → { nome:"mercado", categoria:"geral", valor:120.50 }
 *   "mercado alimentacao 120,50"  → { nome:"mercado", categoria:"alimentacao", valor:120.50 }
 *
 * @param {string} mensagem
 * @returns {{ nome:string, categoria:string, valor:number }|null}
 */
export function parseLancamento(mensagem) {
  const partes = mensagem.trim().toLowerCase().split(/\s+/)
  if (partes.length < 2) return null

  const valorRaw = partes[partes.length - 1].replace(",", ".")
  const valor    = parseFloat(valorRaw)

  if (!Number.isFinite(valor)) return null
  if (valor <= 0)              return null
  if (valor > config.valorMaximo) return null

  const nome      = partes[0]
  const categoria = partes.length >= 3 ? partes[1] : "geral"

  const valido = /^[a-zà-ú0-9\-_]+$/i
  if (!valido.test(nome))      return null
  if (!valido.test(categoria)) return null

  return { nome, categoria, valor }
}

/**
 * Parseia um valor monetário simples de uma string.
 * @param {string} texto
 * @returns {number|null}
 */
export function parseValorSimples(texto) {
  if (!texto) return null
  const normalizado = texto.trim().replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  const valor = parseFloat(normalizado)
  if (!Number.isFinite(valor) || valor <= 0 || valor > config.valorMaximo) return null
  return valor
}

/**
 * Parseia comandos de correção do último lançamento.
 * @param {string} mensagem
 * @returns {{ valor:number }|null}
 */
export function parseCorrecaoUltimo(mensagem) {
  const match = normalizarComando(mensagem).match(/^(corrigir|corrige|alterar) ultimo para (.+)$/)
  if (!match) return null

  const valor = parseValorSimples(match[2])
  if (!valor) return null

  return { valor }
}
