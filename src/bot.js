import {
  makeWASocket, useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion, makeCacheableSignalKeyStore, isJidBroadcast,
} from "@whiskeysockets/baileys"
import pino    from "pino"
import qrcode  from "qrcode-terminal"
import fs      from "fs-extra"

import {
  config, gerarVariantesNumeroBrasil, mascararIdentificadorBeta,
  grupoAutorizadoBeta, mascararNumeroBeta, normalizarJidBeta, normalizarNumeroWhatsApp,
  usuarioAutorizadoBeta,
} from "./config.js"
import { logger, logMensagem }                               from "./logger.js"
import { getUsuario, criarUsuario, atualizarUsuario, limparEstadoExpirado } from "./database.js"
import { enviar, handleRespostaCaixinha, processarMensagem } from "./commands.js"
import {
  fmtBetaFechado, fmtBoasVindas, fmtBoasVindasBeta,
  fmtNomeInvalido, fmtNomeNecessarioAntes,
  fmtNomeSalvo,
  obterNomeExibicaoUsuario,
} from "./formatters.js"
import {
  isCancelamentoTotal, isComandoPrioritarioSistema,
  normalizarNomeUsuario, parseComandoBeta,
  parseComandoAlterarNome, parseSaudacao,
} from "./validators.js"
import { iniciarScheduler }                                  from "./scheduler.js"
import { iniciarPainel }                                     from "./web/painel.js"
import { verificarRateLimit }                                from "./rateLimiter.js"
import {
  atualizarStatusBot,
  registrarMensagemIgnorada,
  registrarMensagemProcessada,
} from "./runtimeState.js"
import {
  normalizarMensagemRecebida,
  sendMenuMessage,
} from "./interactiveMessages.js"
import { temPendenciaAcaoUsuario } from "./pendingEdits.js"
import { temAvaliacaoBetaPendente } from "./pendingBeta.js"

// ── Estado global ──────────────────────────────────────────────────────────────
let tentativas   = 0
let reconectando = false
export const statusBot = { conectado: false, desde: null, tentativas: 0 }

function calcularDelay(t) {
  const base = Math.min(
    config.reconexao.delayInicial * Math.pow(config.reconexao.fator, t),
    config.reconexao.delayMaximo
  )
  return Math.round(base * (0.8 + Math.random() * 0.4))
}

export function isJidGrupo(jid) {
  return String(jid ?? "").endsWith("@g.us")
}

function isJidLid(jid) {
  return String(jid ?? "").toLowerCase().includes("@lid")
}

function valorDebugBeta(valor) {
  if (config.beta?.debugMostrarRaw) return String(valor ?? "")
  return mascararIdentificadorBeta(valor)
}

function numeroDebugBeta(valor) {
  if (config.beta?.debugMostrarRaw) return String(valor ?? "")
  return mascararNumeroBeta(valor)
}

function logBetaDebug(dados) {
  if (!config.beta?.debug) return

  const whitelistNumeros = (config.beta?.numerosAutorizados ?? [])
    .flatMap(gerarVariantesNumeroBrasil)
    .map(numeroDebugBeta)
  const whitelistJids = (config.beta?.jidsAutorizados ?? [])
    .map(valorDebugBeta)
  const whitelistGrupos = (config.beta?.gruposAutorizados ?? [])
    .map(valorDebugBeta)

  logger.info({
    privado: !dados.grupo,
    grupo: dados.grupo,
    fromMe: dados.fromMe,
    remoteJid: valorDebugBeta(dados.remoteJid),
    group: valorDebugBeta(dados.group),
    participant: valorDebugBeta(dados.participant),
    sender: valorDebugBeta(dados.sender),
    origem: dados.origem,
    numeroNormalizado: numeroDebugBeta(dados.numeroNormalizado),
    variantes: (dados.variantes ?? []).map(numeroDebugBeta),
    whitelist: [...new Set([...whitelistNumeros, ...whitelistJids])],
    gruposAutorizados: [...new Set(whitelistGrupos)],
    grupoAutorizado: dados.grupoAutorizado,
    participanteAutorizado: dados.participanteAutorizado,
    autorizado: dados.autorizado,
    via: dados.via,
    acao: dados.acao,
  }, "[BETA_DEBUG]")
}

export function extrairIdentificadorRemetente(msg) {
  const remoteJid = msg?.key?.remoteJid ?? ""
  const grupo = isJidGrupo(remoteJid)

  const candidatos = grupo
    ? [
        { origem: "key.participant", valor: msg?.key?.participant },
        { origem: "participant", valor: msg?.participant },
        { origem: "message.participant", valor: msg?.message?.participant },
      ].filter(c => c.valor)
    : [
        { origem: "remoteJid", valor: msg?.key?.remoteJid },
        { origem: "key.participant", valor: msg?.key?.participant },
        { origem: "participant", valor: msg?.participant },
        { origem: "message.participant", valor: msg?.message?.participant },
      ].filter(c => c.valor)

  const comTelefoneNaoLid = candidatos.find(c =>
    normalizarNumeroWhatsApp(c.valor).length >= 10 && !isJidLid(c.valor)
  )
  const comLid = candidatos.find(c =>
    isJidLid(c.valor) && normalizarJidBeta(c.valor)
  )
  const comTelefone = candidatos.find(c =>
    normalizarNumeroWhatsApp(c.valor).length >= 10
  )
  const comJid = candidatos.find(c => normalizarJidBeta(c.valor))
  const escolhido = comTelefoneNaoLid ?? comLid ?? comTelefone ?? comJid

  if (!escolhido) {
    return { origem: "", identificador: "", numero: "", jid: "", variantes: [] }
  }

  const numero = normalizarNumeroWhatsApp(escolhido.valor)
  const jid = normalizarJidBeta(escolhido.valor)
  const variantes = gerarVariantesNumeroBrasil(escolhido.valor)

  return {
    origem: escolhido.origem,
    identificador: isJidLid(escolhido.valor) ? jid : (numero || jid),
    numero,
    jid,
    variantes,
    bruto: escolhido.valor,
  }
}

export function extrairUsuarioIdMensagem(msg) {
  return extrairIdentificadorRemetente(msg).identificador
}

// ── Boot ───────────────────────────────────────────────────────────────────────
export async function iniciarBot() {
  if (reconectando) return
  reconectando = true
  atualizarStatusBot("conectando")

  const { state, saveCreds } = await useMultiFileAuthState(config.authPath)
  const { version }          = await fetchLatestBaileysVersion()

  logger.info({ tentativa: tentativas + 1, version: version.join(".") }, "Iniciando conexão")

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger:              pino({ level: "silent" }),
    browser:             ["Ubuntu", "Chrome", "124.0.6367.82"],
    keepAliveIntervalMs: 30_000,
    syncFullHistory:     false,
    shouldIgnoreJid:     (jid) => isJidBroadcast(jid),
    getMessage:          async () => ({ conversation: "" }),
  })

  reconectando = false

  sock.ev.on("creds.update", saveCreds)

  // ── Conexão ──────────────────────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      console.log("\n📱 Escaneie o QR Code:\n")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      tentativas            = 0
      statusBot.conectado   = true
      statusBot.desde       = new Date().toISOString()
      statusBot.tentativas  = 0
      atualizarStatusBot("conectado", { em: statusBot.desde })
      logger.info("✅ Bot conectado!")
      iniciarScheduler(sock)
    }

    if (connection === "close") {
      statusBot.conectado = false
      const code   = lastDisconnect?.error?.output?.statusCode
      const motivo = lastDisconnect?.error?.message ?? "desconhecido"
      atualizarStatusBot("desconectado", { code, erro: motivo })
      logger.warn({ code, motivo }, "Conexão encerrada")

      if (code === DisconnectReason.loggedOut) {
        logger.warn("Sessão expirada — limpando auth para novo QR")
        await fs.remove(config.authPath).catch(() => {})
        await fs.ensureDir(config.authPath)
        tentativas = 0
        return setTimeout(iniciarBot, 3_000)
      }

      if (code === DisconnectReason.badSession) {
        logger.error("Sessão inválida. Remova /auth e reescaneie o QR.")
        return process.exit(1)
      }

      if (tentativas >= config.reconexao.maxTentativas) {
        logger.error("Máximo de tentativas atingido. Encerrando.")
        return process.exit(1)
      }

      const delay = calcularDelay(tentativas)
      tentativas++
      statusBot.tentativas = tentativas
      logger.info({ tentativa: tentativas, delay: `${(delay/1000).toFixed(1)}s` }, "Reconectando...")
      setTimeout(iniciarBot, delay)
    }
  })

  // ── Mensagens ─────────────────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    const msg = messages?.[0]
    if (!msg?.message)  return

    const from = msg.key.remoteJid
    const participant = msg.key.participant || msg.participant

    if (msg.key.fromMe) {
      registrarMensagemIgnorada("fromMe", { remoto: from })
      logBetaDebug({
        grupo: isJidGrupo(from),
        fromMe: true,
        remoteJid: from,
        group: isJidGrupo(from) ? from : undefined,
        participant,
        sender: participant || from,
        acao: "ignorado_fromMe",
      })
      return
    }

    // Ignora mensagens acumuladas offline (> 30s)
    const msgTs = (msg.messageTimestamp ?? 0) * 1000
    if (Date.now() - msgTs > 30_000) return

    const remetente = extrairIdentificadorRemetente(msg)
    const usuarioId = remetente.identificador
    if (!usuarioId) return

    const messageId = msg.key.id

    const mensagem = normalizarMensagemRecebida(msg.message).trim()
    if (!mensagem) return

    try {
      const grupo = isJidGrupo(from)
      const grupoAutorizado = grupoAutorizadoBeta(from)
      if (grupo && !grupoAutorizado) {
        registrarMensagemIgnorada("grupo", { grupo: from })
        logBetaDebug({
          grupo: true,
          grupoAutorizado,
          fromMe: false,
          remoteJid: from,
          group: from,
          participant,
          sender: participant || from,
          acao: "ignorado_grupo_nao_autorizado",
        })
        return
      }

      const autorizado = usuarioAutorizadoBeta(usuarioId)
      const exigeParticipante = Boolean(config.beta?.exigirParticipanteAutorizado)
      const participanteAutorizado = grupo
        ? (!exigeParticipante || autorizado)
        : autorizado

      if (grupo && !participanteAutorizado) {
        registrarMensagemIgnorada("beta", { grupo: from, participante })
        logBetaDebug({
          grupo: true,
          grupoAutorizado,
          participanteAutorizado,
          fromMe: false,
          remoteJid: from,
          group: from,
          participant,
          sender: remetente.bruto,
          origem: remetente.origem,
          numeroNormalizado: remetente.numero,
          variantes: remetente.variantes,
          autorizado,
          acao: "ignorado_participante_nao_autorizado",
        })
        return
      }

      if (!autorizado && (!grupo || exigeParticipante)) {
        registrarMensagemIgnorada("beta", { remetente: remetente.bruto, grupo: grupo ? from : "" })
        logBetaDebug({
          grupo: false,
          fromMe: false,
          remoteJid: from,
          participant,
          sender: remetente.bruto,
          origem: remetente.origem,
          numeroNormalizado: remetente.numero,
          variantes: remetente.variantes,
          autorizado,
          participanteAutorizado,
          acao: config.beta?.responderBloqueado ? "bloqueado_com_resposta" : "ignorado_beta_silencioso",
        })
        if (config.beta?.responderBloqueado) {
          await enviar(sock, from, fmtBetaFechado())
        }
        return
      }

      logBetaDebug({
        grupo,
        grupoAutorizado,
        participanteAutorizado,
        fromMe: false,
        remoteJid: from,
        group: grupo ? from : undefined,
        participant,
        sender: remetente.bruto,
        origem: remetente.origem,
        numeroNormalizado: remetente.numero,
        variantes: remetente.variantes,
        autorizado,
        via: remetente.jid && config.beta?.jidsAutorizados?.includes(remetente.jid) ? "jid" : "numero",
        acao: "processado",
      })

      // ── Rate limiting ────────────────────────────────────────────────────
      if (!verificarRateLimit(usuarioId)) {
        await enviar(sock, from,
          `⏳ Você está enviando mensagens muito rápido. Aguarde um momento.`)
        return
      }

      // ── Deduplicação ─────────────────────────────────────────────────────
      let usuario = getUsuario(usuarioId)
      const saudacao = parseSaudacao(mensagem)
      const alterarNome = parseComandoAlterarNome(mensagem)
      const comandoPrioritario = isComandoPrioritarioSistema(mensagem)
      const comandoBeta = parseComandoBeta(mensagem)
      const cancelarTudo = isCancelamentoTotal(mensagem)
      if (usuario?.ultimo_msg_id === messageId) return
      if (usuario) atualizarUsuario(usuarioId, { ultimo_msg_id: messageId })

      // ── Novo usuário ──────────────────────────────────────────────────────
      if (!usuario) {
        criarUsuario(usuarioId)

        if (alterarNome || comandoBeta) {
          atualizarUsuario(usuarioId, { ultimo_msg_id: messageId })
          await processarMensagem(sock, from, usuarioId, mensagem, {
            pularBeta: grupo && !exigeParticipante,
          })
          return
        }

        if (comandoPrioritario) {
          atualizarUsuario(usuarioId, { aguardando_nome: 1, ultimo_msg_id: messageId })
          await enviar(sock, from, fmtNomeNecessarioAntes())
          return
        }

        const nomeInicial = normalizarNomeUsuario(mensagem)
        if (nomeInicial) {
          atualizarUsuario(usuarioId, {
            nome: nomeInicial,
            aguardando_nome: 0,
            ultimo_msg_id: messageId,
          })
          await enviar(sock, from, fmtNomeSalvo(nomeInicial))
          return
        }

        atualizarUsuario(usuarioId, { aguardando_nome: 1, ultimo_msg_id: messageId })
        await enviar(sock, from,
          config.beta?.ativo ? fmtBoasVindasBeta() : fmtBoasVindas())
        return
      }

      // Pendências de avaliação/reset/edição têm prioridade sobre outros fluxos.
      if (temAvaliacaoBetaPendente(usuarioId) || temPendenciaAcaoUsuario(usuarioId)) {
        logMensagem(usuarioId, mensagem.split(" ")[0])
        registrarMensagemProcessada({ usuarioId, origem: grupo ? "grupo" : "privado" })
        await processarMensagem(sock, from, usuarioId, mensagem, {
          pularBeta: grupo && !exigeParticipante,
        })
        return
      }

      // Comandos de segurança e edição chegam ao dispatcher antes da caixinha.
      if (!usuario.aguardando_nome && comandoPrioritario) {
        logMensagem(usuarioId, mensagem.split(" ")[0])
        registrarMensagemProcessada({ usuarioId, origem: grupo ? "grupo" : "privado" })
        await processarMensagem(sock, from, usuarioId, mensagem, {
          pularBeta: grupo && !exigeParticipante,
        })
        return
      }

      // ── Aguardando nome ───────────────────────────────────────────────────
      if (usuario.aguardando_nome) {
        if (alterarNome || cancelarTudo || comandoBeta) {
          await processarMensagem(sock, from, usuarioId, mensagem, {
            pularBeta: grupo && !exigeParticipante,
          })
          return
        }

        if (comandoPrioritario) {
          await enviar(sock, from, fmtNomeNecessarioAntes())
          return
        }

        const nome = normalizarNomeUsuario(mensagem)
        if (nome) {
          atualizarUsuario(usuarioId, { nome, aguardando_nome: 0 })
          await enviar(sock, from, fmtNomeSalvo(nome))
          return
        }

        await enviar(sock, from, fmtNomeInvalido())
        return
      }

      // ── Limpar estado expirado ────────────────────────────────────────────
      limparEstadoExpirado(usuarioId)
      usuario = getUsuario(usuarioId)

      if (saudacao) {
        const nome = obterNomeExibicaoUsuario(usuario)
        if (nome) {
          await sendMenuMessage(sock, from, usuarioId, {
            contexto: "principal",
            nome,
          })
        } else {
          atualizarUsuario(usuarioId, { aguardando_nome: 1 })
          await enviar(sock, from,
            config.beta?.ativo ? fmtBoasVindasBeta() : fmtBoasVindas())
        }
        return
      }

      // ── Fluxo da caixinha ─────────────────────────────────────────────────
      if (usuario.aguardando_caixinha) {
        await handleRespostaCaixinha(sock, from, usuarioId, usuario.nome, mensagem)
        return
      }

      // ── Comandos e lançamentos ────────────────────────────────────────────
      logMensagem(usuarioId, mensagem.split(" ")[0])
      registrarMensagemProcessada({ usuarioId, origem: grupo ? "grupo" : "privado" })
      await processarMensagem(sock, from, usuarioId, mensagem, {
        pularBeta: grupo && !exigeParticipante,
      })

    } catch (err) {
      atualizarStatusBot(statusBot.conectado ? "conectado" : "desconectado", { erro: err.message })
      logger.error({ err: err.message, usuarioId: mascararNumeroBeta(usuarioId) }, "Erro ao processar mensagem")
    }
  })
}

// ── Inicia painel web (independente da conexão WA) ────────────────────────────
iniciarPainel(statusBot)
