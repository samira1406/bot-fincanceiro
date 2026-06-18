import { config } from "./config.js"

const pendencias = new Map()

function chavePendencia(_from, usuarioId) {
  return String(usuarioId)
}

function expirou(pendencia, agora = Date.now()) {
  const limite = Number(config.timeoutEstadoMs) || 600_000
  return agora - pendencia.atualizadoEm > limite
}

export function iniciarPendenciaLancamento(from, usuarioId, valor) {
  const agora = Date.now()
  const pendencia = {
    etapa: "tipo",
    valor,
    tipo: null,
    criadoEm: agora,
    atualizadoEm: agora,
  }
  pendencias.set(chavePendencia(from, usuarioId), pendencia)
  return { ...pendencia }
}

export function obterPendenciaLancamento(from, usuarioId) {
  const chave = chavePendencia(from, usuarioId)
  const pendencia = pendencias.get(chave)
  if (!pendencia) return null

  if (expirou(pendencia)) {
    pendencias.delete(chave)
    return null
  }

  return { ...pendencia }
}

export function selecionarTipoPendencia(from, usuarioId, tipo) {
  const chave = chavePendencia(from, usuarioId)
  const pendencia = pendencias.get(chave)
  if (!pendencia || expirou(pendencia)) {
    pendencias.delete(chave)
    return null
  }

  pendencia.etapa = "categoria"
  pendencia.tipo = tipo
  pendencia.atualizadoEm = Date.now()
  return { ...pendencia }
}

export function limparPendenciaLancamento(from, usuarioId) {
  return pendencias.delete(chavePendencia(from, usuarioId))
}

export function temPendenciaLancamento(from, usuarioId) {
  return obterPendenciaLancamento(from, usuarioId) !== null
}

export function resetPendenciasLancamentoParaTestes() {
  pendencias.clear()
}
