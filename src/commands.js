/**
 * @fileoverview Handlers de todos os comandos do bot.
 * Dispatcher baseado em Map — sem if/else em cadeia.
 */

import { config, usuarioAutorizadoBeta } from "./config.js"
import { logger }        from "./logger.js"
import {
  getUsuario, atualizarUsuario, inserirLancamento,
  getLancamentosPorMes, getGastosPorCategoria,
  getUltimosLancamentos, getUltimoLancamento, getLancamentoDoUsuario,
  atualizarLancamentoDoUsuario, atualizarValorLancamento,
  deletarLancamentoDoUsuario, deletarLancamentosDesde,
  limparDadosFinanceirosUsuario, temDadosExemploRecentes,
  getTodosUsuarios, getSomaPorTipo, definirMeta, getMeta,
  criarOuAtualizarMetaCategoria, listarMetasCategoria, buscarMetaCategoria,
  calcularGastoCategoriaNoPeriodo,
  mesAtual, db,
} from "./database.js"
import {
  gerarCSVLancamentos, gerarXlsxFinanceiro,
  salvarCSVExportacao, salvarXlsxExportacao, XLSX_MIMETYPE,
} from "./exporters.js"
import {
  fmtValor, fmtLista, fmtRelatorioMensal, fmtRelatorioGeral,
  fmtCategorias, fmtSaldo, fmtBarraMeta, fmtHistoricoLancamentos,
  fmtAjuda, fmtBetaFechado, fmtMensagemNaoEntendida,
  fmtExemplosRapidos, formatarMensagemNaoEntendida,
  fmtTituloResumo, obterNomeExibicaoUsuario,
  fmtCategoriaPendente, fmtPendenciaCancelada, fmtValorAmbiguo,
  fmtOrientacaoEntrada, fmtOrientacaoGasto, fmtOrientacaoMeta,
  fmtTipoLancamento, fmtCategoriaAmigavel,
  fmtConfirmacaoDespesa, fmtConfirmacaoReceita,
  fmtMetaCategoriaCriada, fmtMetaCategoriaAtualizada,
  fmtListaMetasCategoria, fmtProgressoMetaCategoria,
  fmtMetaCategoriaUltrapassada,
  fmtConfirmacaoExclusaoLancamento, fmtDataLancamentoEdicao,
  fmtListaLancamentosEdicao, fmtMenuEdicaoLancamento,
  fmtResumoLancamentoEdicao,
  fmtCancelamentoTotal, fmtComandoBloqueadoPorPendencia,
  fmtNomeAtualizado,
} from "./formatters.js"
import {
  classificarMensagemDesconhecida,
  parseAcaoLancamento, parseAjuda, parseCategoriaLancamentoEdicao,
  parseComandoAlterarNome, parseComandoDadosExemplo, parseComandoResetUsuario,
  parseCorrecaoUltimo, parseDataLancamento, parseDescricaoLancamentoEdicao,
  parseExportacao, parseLancamento,
  isCancelamentoPendencia, isCancelamentoTotal, parseCategoriaLancamentoPendente,
  parseMetaCategoria, parseTipoLancamentoPendente,
  parseValorAmbiguo, parseValorSimples,
} from "./validators.js"
import {
  iniciarPendenciaLancamento, limparPendenciaLancamento,
  obterPendenciaLancamento, selecionarTipoPendencia,
} from "./pendingLancamentos.js"
import {
  limparMenuPendente, obterMenuPendente, sendMenuMessage,
} from "./interactiveMessages.js"
import { registrarEvento, registrarFallbackAcionado } from "./runtimeState.js"
import {
  atualizarPendenciaEdicao,
  iniciarPendenciaDemo, iniciarPendenciaEdicao,
  iniciarPendenciaExclusao, iniciarPendenciaReset,
  limparPendenciaDemo, limparPendenciaEdicao,
  limparPendenciaExclusao, limparPendenciaReset,
  limparPendenciasAcoesUsuario,
  obterPendenciaDemo, obterPendenciaEdicao,
  obterPendenciaExclusao, obterPendenciaReset,
} from "./pendingEdits.js"
import { criarDadosExemploUsuario } from "./testData.js"
import {
  executarConsultaFinanceira,
  formatarRespostaConsulta,
  parseConsultaFinanceira,
} from "./financeQueries.js"
import {
  formatarFechamentoMensal,
  gerarFechamentoMensal,
} from "./insights.js"

// ── Envio seguro ──────────────────────────────────────────────────────────────

/**
 * Envia uma mensagem de texto ao JID com tratamento de erro.
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 */
export async function enviar(sock, jid, text) {
  try {
    await sock.sendMessage(jid, { text })
  } catch (err) {
    logger.error({ err: err.message, jid }, "Falha ao enviar mensagem")
  }
}

/**
 * Envia um documento (arquivo) ao JID.
 * @param {object} sock
 * @param {string} jid
 * @param {Buffer} buffer
 * @param {string} nomeArquivo
 * @param {string} mimetype
 */
async function enviarDocumento(sock, jid, buffer, nomeArquivo, mimetype) {
  try {
    await sock.sendMessage(jid, {
      document: buffer,
      fileName: nomeArquivo,
      mimetype,
    })
  } catch (err) {
    logger.error({ err: err.message }, "Falha ao enviar documento")
  }
}

// ── Helpers de data ───────────────────────────────────────────────────────────
const inicioDoDia    = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() }
const inicioDaSemana = () => { const d = new Date(); const dia = d.getDay(); d.setDate(d.getDate()-(dia===0?6:dia-1)); d.setHours(0,0,0,0); return d.getTime() }
const inicioDoMes    = () => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime() }
const periodoAtual   = () => { const d = new Date(); return { mes: d.getMonth() + 1, ano: d.getFullYear() } }

// ── Alerta de meta ────────────────────────────────────────────────────────────

/**
 * Envia alerta de meta após cada gasto, se necessário.
 * @param {object} sock
 * @param {string} from
 * @param {string} usuarioId
 * @param {string} nome
 * @param {number} novoGasto  valor do gasto recém-registrado
 */
async function verificarMeta(sock, from, usuarioId, nome, novoGasto) {
  const meta = getMeta(usuarioId)
  if (!meta) return

  const mes      = mesAtual()
  const totalG   = getSomaPorTipo(usuarioId, "gasto", mes)
  const anterior = totalG - novoGasto
  const pct      = (totalG / meta) * 100
  const pctAnt   = (anterior / meta) * 100

  // Alerta de ultrapassagem (só uma vez — quando cruza 100%)
  if (pct >= 100 && pctAnt < 100) {
    await enviar(sock, from,
      `🔴 *${nome}*, você ultrapassou sua meta mensal!\n` +
      `Meta: R$ ${fmtValor(meta)} | Gasto total: R$ ${fmtValor(totalG)}\n` +
      `Excesso: R$ ${fmtValor(totalG - meta)}`)
    return
  }

  // Alerta de 80% (só uma vez)
  if (pct >= 80 && pctAnt < 80) {
    await enviar(sock, from,
      `🟡 *${nome}*, você já usou *${Math.round(pct)}%* da sua meta mensal.\n` +
      `${fmtBarraMeta(totalG, meta)}\n` +
      `Restam R$ ${fmtValor(meta - totalG)} para atingir o limite.`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleComandos(sock, from) {
  await enviar(sock, from, fmtAjuda())
}

async function handleMenuPrincipal(sock, from, usuarioId, nome, modo) {
  await sendMenuMessage(sock, from, usuarioId, {
    contexto: "principal",
    nome: obterNomeExibicaoUsuario(nome),
    modo,
  })
}

async function handleMenuMetas(sock, from, usuarioId) {
  await sendMenuMessage(sock, from, usuarioId, { contexto: "metas" })
}

async function handleRespostaMenuPendente(sock, from, usuarioId, menu, numero, handlers) {
  const acoesPrincipal = {
    "1": handlers.iniciarGasto,
    "2": handlers.iniciarEntrada,
    "3": handlers.resumo,
    "4": handlers.historico,
    "5": handlers.planilha,
    "6": handlers.menuMetas,
    "7": handlers.ajudaCompleta,
  }
  const acoesMetas = {
    "1": handlers.iniciarMeta,
    "2": handlers.verMetas,
    "3": handlers.menuPrincipal,
  }
  const acao = (menu.contexto === "metas" ? acoesMetas : acoesPrincipal)[numero]
  if (!acao) return false

  limparMenuPendente(usuarioId)
  await acao()
  return true
}

async function handleResumo(sock, from, usuarioId, nome) {
  const mes    = mesAtual()
  const totalE = getSomaPorTipo(usuarioId, "entrada", mes)
  const totalG = getSomaPorTipo(usuarioId, "gasto",   mes)
  const saldo  = totalE - totalG
  const meta   = getMeta(usuarioId)

  let texto =
`${fmtTituloResumo(nome)}

💰 Entradas: R$ ${fmtValor(totalE)}
💸 Gastos:   R$ ${fmtValor(totalG)}
🧾 Saldo:    ${fmtSaldo(saldo)}`

  if (meta) {
    const pct = Math.min(Math.round((totalG / meta) * 100), 100)
    texto += `\n\n🎯 Meta: ${fmtBarraMeta(totalG, meta)} (${pct}% usado)`
  }

  await enviar(sock, from, texto)
}

async function handleRelatorio(sock, from, usuarioId, nome) {
  const mes      = mesAtual()
  const todos    = getLancamentosPorMes(usuarioId, mes)
  const entradas = todos.filter(l => l.tipo === "entrada")
  const gastos   = todos.filter(l => l.tipo === "gasto")
  const meta     = getMeta(usuarioId)

  const { texto, saldo } = fmtRelatorioMensal(nome, entradas, gastos, meta)

  if (saldo > 0) {
    const sugerido = saldo * config.caixinhaPercentual
    const expira   = Date.now() + config.timeoutEstadoMs
    atualizarUsuario(usuarioId, {
      aguardando_caixinha:     1,
      valor_sugerido_caixinha: sugerido,
      estado_expira_em:        expira,
    })
    await enviar(sock, from,
      texto +
      `\n\n🏦 *SOBROU DINHEIRO*\n` +
      `Sobraram R$ ${fmtValor(saldo)} neste mês.\n\n` +
      `Sugestão: guardar ${Math.round(config.caixinhaPercentual * 100)}% na caixinha: *R$ ${fmtValor(sugerido)}*\n\n` +
      `Quer registrar esse valor? Responda *sim* ou *não*.\n` +
      `_(expira em ${config.timeoutEstadoMs / 60_000} min)_`)
  } else {
    await enviar(sock, from, texto)
  }
}

async function handleRelatorioGeral(sock, from) {
  const mes    = mesAtual()
  const todos  = getTodosUsuarios()
  const dados  = todos.map(u => ({
    nome:   u.nome,
    totalE: getSomaPorTipo(u.id, "entrada", mes),
    totalG: getSomaPorTipo(u.id, "gasto",   mes),
  }))
  const { resumo, ranking } = fmtRelatorioGeral(dados)
  await enviar(sock, from, resumo)
  await enviar(sock, from, ranking)
}

async function handleCategorias(sock, from, usuarioId, nome) {
  const mes    = mesAtual()
  const grupos = getGastosPorCategoria(usuarioId, mes)
  const totalG = grupos.reduce((s, g) => s + g.total, 0)
  await enviar(sock, from,
`📂 *GASTOS POR CATEGORIA — ${nome.toUpperCase()}*

${fmtCategorias(grupos)}

Total: R$ ${fmtValor(totalG)}`)
}

async function handleHistorico(sock, from, usuarioId, nome) {
  const lancamentos = getUltimosLancamentos(usuarioId, 5)
  await enviar(sock, from, fmtHistoricoLancamentos(lancamentos))
}

async function handleExportar(sock, from, usuarioId, nome) {
  const mes = mesAtual()
  const lancamentos = getLancamentosPorMes(usuarioId, mes)

  if (!lancamentos.length) {
    await enviar(sock, from,
      "Você ainda não tem lançamentos para exportar.\nMande algo como: gastei 35 no mercado")
    return
  }

  const csv = gerarCSVLancamentos(lancamentos)
  const { nomeArquivo } = salvarCSVExportacao({ usuarioId, mes, csv })
  const buf = Buffer.from(csv, "utf8")
  await enviarDocumento(sock, from, buf, nomeArquivo, "text/csv")
  await enviar(sock, from,
    `Sua planilha foi gerada com sucesso.\nEla contém seus lançamentos deste mês.`)
}

async function handleExportarXlsx(sock, from, usuarioId, nome) {
  const mes = mesAtual()
  const lancamentos = getLancamentosPorMes(usuarioId, mes)

  if (!lancamentos.length) {
    await enviar(sock, from,
      "Você ainda não tem lançamentos para exportar.\nMande algo como: gastei 35 no mercado")
    return
  }

  const { mes: mesNumero, ano } = periodoAtual()
  const metas = listarMetasCategoria(usuarioId, mesNumero, ano).map(meta => ({
    ...meta,
    gasto: calcularGastoCategoriaNoPeriodo(usuarioId, meta.categoria, mesNumero, ano),
  }))

  const usuario = getUsuario(usuarioId)
  const buffer = await gerarXlsxFinanceiro({ usuario, usuarioId, mes, lancamentos, metas })
  const { nomeArquivo } = salvarXlsxExportacao({
    usuarioId,
    nomeUsuario: usuario?.nome ?? nome,
    mes,
    buffer,
  })

  await enviarDocumento(sock, from, buffer, nomeArquivo, XLSX_MIMETYPE)
  await enviar(sock, from,
    "Sua planilha Excel foi gerada com sucesso.\nEla contém seus lançamentos e um resumo do mês.")
}

async function handleMeta(sock, from, usuarioId, nome, partes) {
  if (partes[1] === "ver") {
    const meta = getMeta(usuarioId)
    if (!meta) {
      await enviar(sock, from,
        `📭 *${nome}*, você não tem meta definida.\n❓ Use: *meta 3000*`)
      return
    }
    const mes    = mesAtual()
    const totalG = getSomaPorTipo(usuarioId, "gasto", mes)
    const pct    = Math.min(Math.round((totalG / meta) * 100), 100)
    await enviar(sock, from,
`🎯 *META DO MÊS — ${nome.toUpperCase()}*

Meta: R$ ${fmtValor(meta)}
Gasto: R$ ${fmtValor(totalG)}
${fmtBarraMeta(totalG, meta)} ${pct}%
Restante: R$ ${fmtValor(Math.max(meta - totalG, 0))}`)
    return
  }

  const valor = parseValorSimples(partes[1] ?? "")
  if (!valor) {
    await enviar(sock, from, `❌ Valor inválido.\n✅ Use: *meta 3000* ou *meta 1500,50*`)
    return
  }
  definirMeta(usuarioId, valor)
  await enviar(sock, from, `🎯 *${nome}*, meta definida: *R$ ${fmtValor(valor)}* para este mês.`)
}

async function handleCriarMetaCategoria(sock, from, usuarioId, resultado) {
  if (resultado.erro === "valor") {
    await enviar(sock, from,
      "Não consegui identificar o valor da meta.\nTente assim: meta mercado 600")
    return
  }

  if (resultado.erro === "categoria") {
    await enviar(sock, from,
      "Não consegui identificar a categoria da meta.\nTente assim: meta mercado 600")
    return
  }

  const { mes, ano } = periodoAtual()
  const { criada, meta } = criarOuAtualizarMetaCategoria(
    usuarioId,
    resultado.categoria,
    resultado.valor,
    mes,
    ano
  )

  await enviar(sock, from, criada
    ? fmtMetaCategoriaCriada(meta)
    : fmtMetaCategoriaAtualizada(meta))
}

async function handleListarMetasCategoria(sock, from, usuarioId) {
  const { mes, ano } = periodoAtual()
  const metas = listarMetasCategoria(usuarioId, mes, ano).map(meta => ({
    ...meta,
    gasto: calcularGastoCategoriaNoPeriodo(usuarioId, meta.categoria, mes, ano),
  }))
  await enviar(sock, from, fmtListaMetasCategoria(metas))
}

async function handleConsultaFinanceira(sock, from, usuarioId, consulta) {
  const resultado = executarConsultaFinanceira(db, usuarioId, consulta)
  await enviar(sock, from, formatarRespostaConsulta(resultado))
}

async function handleFechamentoMensal(sock, from, usuarioId) {
  const agora = new Date()
  const lancamentos = getLancamentosPorMes(usuarioId, mesAtual())
  const metas = listarMetasCategoria(
    usuarioId,
    agora.getMonth() + 1,
    agora.getFullYear()
  )
  const fechamento = gerarFechamentoMensal({ lancamentos, metas, agora })
  await enviar(sock, from, formatarFechamentoMensal(fechamento))
}

function normalizarRespostaFluxo(mensagem) {
  return String(mensagem ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function obterItemRecentePorIndice(usuarioId, indice) {
  const itens = getUltimosLancamentos(usuarioId, 5)
  return {
    itens,
    selecionado: Number.isInteger(indice) && indice >= 1
      ? itens[indice - 1] ?? null
      : null,
  }
}

async function iniciarConfirmacaoExclusao(sock, from, usuarioId, lancamento) {
  iniciarPendenciaExclusao(usuarioId, {
    lancamentoId: lancamento.id,
    snapshotBefore: lancamento,
  })
  await enviar(sock, from, fmtConfirmacaoExclusaoLancamento(lancamento))
}

async function handleIniciarEdicaoUltimo(sock, from, usuarioId) {
  const ultimo = getUltimoLancamento(usuarioId)
  if (!ultimo) {
    await enviar(sock, from, "Não encontrei nenhum lançamento para editar.")
    return
  }

  iniciarPendenciaEdicao(usuarioId, {
    etapa: "escolher_acao",
    lancamentoId: ultimo.id,
    snapshotBefore: ultimo,
  })
  await enviar(sock, from,
    `Encontrei seu último lançamento:\n` +
    `1. ${fmtResumoLancamentoEdicao(ultimo)}\n\n` +
    `O que você quer corrigir?\n` +
    `1 - Valor\n` +
    `2 - Categoria\n` +
    `3 - Tipo\n` +
    `4 - Descrição\n` +
    `5 - Data\n` +
    `6 - Excluir\n` +
    `7 - Cancelar`)
}

async function handleIniciarEdicaoLista(sock, from, usuarioId, modo = "editar") {
  const itens = getUltimosLancamentos(usuarioId, 5)
  if (!itens.length) {
    await enviar(sock, from, "Você ainda não tem lançamentos para editar.")
    return
  }

  iniciarPendenciaEdicao(usuarioId, {
    etapa: "escolher_item",
    modo,
    itens: itens.map(item => item.id),
  })
  await enviar(sock, from, fmtListaLancamentosEdicao(itens, modo))
}

async function handleIniciarExclusaoUltimo(sock, from, usuarioId) {
  const ultimo = getUltimoLancamento(usuarioId)
  if (!ultimo) {
    await enviar(sock, from, "Você ainda não tem lançamentos para excluir.")
    return
  }
  await iniciarConfirmacaoExclusao(sock, from, usuarioId, ultimo)
}

async function handleIniciarExclusaoIndice(sock, from, usuarioId, indice) {
  if (!indice) {
    await handleIniciarEdicaoLista(sock, from, usuarioId, "excluir")
    return
  }

  const { itens, selecionado } = obterItemRecentePorIndice(usuarioId, indice)
  if (!selecionado) {
    await enviar(sock, from, itens.length
      ? `Escolha um número entre 1 e ${itens.length}.`
      : "Você ainda não tem lançamentos para excluir.")
    return
  }

  await iniciarConfirmacaoExclusao(sock, from, usuarioId, selecionado)
}

function prepararCampoEdicao(campo, valorBruto, lancamento) {
  if (campo === "valor") {
    const valor = typeof valorBruto === "number"
      ? valorBruto
      : parseValorSimples(valorBruto)
    return valor ? { campos: { valor }, valor } : null
  }

  if (campo === "categoria") {
    const categoria = parseCategoriaLancamentoEdicao(valorBruto, lancamento.tipo)
    return categoria ? { campos: { categoria }, categoria } : null
  }

  if (campo === "tipo") {
    const tipo = parseTipoLancamentoPendente(valorBruto)
    return tipo ? { campos: { tipo }, tipo } : null
  }

  if (campo === "descricao") {
    const nome = parseDescricaoLancamentoEdicao(valorBruto)
    return nome ? { campos: { nome }, nome } : null
  }

  if (campo === "data") {
    const data = parseDataLancamento(valorBruto)
    return data ? { campos: { criadoEm: data.criadoEm }, data } : null
  }

  return null
}

function formatarResultadoEdicao(campo, preparado, atualizado, anterior) {
  if (campo === "valor") {
    return `Valor atualizado para R$ ${fmtValor(preparado.valor)}.\n\n` +
      `Antes: R$ ${fmtValor(anterior.valor)}\n` +
      `Agora: R$ ${fmtValor(preparado.valor)}`
  }
  if (campo === "categoria") {
    return `Categoria atualizada para ${fmtCategoriaAmigavel(atualizado.categoria)}.`
  }
  if (campo === "tipo") {
    return `Tipo atualizado para ${atualizado.tipo === "entrada" ? "Entrada" : "Gasto"}.`
  }
  if (campo === "descricao") return "Descrição atualizada."
  if (campo === "data") {
    return `Data atualizada para ${fmtDataLancamentoEdicao(atualizado.criado_em)}.`
  }
  return "Lançamento atualizado."
}

function mensagemCampoInvalido(campo) {
  const mensagens = {
    valor: "Valor inválido. Envie algo como: 18,90",
    categoria: "Categoria inválida. Envie algo como: mercado ou Uber",
    tipo: "Responda 1 para Entrada ou 2 para Gasto.",
    descricao: "Descrição inválida. Envie uma descrição curta.",
    data: "Data inválida. Use: hoje, ontem, 18/06 ou 18/06/2026",
  }
  return mensagens[campo] ?? "Não consegui entender a alteração."
}

async function aplicarEdicaoLancamento(
  sock,
  from,
  usuarioId,
  lancamento,
  campo,
  valorBruto
) {
  const preparado = prepararCampoEdicao(campo, valorBruto, lancamento)
  if (!preparado) {
    await enviar(sock, from, mensagemCampoInvalido(campo))
    return false
  }

  const atualizado = atualizarLancamentoDoUsuario(
    usuarioId,
    lancamento.id,
    preparado.campos
  )
  if (!atualizado) {
    await enviar(sock, from, "Não encontrei esse lançamento para atualizar.")
    return false
  }

  registrarEvento("lancamento_editado", { campo })
  await enviar(sock, from,
    formatarResultadoEdicao(campo, preparado, atualizado, lancamento))
  return true
}

async function handleAcaoLancamento(sock, from, usuarioId, acao) {
  if (acao.tipo === "editar_lista") {
    await handleIniciarEdicaoLista(sock, from, usuarioId)
    return
  }
  if (acao.tipo === "editar_ultimo_menu") {
    await handleIniciarEdicaoUltimo(sock, from, usuarioId)
    return
  }
  if (acao.tipo === "excluir_ultimo") {
    await handleIniciarExclusaoUltimo(sock, from, usuarioId)
    return
  }
  if (acao.tipo === "excluir_lista") {
    await handleIniciarExclusaoIndice(sock, from, usuarioId, acao.indice)
    return
  }
  if (acao.tipo === "editar_ultimo_direto") {
    const ultimo = getUltimoLancamento(usuarioId)
    if (!ultimo) {
      await enviar(sock, from, "Não encontrei nenhum lançamento para corrigir.")
      return
    }
    await aplicarEdicaoLancamento(
      sock,
      from,
      usuarioId,
      ultimo,
      acao.campo,
      acao.valor
    )
  }
}

function campoEscolhidoEdicao(mensagem) {
  const normalizado = normalizarRespostaFluxo(mensagem)
  const opcoes = {
    "1": "valor",
    "valor": "valor",
    "corrigir valor": "valor",
    "2": "categoria",
    "categoria": "categoria",
    "corrigir categoria": "categoria",
    "3": "tipo",
    "tipo": "tipo",
    "corrigir tipo": "tipo",
    "4": "descricao",
    "descricao": "descricao",
    "corrigir descricao": "descricao",
    "5": "data",
    "data": "data",
    "corrigir data": "data",
  }
  return opcoes[normalizado] ?? null
}

function promptCampoEdicao(campo) {
  const prompts = {
    valor: "Qual é o novo valor?",
    categoria: "Qual é a nova categoria?",
    tipo: "Este lançamento deve ser:\n1 - Entrada\n2 - Gasto",
    descricao: "Qual descrição você quer usar?",
    data: "Qual é a nova data?\nExemplos: hoje, ontem, 18/06, 18/06/2026",
  }
  return prompts[campo]
}

async function processarPendenciaEdicao(
  sock,
  from,
  usuarioId,
  mensagem,
  pendencia
) {
  if (isCancelamentoPendencia(mensagem) || normalizarRespostaFluxo(mensagem) === "7") {
    limparPendenciaEdicao(usuarioId)
    await enviar(sock, from, "Tudo certo. Edição cancelada.")
    return
  }

  if (pendencia.etapa === "escolher_item") {
    const indice = Number(normalizarRespostaFluxo(mensagem))
    const id = Number.isInteger(indice) && indice >= 1
      ? pendencia.itens?.[indice - 1]
      : null
    const lancamento = id ? getLancamentoDoUsuario(usuarioId, id) : null

    if (!lancamento) {
      await enviar(sock, from,
        `Escolha um número entre 1 e ${pendencia.itens?.length ?? 0}, ou mande cancelar.`)
      return
    }

    if (pendencia.modo === "excluir") {
      limparPendenciaEdicao(usuarioId)
      await iniciarConfirmacaoExclusao(sock, from, usuarioId, lancamento)
      return
    }

    atualizarPendenciaEdicao(usuarioId, {
      etapa: "escolher_acao",
      lancamentoId: lancamento.id,
      snapshotBefore: lancamento,
    })
    await enviar(sock, from, fmtMenuEdicaoLancamento(lancamento))
    return
  }

  const lancamento = getLancamentoDoUsuario(usuarioId, pendencia.lancamentoId)
  if (!lancamento) {
    limparPendenciaEdicao(usuarioId)
    await enviar(sock, from, "Esse lançamento não está mais disponível.")
    return
  }

  if (pendencia.etapa === "escolher_acao") {
    const resposta = normalizarRespostaFluxo(mensagem)
    if (resposta === "6" || ["excluir", "apagar", "deletar"].includes(resposta)) {
      limparPendenciaEdicao(usuarioId)
      await iniciarConfirmacaoExclusao(sock, from, usuarioId, lancamento)
      return
    }

    const campo = campoEscolhidoEdicao(mensagem)
    if (!campo) {
      await enviar(sock, from, fmtMenuEdicaoLancamento(lancamento))
      return
    }

    atualizarPendenciaEdicao(usuarioId, {
      etapa: "informar_campo",
      campoSelecionado: campo,
    })
    await enviar(sock, from, promptCampoEdicao(campo))
    return
  }

  if (pendencia.etapa === "informar_campo") {
    const atualizado = await aplicarEdicaoLancamento(
      sock,
      from,
      usuarioId,
      lancamento,
      pendencia.campoSelecionado,
      mensagem
    )
    if (atualizado) limparPendenciaEdicao(usuarioId)
  }
}

async function processarPendenciaExclusao(
  sock,
  from,
  usuarioId,
  mensagem,
  pendencia
) {
  const resposta = normalizarRespostaFluxo(mensagem)
  if (isCancelamentoPendencia(mensagem) || ["2", "nao", "não"].includes(resposta)) {
    limparPendenciaExclusao(usuarioId)
    await enviar(sock, from, "Tudo certo. Nada foi excluído.")
    return
  }

  const lancamento = getLancamentoDoUsuario(usuarioId, pendencia.lancamentoId)
  if (!lancamento) {
    limparPendenciaExclusao(usuarioId)
    await enviar(sock, from, "Esse lançamento não está mais disponível.")
    return
  }

  if (!["1", "sim", "sim excluir", "confirmar"].includes(resposta)) {
    await enviar(sock, from, fmtConfirmacaoExclusaoLancamento(lancamento))
    return
  }

  const excluido = deletarLancamentoDoUsuario(usuarioId, lancamento.id)
  limparPendenciaExclusao(usuarioId)
  registrarEvento("lancamento_excluido", { confirmado: excluido })
  await enviar(sock, from, excluido
    ? "Lançamento excluído com sucesso."
    : "Não encontrei esse lançamento para excluir.")
}

async function handleIniciarResetUsuario(sock, from, usuarioId) {
  limparPendenciasAcoesUsuario(usuarioId)
  iniciarPendenciaReset(usuarioId)
  await enviar(sock, from,
    `Atenção: isso vai apagar seus lançamentos, metas e dados financeiros de teste desta conta.\n\n` +
    `Essa ação não apaga outros usuários.\n\n` +
    `Para confirmar, responda exatamente:\nCONFIRMAR RESET\n\n` +
    `Para cancelar, mande:\ncancelar`)
}

async function processarPendenciaReset(
  sock,
  from,
  usuarioId,
  mensagem,
  pendencia
) {
  if (isCancelamentoPendencia(mensagem)) {
    limparPendenciaReset(usuarioId)
    await enviar(sock, from, "Reset cancelado. Nada foi apagado.")
    return
  }

  if (String(mensagem ?? "").trim() !== pendencia.fraseObrigatoria) {
    await enviar(sock, from,
      `Para confirmar, responda exatamente:\n${pendencia.fraseObrigatoria}\n\n` +
      `Ou mande cancelar.`)
    return
  }

  const resultado = limparDadosFinanceirosUsuario(usuarioId)
  limparPendenciasAcoesUsuario(usuarioId)
  limparPendenciaLancamento(from, usuarioId)
  limparMenuPendente(usuarioId)
  registrarEvento("reset_dados_usuario", {
    lancamentos: resultado.lancamentos,
    metas: resultado.metasCategoria,
  })
  logger.info({ acao: "reset_dados_usuario" }, "Reset financeiro de usuário concluído")
  await enviar(sock, from, "Seus dados financeiros foram limpos com sucesso.")
}

async function handleIniciarDadosExemplo(sock, from, usuarioId) {
  const jaExistem = temDadosExemploRecentes(usuarioId)
  limparPendenciaDemo(usuarioId)
  iniciarPendenciaDemo(usuarioId, { jaExistem })

  const aviso = jaExistem
    ? "Já existem dados de exemplo recentes nesta conta. Se continuar, novos dados serão adicionados.\n\n"
    : ""
  await enviar(sock, from,
    `${aviso}Vou criar alguns lançamentos fictícios para você testar resumo, consultas e fechamento.\n\n` +
    `Responda:\n1 - Criar dados de exemplo\n2 - Cancelar`)
}

async function processarPendenciaDemo(sock, from, usuarioId, mensagem) {
  const resposta = normalizarRespostaFluxo(mensagem)
  if (isCancelamentoPendencia(mensagem) || resposta === "2") {
    limparPendenciaDemo(usuarioId)
    await enviar(sock, from, "Tudo certo. Nenhum dado de exemplo foi criado.")
    return
  }

  if (resposta !== "1") {
    await enviar(sock, from, "Responda 1 para criar os dados ou 2 para cancelar.")
    return
  }

  const ids = criarDadosExemploUsuario(usuarioId)
  limparPendenciaDemo(usuarioId)
  registrarEvento("dados_exemplo_criados", { quantidade: ids.length })
  logger.info({ acao: "dados_exemplo_criados", quantidade: ids.length },
    "Dados fictícios criados")
  await enviar(sock, from,
    `Dados de exemplo criados. Teste:\n` +
    `quanto gastei com mercado?\n` +
    `onde gastei mais?\n` +
    `fechamento`)
}

async function handleAlterarNomeUsuario(sock, from, usuarioId, comando) {
  if (comando.erro || !comando.nome) {
    await enviar(sock, from,
      "Não consegui usar esse nome. Envie um nome curto, sem números ou comandos.")
    return
  }

  atualizarUsuario(usuarioId, {
    nome: comando.nome,
    aguardando_nome: 0,
  })
  await enviar(sock, from, fmtNomeAtualizado(comando.nome))
}

async function handleCancelarTudo(sock, from, usuarioId) {
  limparPendenciasAcoesUsuario(usuarioId)
  limparPendenciaLancamento(from, usuarioId)
  limparMenuPendente(usuarioId)
  atualizarUsuario(usuarioId, {
    aguardando_caixinha: 0,
    valor_sugerido_caixinha: 0,
    estado_expira_em: null,
  })
  await enviar(sock, from, fmtCancelamentoTotal())
}

async function handleApagarUltimo(sock, from, usuarioId, nome) {
  const ultimo = getUltimoLancamento(usuarioId)
  if (!ultimo) {
    await enviar(sock, from, `⚠️ *${nome}*, você não tem lançamentos para apagar.`)
    return
  }
  deletarLancamentoDoUsuario(usuarioId, ultimo.id)
  await enviar(sock, from,
    `🗑️ *${nome}*, apaguei seu último lançamento:\n\n` +
    `Descrição: ${ultimo.nome}\n` +
    `Tipo: ${fmtTipoLancamento(ultimo.tipo)}\n` +
    `Valor: R$ ${fmtValor(ultimo.valor)}\n` +
    `Categoria: ${fmtCategoriaAmigavel(ultimo.categoria)}`)
}

async function handleCorrigirUltimo(sock, from, usuarioId, valor) {
  const ultimo = getUltimoLancamento(usuarioId)
  if (!ultimo) {
    await enviar(sock, from, "Não encontrei nenhum lançamento para corrigir.")
    return
  }

  const valorAnterior = ultimo.valor
  const atualizado = atualizarValorLancamento(usuarioId, ultimo.id, valor)
  if (!atualizado) {
    await enviar(sock, from, "Não encontrei nenhum lançamento para corrigir.")
    return
  }

  await enviar(sock, from,
    `Corrigi seu último lançamento:\n\n` +
    `Antes: R$ ${fmtValor(valorAnterior)}\n` +
    `Agora: R$ ${fmtValor(valor)}\n` +
    `Categoria: ${fmtCategoriaAmigavel(ultimo.categoria)}`)
}

async function handleApagarPeriodo(sock, from, usuarioId, nome, periodo) {
  const mapa = {
    hoje:   { desde: inicioDoDia(),    label: "de hoje" },
    semana: { desde: inicioDaSemana(), label: "desta semana" },
    mes:    { desde: inicioDoMes(),    label: "deste mês" },
  }
  const { desde, label } = mapa[periodo]
  const apagados = deletarLancamentosDesde(usuarioId, desde)
  if (apagados === 0) {
    await enviar(sock, from, `⚠️ *${nome}*, não encontrei lançamentos ${label}.`)
  } else {
    await enviar(sock, from, `🗑️ *${nome}*, apaguei *${apagados}* lançamento(s) ${label}.`)
  }
}

// ── Fluxo da caixinha ─────────────────────────────────────────────────────────

/**
 * Processa a resposta do usuário ao convite da caixinha.
 * @param {object} sock
 * @param {string} from
 * @param {string} usuarioId
 * @param {string} nome
 * @param {string} mensagem
 */
export async function handleRespostaCaixinha(sock, from, usuarioId, nome, mensagem) {
  const lower = mensagem.toLowerCase().trim()
  const nomeExibicao = obterNomeExibicaoUsuario(nome) ?? "Usuário"

  if (isCancelamentoPendencia(mensagem)) {
    atualizarUsuario(usuarioId, {
      aguardando_caixinha: 0,
      valor_sugerido_caixinha: 0,
      estado_expira_em: null,
    })
    await enviar(sock, from, "Tudo bem, cancelei esse fluxo. Nada foi registrado.")
    return
  }

  if (lower === "sim") {
    const u     = getUsuario(usuarioId)
    const valor = u.valor_sugerido_caixinha ?? 0
    if (valor > 0) {
      inserirLancamento({ usuarioId, tipo: "gasto", nome: "caixinha", categoria: "poupanca", valor, mes: mesAtual() })
    }
    atualizarUsuario(usuarioId, { aguardando_caixinha: 0, valor_sugerido_caixinha: 0, estado_expira_em: null })
    await enviar(sock, from, `💰 *${nomeExibicao}*, registrei R$ ${fmtValor(valor)} na caixinha. Ótima decisão! 🎉`)
    return
  }

  if (lower === "nao" || lower === "não") {
    atualizarUsuario(usuarioId, { aguardando_caixinha: 0, valor_sugerido_caixinha: 0, estado_expira_em: null })
    await enviar(sock, from, `👌 *${nomeExibicao}*, tudo certo. Nada foi guardado na caixinha.`)
    return
  }

  await enviar(sock, from, `❓ *${nomeExibicao}*, responda apenas *sim* ou *não*.`)
}

async function registrarLancamentoComConfirmacao(
  sock,
  from,
  usuarioId,
  nomeUsuario,
  { tipo, nome, categoria, valor }
) {
  inserirLancamento({ usuarioId, tipo, nome, categoria, valor, mes: mesAtual() })

  if (tipo === "entrada") {
    await enviar(sock, from, fmtConfirmacaoReceita({ valor, categoria }))
    return
  }

  let texto = fmtConfirmacaoDespesa({ valor, categoria })
  const { mes, ano } = periodoAtual()
  const meta = buscarMetaCategoria(usuarioId, categoria, mes, ano)
  if (meta) {
    const gastoAtual = calcularGastoCategoriaNoPeriodo(usuarioId, categoria, mes, ano)
    texto += "\n\n" + (gastoAtual > meta.valor_limite
      ? fmtMetaCategoriaUltrapassada(meta, gastoAtual)
      : fmtProgressoMetaCategoria(meta, gastoAtual))
  }

  await enviar(sock, from, texto)
  await verificarMeta(sock, from, usuarioId, nomeUsuario, valor)
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Processa uma mensagem e despacha para o handler correto.
 * @param {object} sock
 * @param {string} from
 * @param {string} usuarioId
 * @param {string} mensagem
 * @param {{ pularBeta?: boolean }} [opcoes]
 */
export async function processarMensagem(sock, from, usuarioId, mensagem, opcoes = {}) {
  if (!opcoes.pularBeta && !usuarioAutorizadoBeta(usuarioId)) {
    if (config.beta?.responderBloqueado) {
      await enviar(sock, from, fmtBetaFechado())
    }
    return
  }

  const usuario = getUsuario(usuarioId)
  const nomeSalvo = usuario?.nome
  const nome    = obterNomeExibicaoUsuario(usuario) ?? "Usuário"
  const lower   = mensagem.toLowerCase().trim()
  const partes  = lower.split(/\s+/)

  // ── Comandos exatos (Map lookup O(1)) ────────────────────────────────────
  const comandos = {
    "ajuda":           () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
    "ajuda completa":  () => handleComandos(sock, from),
    "comandos":        () => handleComandos(sock, from),
    "como usar":       () => handleComandos(sock, from),
    "menu":            () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
    "menu texto":      () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo, "text"),
    "inicio":          () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
    "início":          () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
    "start":           () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
    "iniciar_gasto":   () => enviar(sock, from, fmtOrientacaoGasto()),
    "iniciar_entrada": () => enviar(sock, from, fmtOrientacaoEntrada()),
    "iniciar_meta":    () => enviar(sock, from, fmtOrientacaoMeta()),
    "exemplos":        () => enviar(sock, from, fmtExemplosRapidos()),
    "menu_metas":      () => handleMenuMetas(sock, from, usuarioId),
    "resumo":          () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "saldo":           () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "meu resumo":      () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "resumo do mes":   () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "resumo do mês":   () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "relatorio":       () => handleRelatorio(sock, from, usuarioId, nomeSalvo),
    "relatorio geral": () => handleRelatorioGeral(sock, from),
    "fechamento":      () => handleFechamentoMensal(sock, from, usuarioId),
    "fechamento do mes": () => handleFechamentoMensal(sock, from, usuarioId),
    "fechamento do mês": () => handleFechamentoMensal(sock, from, usuarioId),
    "analise meu mes": () => handleFechamentoMensal(sock, from, usuarioId),
    "analise meu mês": () => handleFechamentoMensal(sock, from, usuarioId),
    "relatorio mensal": () => handleFechamentoMensal(sock, from, usuarioId),
    "relatório mensal": () => handleFechamentoMensal(sock, from, usuarioId),
    "categorias":      () => handleCategorias(sock, from, usuarioId, nome),
    "historico":       () => handleHistorico(sock, from, usuarioId, nome),
    "histórico":       () => handleHistorico(sock, from, usuarioId, nome),
    "ultimos gastos":  () => handleHistorico(sock, from, usuarioId, nome),
    "últimos gastos":  () => handleHistorico(sock, from, usuarioId, nome),
    "ultimos lancamentos":    () => handleHistorico(sock, from, usuarioId, nome),
    "últimos lançamentos":    () => handleHistorico(sock, from, usuarioId, nome),
    "extrato":         () => handleHistorico(sock, from, usuarioId, nome),
    "ultimos":         () => handleHistorico(sock, from, usuarioId, nome),
    "últimos":         () => handleHistorico(sock, from, usuarioId, nome),
    "lancamentos":     () => handleHistorico(sock, from, usuarioId, nome),
    "lançamentos":     () => handleHistorico(sock, from, usuarioId, nome),
    "metas":          () => handleListarMetasCategoria(sock, from, usuarioId),
    "minhas metas":   () => handleListarMetasCategoria(sock, from, usuarioId),
    "ver metas":      () => handleListarMetasCategoria(sock, from, usuarioId),
    "csv":             () => handleExportar(sock, from, usuarioId, nome),
    "exportar csv":    () => handleExportar(sock, from, usuarioId, nome),
    "baixar csv":      () => handleExportar(sock, from, usuarioId, nome),
    "exportar":        () => handleExportarXlsx(sock, from, usuarioId, nome),
    "planilha":        () => handleExportarXlsx(sock, from, usuarioId, nome),
    "excel":           () => handleExportarXlsx(sock, from, usuarioId, nome),
    "exportar planilha": () => handleExportarXlsx(sock, from, usuarioId, nome),
    "baixar planilha": () => handleExportarXlsx(sock, from, usuarioId, nome),
    "gerar planilha":  () => handleExportarXlsx(sock, from, usuarioId, nome),
    "minha planilha":  () => handleExportarXlsx(sock, from, usuarioId, nome),
    "planilha bonita": () => handleExportarXlsx(sock, from, usuarioId, nome),
    "planilha excel":  () => handleExportarXlsx(sock, from, usuarioId, nome),
    "exportar excel":  () => handleExportarXlsx(sock, from, usuarioId, nome),
    "xlsx":            () => handleExportarXlsx(sock, from, usuarioId, nome),
    "exportar xlsx":   () => handleExportarXlsx(sock, from, usuarioId, nome),
    "apagar ultimo":   () => handleApagarUltimo(sock, from, usuarioId, nome),
    "apagar último":   () => handleApagarUltimo(sock, from, usuarioId, nome),
    "excluir ultimo":  () => handleApagarUltimo(sock, from, usuarioId, nome),
    "excluir último":  () => handleApagarUltimo(sock, from, usuarioId, nome),
    "deletar ultimo":  () => handleApagarUltimo(sock, from, usuarioId, nome),
    "deletar último":  () => handleApagarUltimo(sock, from, usuarioId, nome),
    "desfazer":        () => handleApagarUltimo(sock, from, usuarioId, nome),
    "corrigir ultimo": () => enviar(sock, from, "Informe o novo valor. Exemplo: corrigir ultimo para 45"),
    "corrigir último": () => enviar(sock, from, "Informe o novo valor. Exemplo: corrigir ultimo para 45"),
    "editar ultimo":   () => enviar(sock, from, "Informe o novo valor. Exemplo: editar ultimo para 45"),
    "editar último":   () => enviar(sock, from, "Informe o novo valor. Exemplo: editar ultimo para 45"),
    "apagar hoje":     () => handleApagarPeriodo(sock, from, usuarioId, nome, "hoje"),
    "apagar semana":   () => handleApagarPeriodo(sock, from, usuarioId, nome, "semana"),
    "apagar mes":      () => handleApagarPeriodo(sock, from, usuarioId, nome, "mes"),
  }

  const ajuda = parseAjuda(mensagem)
  const exportacao = parseExportacao(mensagem)
  const acaoLancamento = parseAcaoLancamento(mensagem)
  const resetUsuario = parseComandoResetUsuario(mensagem)
  const dadosExemplo = parseComandoDadosExemplo(mensagem)
  const alterarNome = parseComandoAlterarNome(mensagem)
  const cancelarTudo = isCancelamentoTotal(mensagem)
  const correcaoUltimo = parseCorrecaoUltimo(mensagem)
  const metaCategoria = parseMetaCategoria(mensagem)
  const comandoExato = comandos[lower]
  const temComando = Boolean(
    comandoExato || ajuda || exportacao || acaoLancamento ||
    resetUsuario || dadosExemplo || alterarNome || cancelarTudo || correcaoUltimo ||
    metaCategoria || partes[0] === "meta"
  )

  if (cancelarTudo) {
    await handleCancelarTudo(sock, from, usuarioId)
    return
  }

  const pendenciaReset = obterPendenciaReset(usuarioId)
  if (pendenciaReset) {
    await processarPendenciaReset(
      sock,
      from,
      usuarioId,
      mensagem,
      pendenciaReset
    )
    return
  }

  const pendenciaExclusao = obterPendenciaExclusao(usuarioId)
  if (pendenciaExclusao) {
    await processarPendenciaExclusao(
      sock,
      from,
      usuarioId,
      mensagem,
      pendenciaExclusao
    )
    return
  }

  const pendenciaEdicao = obterPendenciaEdicao(usuarioId)
  if (pendenciaEdicao) {
    await processarPendenciaEdicao(
      sock,
      from,
      usuarioId,
      mensagem,
      pendenciaEdicao
    )
    return
  }

  const pendenciaDemo = obterPendenciaDemo(usuarioId)
  if (pendenciaDemo) {
    await processarPendenciaDemo(sock, from, usuarioId, mensagem)
    return
  }

  const pendencia = obterPendenciaLancamento(from, usuarioId)
  if (pendencia) {
    if (isCancelamentoPendencia(mensagem)) {
      limparPendenciaLancamento(from, usuarioId)
      await enviar(sock, from, fmtPendenciaCancelada())
      return
    }

    if (acaoLancamento || resetUsuario || dadosExemplo) {
      await enviar(sock, from, fmtComandoBloqueadoPorPendencia())
      return
    }

    if (alterarNome) {
      await handleAlterarNomeUsuario(sock, from, usuarioId, alterarNome)
      return
    }

    // Comandos continuam funcionando sem serem salvos como categoria.
    // A pendência permanece ativa para o usuário concluí-la depois.
    if (!temComando) {
      if (pendencia.etapa === "tipo") {
        const tipo = parseTipoLancamentoPendente(mensagem)
        if (!tipo) {
          registrarFallbackAcionado("pendencia_incompleta")
          await enviar(sock, from, formatarMensagemNaoEntendida({
            motivo: "pendencia_incompleta",
            pendencia,
            nome: nomeSalvo,
          }))
          return
        }

        const atualizada = selecionarTipoPendencia(from, usuarioId, tipo)
        if (atualizada?.nome && atualizada?.categoria) {
          await registrarLancamentoComConfirmacao(sock, from, usuarioId, nome, {
            tipo,
            valor: atualizada.valor,
            nome: atualizada.nome,
            categoria: atualizada.categoria,
          })
          limparPendenciaLancamento(from, usuarioId)
          return
        }

        await enviar(sock, from, fmtCategoriaPendente(tipo))
        return
      }

      const categoriaPendente = parseCategoriaLancamentoPendente(mensagem)
      if (!categoriaPendente) {
        registrarFallbackAcionado("pendencia_incompleta")
        await enviar(sock, from, formatarMensagemNaoEntendida({
          motivo: "pendencia_incompleta",
          pendencia,
          nome: nomeSalvo,
        }))
        return
      }

      await registrarLancamentoComConfirmacao(sock, from, usuarioId, nome, {
        tipo: pendencia.tipo,
        valor: pendencia.valor,
        ...categoriaPendente,
      })
      limparPendenciaLancamento(from, usuarioId)
      return
    }
  }

  const menuPendente = obterMenuPendente(usuarioId)
  if (menuPendente && isCancelamentoPendencia(mensagem)) {
    limparMenuPendente(usuarioId)
    await enviar(sock, from, "Tudo bem, saí desse menu. Nada foi registrado.")
    return
  }

  if (menuPendente && /^\d+$/.test(lower)) {
    const processado = await handleRespostaMenuPendente(
      sock,
      from,
      usuarioId,
      menuPendente,
      lower,
      {
        iniciarGasto: () => enviar(sock, from, fmtOrientacaoGasto()),
        iniciarEntrada: () => enviar(sock, from, fmtOrientacaoEntrada()),
        resumo: () => handleResumo(sock, from, usuarioId, nomeSalvo),
        historico: () => handleHistorico(sock, from, usuarioId, nome),
        planilha: () => handleExportarXlsx(sock, from, usuarioId, nome),
        menuMetas: () => handleMenuMetas(sock, from, usuarioId),
        ajudaCompleta: () => handleComandos(sock, from),
        iniciarMeta: () => enviar(sock, from, fmtOrientacaoMeta()),
        verMetas: () => handleListarMetasCategoria(sock, from, usuarioId),
        menuPrincipal: () => handleMenuPrincipal(sock, from, usuarioId, nomeSalvo),
      }
    )
    if (processado) return
  }

  if (alterarNome) {
    limparMenuPendente(usuarioId)
    await handleAlterarNomeUsuario(sock, from, usuarioId, alterarNome)
    return
  }

  if (resetUsuario) {
    limparMenuPendente(usuarioId)
    await handleIniciarResetUsuario(sock, from, usuarioId)
    return
  }

  if (dadosExemplo) {
    limparMenuPendente(usuarioId)
    await handleIniciarDadosExemplo(sock, from, usuarioId)
    return
  }

  if (acaoLancamento) {
    limparMenuPendente(usuarioId)
    await handleAcaoLancamento(sock, from, usuarioId, acaoLancamento)
    return
  }

  if (comandoExato) {
    await comandoExato()
    return
  }

  if (ajuda) {
    await handleComandos(sock, from)
    return
  }

  if (exportacao) {
    if (exportacao.formato === "xlsx") {
      await handleExportarXlsx(sock, from, usuarioId, nome)
    } else {
      await handleExportar(sock, from, usuarioId, nome)
    }
    return
  }

  if (correcaoUltimo) {
    await handleCorrigirUltimo(sock, from, usuarioId, correcaoUltimo.valor)
    return
  }

  if (metaCategoria) {
    await handleCriarMetaCategoria(sock, from, usuarioId, metaCategoria)
    return
  }

  // ── Comandos com prefixo ─────────────────────────────────────────────────
  if (partes[0] === "meta") {
    await handleMeta(sock, from, usuarioId, nome, partes)
    return
  }

  const consultaFinanceira = parseConsultaFinanceira(mensagem)
  if (consultaFinanceira) {
    limparMenuPendente(usuarioId)
    await handleConsultaFinanceira(sock, from, usuarioId, consultaFinanceira)
    return
  }

  // ── Lançamento ───────────────────────────────────────────────────────────
  const valorAmbiguo = parseValorAmbiguo(mensagem)
  if (valorAmbiguo) {
    limparMenuPendente(usuarioId)
    iniciarPendenciaLancamento(from, usuarioId, valorAmbiguo.valor)
    await enviar(sock, from, fmtValorAmbiguo(valorAmbiguo.valor))
    return
  }

  const classificacaoPrevia = classificarMensagemDesconhecida(mensagem)
  if (classificacaoPrevia.motivo === "valor_com_descricao_ambigua") {
    limparMenuPendente(usuarioId)
    iniciarPendenciaLancamento(from, usuarioId, classificacaoPrevia.valor, {
      nome: classificacaoPrevia.descricao,
      categoria: classificacaoPrevia.categoria,
    })
    registrarFallbackAcionado(classificacaoPrevia.motivo)
    await enviar(sock, from, formatarMensagemNaoEntendida({
      ...classificacaoPrevia,
      nome: nomeSalvo,
    }))
    return
  }

  const lancamento = parseLancamento(mensagem)
  if (!lancamento) {
    const classificacao = classificarMensagemDesconhecida(mensagem)
    registrarFallbackAcionado(classificacao.motivo)
    await enviar(sock, from, fmtMensagemNaoEntendida({
      ...classificacao,
      nome: nomeSalvo,
    }))
    return
  }

  const { nome: nomeLanc, categoria, valor } = lancamento
  const tipo = lancamento.tipo ?? (config.palavrasEntrada.includes(nomeLanc) ? "entrada" : "gasto")

  limparMenuPendente(usuarioId)
  await registrarLancamentoComConfirmacao(sock, from, usuarioId, nome, {
    tipo,
    nome: nomeLanc,
    categoria,
    valor,
  })
}
