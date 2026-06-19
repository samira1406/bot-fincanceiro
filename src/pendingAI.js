import { config } from "./config.js"

const pendencias = new Map()

function chave(usuarioId) {
  return String(usuarioId)
}

function clonar(valor) {
  return structuredClone(valor)
}

function expirou(pendencia) {
  return Date.now() > pendencia.expiraEm
}

export function iniciarPendenciaAI(usuarioId, etapa, interpretacao) {
  const agora = Date.now()
  const pendencia = {
    etapa,
    interpretacao: clonar(interpretacao),
    criadoEm: agora,
    atualizadoEm: agora,
    expiraEm: agora + (Number(config.timeoutEstadoMs) || 600_000),
  }
  pendencias.set(chave(usuarioId), pendencia)
  return clonar(pendencia)
}

export function obterPendenciaAI(usuarioId) {
  const id = chave(usuarioId)
  const pendencia = pendencias.get(id)
  if (!pendencia) return null
  if (expirou(pendencia)) {
    pendencias.delete(id)
    return null
  }
  return clonar(pendencia)
}

export function atualizarPendenciaAI(usuarioId, campos = {}) {
  const atual = obterPendenciaAI(usuarioId)
  if (!atual) return null
  const atualizada = {
    ...atual,
    ...clonar(campos),
    atualizadoEm: Date.now(),
  }
  pendencias.set(chave(usuarioId), atualizada)
  return clonar(atualizada)
}

export function limparPendenciaAI(usuarioId) {
  return pendencias.delete(chave(usuarioId))
}

export function resetPendenciasAIParaTestes() {
  pendencias.clear()
}
