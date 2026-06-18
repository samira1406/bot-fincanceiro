import { config } from "./config.js"

const avaliacoesPendentes = new Map()

function chave(usuarioId) {
  return String(usuarioId)
}

function expirou(pendencia) {
  return Date.now() > pendencia.expiraEm
}

export function iniciarAvaliacaoBeta(usuarioId) {
  const agora = Date.now()
  const pendencia = {
    etapa: "nota",
    nota: null,
    criadoEm: agora,
    atualizadoEm: agora,
    expiraEm: agora + (Number(config.timeoutEstadoMs) || 600_000),
  }
  avaliacoesPendentes.set(chave(usuarioId), pendencia)
  return { ...pendencia }
}

export function obterAvaliacaoBetaPendente(usuarioId) {
  const id = chave(usuarioId)
  const pendencia = avaliacoesPendentes.get(id)
  if (!pendencia) return null

  if (expirou(pendencia)) {
    avaliacoesPendentes.delete(id)
    return null
  }

  return { ...pendencia }
}

export function selecionarNotaAvaliacaoBeta(usuarioId, nota) {
  const pendencia = obterAvaliacaoBetaPendente(usuarioId)
  if (!pendencia) return null

  const atualizada = {
    ...pendencia,
    etapa: "comentario",
    nota,
    atualizadoEm: Date.now(),
  }
  avaliacoesPendentes.set(chave(usuarioId), atualizada)
  return { ...atualizada }
}

export function limparAvaliacaoBetaPendente(usuarioId) {
  return avaliacoesPendentes.delete(chave(usuarioId))
}

export function temAvaliacaoBetaPendente(usuarioId) {
  return obterAvaliacaoBetaPendente(usuarioId) !== null
}

export function resetPendenciasBetaParaTestes() {
  avaliacoesPendentes.clear()
}
