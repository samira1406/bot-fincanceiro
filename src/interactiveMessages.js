import { config } from "./config.js"
import { logger } from "./logger.js"
import {
  fmtFallbackMenuInterativo,
  fmtMenuMetasTexto,
  fmtMenuPrincipalTexto,
} from "./formatters.js"

const menusPendentes = new Map()

export const OPCOES_MENU_PRINCIPAL = [
  { id: "iniciar_gasto", titulo: "Registrar gasto", descricao: "Anotar uma nova despesa" },
  { id: "iniciar_entrada", titulo: "Registrar entrada", descricao: "Anotar uma nova receita" },
  { id: "resumo", titulo: "Ver resumo", descricao: "Entradas, gastos e saldo do mês" },
  { id: "historico", titulo: "Ver histórico", descricao: "Consultar os últimos lançamentos" },
  { id: "exportar_planilha", titulo: "Exportar planilha", descricao: "Gerar o arquivo Excel do mês" },
  { id: "menu_metas", titulo: "Metas", descricao: "Criar ou consultar metas" },
  { id: "ajuda", titulo: "Ajuda completa", descricao: "Ver todos os comandos e exemplos" },
]

export const OPCOES_MENU_METAS = [
  { id: "iniciar_meta", titulo: "Criar meta", descricao: "Exemplo: meta mercado 600" },
  { id: "ver_metas", titulo: "Ver metas", descricao: "Consultar metas deste mês" },
  { id: "voltar_menu", titulo: "Voltar ao menu", descricao: "Abrir o menu principal" },
]

const MAPA_ACOES = new Map([
  ["iniciar_gasto", "iniciar_gasto"],
  ["registrar gasto", "iniciar_gasto"],
  ["iniciar_entrada", "iniciar_entrada"],
  ["registrar entrada", "iniciar_entrada"],
  ["resumo", "resumo"],
  ["ver resumo", "resumo"],
  ["historico", "historico"],
  ["ver historico", "historico"],
  ["exportar_planilha", "planilha"],
  ["exportar planilha", "planilha"],
  ["menu_metas", "menu_metas"],
  ["metas", "menu_metas"],
  ["ajuda", "ajuda completa"],
  ["ajuda completa", "ajuda completa"],
  ["iniciar_meta", "iniciar_meta"],
  ["criar meta", "iniciar_meta"],
  ["ver_metas", "metas"],
  ["ver metas", "metas"],
  ["voltar_menu", "menu"],
  ["voltar ao menu", "menu"],
])

function normalizarChave(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function menuExpirou(menu, agora = Date.now()) {
  const limite = Number(config.timeoutEstadoMs) || 600_000
  return agora - menu.atualizadoEm > limite
}

export function iniciarMenuPendente(usuarioId, contexto = "principal") {
  const agora = Date.now()
  const menu = { contexto, criadoEm: agora, atualizadoEm: agora }
  menusPendentes.set(String(usuarioId), menu)
  return { ...menu }
}

export function obterMenuPendente(usuarioId) {
  const chave = String(usuarioId)
  const menu = menusPendentes.get(chave)
  if (!menu) return null

  if (menuExpirou(menu)) {
    menusPendentes.delete(chave)
    return null
  }

  return { ...menu }
}

export function limparMenuPendente(usuarioId) {
  return menusPendentes.delete(String(usuarioId))
}

export function resetMenusPendentesParaTestes() {
  menusPendentes.clear()
}

export function mapearAcaoInterativa(valor) {
  const chave = normalizarChave(valor)
  return MAPA_ACOES.get(chave) ?? null
}

function primeiroTexto(...valores) {
  return valores.find(valor => typeof valor === "string" && valor.trim())?.trim() ?? ""
}

function lerJsonSeguro(valor) {
  if (!valor || typeof valor !== "string") return null
  try {
    return JSON.parse(valor)
  } catch {
    return null
  }
}

function encontrarValorJson(objeto) {
  if (!objeto || typeof objeto !== "object") return ""

  const direto = primeiroTexto(
    objeto.id,
    objeto.row_id,
    objeto.rowId,
    objeto.selected_id,
    objeto.selectedId,
    objeto.selected_row_id,
    objeto.selectedRowId,
    objeto.title,
    objeto.display_text,
    objeto.displayText
  )
  if (direto) return direto

  for (const valor of Object.values(objeto)) {
    if (valor && typeof valor === "object") {
      const encontrado = encontrarValorJson(valor)
      if (encontrado) return encontrado
    }
  }
  return ""
}

function desembrulharMensagem(message) {
  let atual = message
  for (let i = 0; i < 5; i++) {
    const proxima =
      atual?.ephemeralMessage?.message ||
      atual?.viewOnceMessage?.message ||
      atual?.viewOnceMessageV2?.message ||
      atual?.documentWithCaptionMessage?.message
    if (!proxima) break
    atual = proxima
  }
  return atual ?? {}
}

/**
 * Extrai o id ou título de respostas interativas conhecidas do Baileys.
 * @param {object} message
 * @returns {string}
 */
export function extrairRespostaInterativa(message) {
  const conteudo = desembrulharMensagem(message)
  const botao = conteudo.buttonsResponseMessage ?? conteudo.buttonResponseMessage
  const template = conteudo.templateButtonReplyMessage
  const lista = conteudo.listResponseMessage
  const interativa = conteudo.interactiveResponseMessage
  const params = lerJsonSeguro(interativa?.nativeFlowResponseMessage?.paramsJson)

  return primeiroTexto(
    botao?.selectedButtonId,
    botao?.selectedDisplayText,
    template?.selectedId,
    template?.selectedDisplayText,
    lista?.singleSelectReply?.selectedRowId,
    lista?.title,
    lista?.description,
    encontrarValorJson(params),
    interativa?.body?.text
  )
}

/**
 * Normaliza texto comum ou clique interativo para o dispatcher do bot.
 * @param {object} message
 * @returns {string}
 */
export function normalizarMensagemRecebida(message) {
  const conteudo = desembrulharMensagem(message)
  const respostaInterativa = extrairRespostaInterativa(conteudo)
  if (respostaInterativa) {
    return mapearAcaoInterativa(respostaInterativa) ?? respostaInterativa
  }

  return primeiroTexto(
    conteudo.conversation,
    conteudo.extendedTextMessage?.text
  )
}

function montarListaInterativa(contexto, nome) {
  const principal = contexto !== "metas"
  const opcoes = principal ? OPCOES_MENU_PRINCIPAL : OPCOES_MENU_METAS
  const saudacao = nome ? `Oi, ${nome}! ` : ""

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: {
          header: {
            title: principal ? "💰 Bot Finanças" : "🎯 Metas",
            hasMediaAttachment: false,
          },
          body: {
            text: principal
              ? `${saudacao}Escolha uma opção para continuar:`
              : "Escolha uma opção de metas:",
          },
          footer: {
            text: principal
              ? "Você também pode responder com um número de 1 a 7."
              : "Você também pode responder com 1, 2 ou 3.",
          },
          nativeFlowMessage: {
            messageVersion: 3,
            buttons: [{
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: principal ? "Abrir menu" : "Abrir opções",
                sections: [{
                  title: principal ? "Menu principal" : "Metas",
                  rows: opcoes.map(opcao => ({
                    id: opcao.id,
                    title: opcao.titulo,
                    description: opcao.descricao,
                  })),
                }],
              }),
            }],
          },
        },
      },
    },
  }
}

function obterModoMenu(modoSolicitado) {
  if (["text", "interactive", "auto"].includes(modoSolicitado)) {
    return modoSolicitado
  }
  if (["text", "interactive", "auto"].includes(config.whatsappMenuMode)) {
    return config.whatsappMenuMode
  }
  return config.whatsappInteractiveEnabled ? "interactive" : "text"
}

/**
 * Envia menu interativo quando habilitado e usa fallback textual em qualquer falha.
 * @param {object} sock
 * @param {string} jid
 * @param {string} usuarioId
 * @param {{ contexto?:"principal"|"metas", nome?:string|null, modo?:"text"|"interactive"|"auto" }} [opcoes]
 * @returns {Promise<{ interativo:boolean, fallback:boolean }>}
 */
export async function sendMenuMessage(sock, jid, usuarioId, opcoes = {}) {
  const contexto = opcoes.contexto === "metas" ? "metas" : "principal"
  const modo = obterModoMenu(opcoes.modo)
  iniciarMenuPendente(usuarioId, contexto)

  if (modo !== "text" && typeof sock?.relayMessage === "function") {
    try {
      await sock.relayMessage(jid, montarListaInterativa(contexto, opcoes.nome), {})

      if (modo === "auto") {
        const texto = contexto === "metas"
          ? fmtMenuMetasTexto()
          : fmtMenuPrincipalTexto(opcoes.nome)
        await sock.sendMessage(jid, { text: texto })
        return { interativo: true, fallback: true }
      }

      await sock.sendMessage(jid, { text: fmtFallbackMenuInterativo() })
      return { interativo: true, fallback: false }
    } catch (err) {
      logger.warn(
        { err: err.message, contexto, modo },
        "Falha ao enviar menu interativo; usando fallback textual"
      )
    }
  }

  const texto = contexto === "metas"
    ? fmtMenuMetasTexto()
    : fmtMenuPrincipalTexto(opcoes.nome)
  await sock.sendMessage(jid, { text: texto })
  return { interativo: false, fallback: true }
}
