import { mascararIdentificadorBeta } from "./config.js"

const MAX_EVENTOS = 200

const estado = {
  iniciadoEm: new Date().toISOString(),
  bot: {
    status: "desconhecido",
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastMessageAt: null,
    lastError: null,
    mensagensProcessadas: 0,
    fallbacksAcionados: 0,
    ignoradasBeta: 0,
    ignoradasGrupo: 0,
    ignoradasFromMe: 0,
  },
  eventos: [],
}

function agoraIso() {
  return new Date().toISOString()
}

function limitarTexto(texto, limite = 120) {
  const valor = String(texto ?? "").replace(/\s+/g, " ").trim()
  return valor.length > limite ? `${valor.slice(0, limite - 3)}...` : valor
}

export function sanitizarValorPainel(valor) {
  if (valor === undefined || valor === null) return valor
  return limitarTexto(String(valor)
    .replace(/[a-z0-9._-]+@(s\.whatsapp\.net|g\.us|lid)/gi, match => mascararIdentificadorBeta(match))
    .replace(/[0-9]{9,}/g, match => mascararIdentificadorBeta(match)))
}

export function registrarEvento(tipo, detalhes = {}) {
  const evento = {
    ts: agoraIso(),
    tipo,
    detalhes: Object.fromEntries(
      Object.entries(detalhes).map(([chave, valor]) => [chave, sanitizarValorPainel(valor)])
    ),
  }

  estado.eventos.unshift(evento)
  if (estado.eventos.length > MAX_EVENTOS) {
    estado.eventos.length = MAX_EVENTOS
  }

  return evento
}

export function atualizarStatusBot(status, detalhes = {}) {
  estado.bot.status = status

  if (status === "conectado") {
    estado.bot.lastConnectedAt = detalhes.em ?? agoraIso()
    estado.bot.lastError = null
  }

  if (status === "desconectado") {
    estado.bot.lastDisconnectedAt = detalhes.em ?? agoraIso()
  }

  if (detalhes.erro) {
    estado.bot.lastError = sanitizarValorPainel(detalhes.erro)
  }

  registrarEvento(`bot_${status}`, detalhes)
}

export function registrarMensagemProcessada(detalhes = {}) {
  estado.bot.mensagensProcessadas += 1
  estado.bot.lastMessageAt = agoraIso()
  registrarEvento("mensagem_processada", detalhes)
}

export function registrarMensagemIgnorada(motivo, detalhes = {}) {
  if (motivo === "beta") estado.bot.ignoradasBeta += 1
  if (motivo === "grupo") estado.bot.ignoradasGrupo += 1
  if (motivo === "fromMe") estado.bot.ignoradasFromMe += 1
  registrarEvento(`mensagem_ignorada_${motivo}`, detalhes)
}

export function registrarFallbackAcionado(motivo) {
  estado.bot.fallbacksAcionados += 1
  registrarEvento("fallback_acionado", { motivo })
}

export function obterRuntimeState() {
  return {
    iniciadoEm: estado.iniciadoEm,
    bot: { ...estado.bot },
    eventos: estado.eventos.map(evento => ({
      ts: evento.ts,
      tipo: evento.tipo,
      detalhes: { ...evento.detalhes },
    })),
  }
}

export function resetRuntimeStateParaTestes() {
  estado.bot = {
    status: "desconhecido",
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastMessageAt: null,
    lastError: null,
    mensagensProcessadas: 0,
    fallbacksAcionados: 0,
    ignoradasBeta: 0,
    ignoradasGrupo: 0,
    ignoradasFromMe: 0,
  }
  estado.eventos = []
}
