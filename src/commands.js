/**
 * @fileoverview Handlers de todos os comandos do bot.
 * Dispatcher baseado em Map — sem if/else em cadeia.
 */

import { config, usuarioAutorizadoBeta } from "./config.js"
import { logger }        from "./logger.js"
import {
  getUsuario, atualizarUsuario, inserirLancamento,
  getLancamentosPorMes, getGastosPorCategoria,
  getUltimosLancamentos, getUltimoLancamento,
  atualizarValorLancamento, deletarLancamentoDoUsuario, deletarLancamentosDesde,
  getTodosUsuarios, getSomaPorTipo, definirMeta, getMeta,
  criarOuAtualizarMetaCategoria, listarMetasCategoria, buscarMetaCategoria,
  calcularGastoCategoriaNoPeriodo,
  mesAtual,
} from "./database.js"
import {
  gerarCSVLancamentos, gerarXlsxFinanceiro,
  salvarCSVExportacao, salvarXlsxExportacao, XLSX_MIMETYPE,
} from "./exporters.js"
import {
  fmtValor, fmtLista, fmtRelatorioMensal, fmtRelatorioGeral,
  fmtCategorias, fmtSaldo, fmtBarraMeta, fmtHistoricoLancamentos,
  fmtAjuda, fmtBetaFechado, fmtMensagemNaoEntendida,
  fmtTituloResumo, obterNomeExibicaoUsuario,
  fmtCategoriaPendente, fmtPendenciaCancelada, fmtValorAmbiguo,
  fmtTipoLancamento, fmtCategoriaAmigavel,
  fmtConfirmacaoDespesa, fmtConfirmacaoReceita,
  fmtMetaCategoriaCriada, fmtMetaCategoriaAtualizada,
  fmtListaMetasCategoria, fmtProgressoMetaCategoria,
  fmtMetaCategoriaUltrapassada,
} from "./formatters.js"
import {
  parseAjuda, parseCorrecaoUltimo, parseExportacao, parseLancamento,
  isCancelamentoPendencia, parseCategoriaLancamentoPendente,
  parseMetaCategoria, parseTipoLancamentoPendente,
  parseValorAmbiguo, parseValorSimples,
} from "./validators.js"
import {
  iniciarPendenciaLancamento, limparPendenciaLancamento,
  obterPendenciaLancamento, selecionarTipoPendencia,
} from "./pendingLancamentos.js"

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
    "ajuda":           () => handleComandos(sock, from),
    "comandos":        () => handleComandos(sock, from),
    "como usar":       () => handleComandos(sock, from),
    "menu":            () => handleComandos(sock, from),
    "inicio":          () => handleComandos(sock, from),
    "início":          () => handleComandos(sock, from),
    "start":           () => handleComandos(sock, from),
    "resumo":          () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "saldo":           () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "meu resumo":      () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "resumo do mes":   () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "resumo do mês":   () => handleResumo(sock, from, usuarioId, nomeSalvo),
    "relatorio":       () => handleRelatorio(sock, from, usuarioId, nomeSalvo),
    "relatorio geral": () => handleRelatorioGeral(sock, from),
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
  const correcaoUltimo = parseCorrecaoUltimo(mensagem)
  const metaCategoria = parseMetaCategoria(mensagem)
  const comandoExato = comandos[lower]
  const temComando = Boolean(
    comandoExato || ajuda || exportacao || correcaoUltimo ||
    metaCategoria || partes[0] === "meta"
  )

  const pendencia = obterPendenciaLancamento(from, usuarioId)
  if (pendencia) {
    if (isCancelamentoPendencia(mensagem)) {
      limparPendenciaLancamento(from, usuarioId)
      await enviar(sock, from, fmtPendenciaCancelada())
      return
    }

    // Comandos continuam funcionando sem serem salvos como categoria.
    // A pendência permanece ativa para o usuário concluí-la depois.
    if (!temComando) {
      if (pendencia.etapa === "tipo") {
        const tipo = parseTipoLancamentoPendente(mensagem)
        if (!tipo) {
          await enviar(sock, from, fmtValorAmbiguo(pendencia.valor))
          return
        }

        selecionarTipoPendencia(from, usuarioId, tipo)
        await enviar(sock, from, fmtCategoriaPendente(tipo))
        return
      }

      const categoriaPendente = parseCategoriaLancamentoPendente(mensagem)
      if (!categoriaPendente) {
        await enviar(sock, from, fmtCategoriaPendente(pendencia.tipo))
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

  // ── Lançamento ───────────────────────────────────────────────────────────
  const valorAmbiguo = parseValorAmbiguo(mensagem)
  if (valorAmbiguo) {
    iniciarPendenciaLancamento(from, usuarioId, valorAmbiguo.valor)
    await enviar(sock, from, fmtValorAmbiguo(valorAmbiguo.valor))
    return
  }

  const lancamento = parseLancamento(mensagem)
  if (!lancamento) {
    await enviar(sock, from, fmtMensagemNaoEntendida())
    return
  }

  const { nome: nomeLanc, categoria, valor } = lancamento
  const tipo = lancamento.tipo ?? (config.palavrasEntrada.includes(nomeLanc) ? "entrada" : "gasto")

  await registrarLancamentoComConfirmacao(sock, from, usuarioId, nome, {
    tipo,
    nome: nomeLanc,
    categoria,
    valor,
  })
}
