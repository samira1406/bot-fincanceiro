import { config } from "./config.js"

const pendenciasEdicao = new Map()
const pendenciasExclusao = new Map()
const pendenciasReset = new Map()
const pendenciasDemo = new Map()

function chave(usuarioId) {
  return String(usuarioId)
}

function criarPendencia(mapa, usuarioId, dados = {}) {
  const agora = Date.now()
  const pendencia = {
    ...dados,
    criadoEm: agora,
    atualizadoEm: agora,
    expiraEm: agora + (Number(config.timeoutEstadoMs) || 600_000),
  }
  mapa.set(chave(usuarioId), pendencia)
  return { ...pendencia }
}

function obterPendencia(mapa, usuarioId) {
  const id = chave(usuarioId)
  const pendencia = mapa.get(id)
  if (!pendencia) return null

  if (Date.now() > pendencia.expiraEm) {
    mapa.delete(id)
    return null
  }

  return {
    ...pendencia,
    itens: pendencia.itens ? [...pendencia.itens] : undefined,
    snapshotBefore: pendencia.snapshotBefore
      ? { ...pendencia.snapshotBefore }
      : undefined,
  }
}

function atualizarPendencia(mapa, usuarioId, campos) {
  const atual = obterPendencia(mapa, usuarioId)
  if (!atual) return null

  const pendencia = {
    ...atual,
    ...campos,
    atualizadoEm: Date.now(),
  }
  mapa.set(chave(usuarioId), pendencia)
  return { ...pendencia }
}

export function iniciarPendenciaEdicao(usuarioId, dados) {
  return criarPendencia(pendenciasEdicao, usuarioId, dados)
}

export function obterPendenciaEdicao(usuarioId) {
  return obterPendencia(pendenciasEdicao, usuarioId)
}

export function atualizarPendenciaEdicao(usuarioId, campos) {
  return atualizarPendencia(pendenciasEdicao, usuarioId, campos)
}

export function limparPendenciaEdicao(usuarioId) {
  return pendenciasEdicao.delete(chave(usuarioId))
}

export function iniciarPendenciaExclusao(usuarioId, dados) {
  return criarPendencia(pendenciasExclusao, usuarioId, dados)
}

export function obterPendenciaExclusao(usuarioId) {
  return obterPendencia(pendenciasExclusao, usuarioId)
}

export function limparPendenciaExclusao(usuarioId) {
  return pendenciasExclusao.delete(chave(usuarioId))
}

export function iniciarPendenciaReset(usuarioId, dados = {}) {
  return criarPendencia(pendenciasReset, usuarioId, {
    escopo: "usuario",
    fraseObrigatoria: "CONFIRMAR RESET",
    ...dados,
  })
}

export function obterPendenciaReset(usuarioId) {
  return obterPendencia(pendenciasReset, usuarioId)
}

export function limparPendenciaReset(usuarioId) {
  return pendenciasReset.delete(chave(usuarioId))
}

export function iniciarPendenciaDemo(usuarioId, dados = {}) {
  return criarPendencia(pendenciasDemo, usuarioId, dados)
}

export function obterPendenciaDemo(usuarioId) {
  return obterPendencia(pendenciasDemo, usuarioId)
}

export function limparPendenciaDemo(usuarioId) {
  return pendenciasDemo.delete(chave(usuarioId))
}

export function limparPendenciasAcoesUsuario(usuarioId) {
  limparPendenciaEdicao(usuarioId)
  limparPendenciaExclusao(usuarioId)
  limparPendenciaReset(usuarioId)
  limparPendenciaDemo(usuarioId)
}

export function temPendenciaAcaoUsuario(usuarioId) {
  return Boolean(
    obterPendenciaReset(usuarioId) ||
    obterPendenciaExclusao(usuarioId) ||
    obterPendenciaEdicao(usuarioId) ||
    obterPendenciaDemo(usuarioId)
  )
}

export function resetPendenciasEdicaoParaTestes() {
  pendenciasEdicao.clear()
  pendenciasExclusao.clear()
  pendenciasReset.clear()
  pendenciasDemo.clear()
}
