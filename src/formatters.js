/**
 * @fileoverview Formatadores de saída para mensagens WhatsApp.
 * Nenhuma lógica de negócio — apenas apresentação.
 */

/**
 * Formata um número como moeda brasileira.
 * @param {number} valor
 * @returns {string}
 */
import { normalizarNomeUsuario } from "./validators.js"

export function fmtValor(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formata uma lista de lançamentos em texto numerado.
 * @param {object[]} lancamentos
 * @returns {string}
 */
export function fmtLista(lancamentos) {
  if (!lancamentos.length) return "_Nenhum lançamento._"
  return lancamentos
    .map((l, i) => `${i + 1}. ${fmtDescricaoLancamento(l.nome)} (${fmtCategoriaAmigavel(l.categoria)}) — R$ ${fmtValor(l.valor)}`)
    .join("\n")
}

/**
 * Formata agrupamento de gastos por categoria.
 * @param {{ categoria:string, total:number }[]} grupos
 * @returns {string}
 */
export function fmtCategorias(grupos) {
  if (!grupos.length) return "_Nenhum gasto registrado._"
  return grupos
    .map((g, i) => `${i + 1}. ${fmtCategoriaAmigavel(g.categoria)} — R$ ${fmtValor(g.total)}`)
    .join("\n")
}

/**
 * Converte o tipo interno para o texto exibido ao usuário.
 * @param {"entrada"|"gasto"} tipo
 * @returns {string}
 */
export function fmtTipoLancamento(tipo) {
  return tipo === "entrada" ? "Receita" : "Despesa"
}

/**
 * Capitaliza nomes curtos exibidos em respostas do bot.
 * @param {string} texto
 * @returns {string}
 */
export function fmtCapitalizado(texto) {
  if (!texto) return ""
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Mensagem principal de ajuda para usuários beta.
 * @returns {string}
 */
/**
 * Retorna um nome seguro para exibição, ou null quando o nome salvo parece comando.
 * @param {object|string|null|undefined} usuarioOuNome
 * @returns {string|null}
 */
export function obterNomeExibicaoUsuario(usuarioOuNome) {
  const nome = typeof usuarioOuNome === "string"
    ? usuarioOuNome
    : usuarioOuNome?.nome
  return normalizarNomeUsuario(nome)
}

/**
 * Formata o título do resumo mensal sem usar nomes contaminados.
 * @param {object|string|null|undefined} usuarioOuNome
 * @returns {string}
 */
export function fmtTituloResumo(usuarioOuNome) {
  const nome = obterNomeExibicaoUsuario(usuarioOuNome)
  return nome ? `💡 *RESUMO — ${nome.toUpperCase()}*` : "💡 *RESUMO DO MÊS*"
}

export function fmtAjuda() {
  return `📋 *MENU DO BOT FINANÇAS*

1. 💸 *Registrar gasto*
   Envie algo como:
   gastei 35 no mercado
   mercado 35
   uber 12,50

2. 💰 *Registrar entrada*
   Envie algo como:
   recebi 2500 salario
   recebi 1250 em freelance
   pix 200

3. 📊 *Ver resumo*
   Mostra entradas, gastos e saldo do mês.
   Comando: resumo

4. 🧾 *Ver histórico*
   Mostra os últimos lançamentos.
   Comando: historico

5. 📁 *Exportar planilha*
   Gera um Excel com lançamentos e resumo.
   Comandos: planilha ou exportar planilha

6. 🎯 *Metas por categoria*
   Define um limite de gasto.
   Exemplo: meta mercado 600

7. ✏️ *Corrigir ou excluir*
   Ajusta ou remove o último lançamento.
   Exemplos:
   corrigir ultimo para 45
   excluir ultimo`
}

/**
 * Mensagem curta de boas-vindas para primeiro contato.
 * @returns {string}
 */
export function fmtBoasVindas() {
  return `👋 Oi! Eu sou seu assistente financeiro pelo WhatsApp.

Eu posso te ajudar a registrar gastos, entradas, metas e gerar sua planilha. 📊

Antes de começar, como você gostaria que eu te chamasse?

Exemplo:
Sadu`
}

/**
 * Confirma o nome salvo e mostra os primeiros exemplos.
 * @param {string} nome
 * @returns {string}
 */
export function fmtNomeSalvo(nome) {
  const nomeExibicao = obterNomeExibicaoUsuario(nome) ?? "Usuário"
  return `Perfeito, ${nomeExibicao}! ✅

Agora você já pode me mandar mensagens como:
💸 gastei 35 no mercado
💰 recebi 2500 salario
📊 resumo
🎯 meta mercado 600
📁 exportar planilha

Se quiser ver todos os comandos, mande:
ajuda`
}

/**
 * Cumprimenta um usuário que já possui nome válido.
 * @param {string|object} usuarioOuNome
 * @returns {string}
 */
export function fmtSaudacaoUsuario(usuarioOuNome) {
  const nome = obterNomeExibicaoUsuario(usuarioOuNome)
  if (!nome) return fmtBoasVindas()

  return `👋 Oi, ${nome}! Como posso te ajudar hoje?

Você pode mandar:
💸 gastei 35 no mercado
💰 recebi 2500 salario
📊 resumo

Para ver todos os comandos, mande:
ajuda`
}

/**
 * Pede novamente um nome quando a resposta parece comando ou lançamento.
 * @returns {string}
 */
export function fmtNomeInvalido() {
  return `Hmm, isso parece mais um comando do que um nome. 🙂

Como você gostaria que eu te chamasse?

Exemplo:
Sadu`
}

/**
 * Mensagem para quando o bot não entende o texto recebido.
 * @returns {string}
 */
export function fmtMensagemNaoEntendida() {
  return `Não consegui entender essa mensagem.

Tente algo como:
gastei 35 no mercado
recebi 2500 salario
resumo

Ou mande “ajuda” para ver os comandos.`
}

/**
 * Orienta o usuário quando a mensagem contém apenas um valor.
 * @param {number} valor
 * @returns {string}
 */
export function fmtValorAmbiguo(valor) {
  return `Entendi o valor R$ ${fmtValor(valor)}, mas preciso saber o tipo.

Responda:
1 - Entrada
2 - Gasto

Ou mande completo, por exemplo:
recebi ${fmtValor(valor)} freelance
gastei ${fmtValor(valor)} aluguel`
}

/**
 * Pede categoria ou descrição depois que o usuário escolhe o tipo.
 * @param {"entrada"|"gasto"} tipo
 * @returns {string}
 */
export function fmtCategoriaPendente(tipo) {
  if (tipo === "entrada") {
    return `Certo, vou registrar como entrada. Qual categoria ou descrição?

Exemplos:
salario
freelance
pix`
  }

  return `Certo, vou registrar como gasto. Qual categoria ou descrição?

Exemplos:
mercado
aluguel
internet`
}

/**
 * Confirma o cancelamento de um lançamento pendente.
 * @returns {string}
 */
export function fmtPendenciaCancelada() {
  return "Tudo bem, cancelei esse lançamento. Nenhum valor foi registrado."
}

/**
 * Formata a confirmacao de despesa usando apenas os dados do lancamento atual.
 * @param {{ valor:number, categoria:string }} lancamento
 * @returns {string}
 */
export function fmtConfirmacaoDespesa({ valor, categoria }) {
  return `Despesa registrada: R$ ${fmtValor(valor)} em ${fmtCategoriaAmigavel(categoria)}.`
}

/**
 * Formata a confirmacao de receita usando apenas os dados do lancamento atual.
 * @param {{ valor:number, categoria:string }} lancamento
 * @returns {string}
 */
export function fmtConfirmacaoReceita({ valor, categoria }) {
  return `Receita registrada: R$ ${fmtValor(valor)} em ${fmtCategoriaAmigavel(categoria)}.`
}

/**
 * Mensagem para contatos bloqueados no beta fechado.
 * @returns {string}
 */
export function fmtBetaFechado() {
  return `Este bot está em beta fechado no momento.

Se você recebeu um convite para testar, entre em contato com a equipe para liberar seu número.`
}

const categoriasAmigaveis = {
  alimentacao: "Alimentação",
  farmacia:    "Farmácia",
  salario:     "Salário",
  mercado:     "Mercado",
  transporte:  "Transporte",
  geral:       "Geral",
  pix:         "Pix",
  freela:      "Freela",
  comissao:    "Comissão",
  deposito:    "Depósito",
  bonus:       "Bônus",
  extra:       "Extra",
  receita:     "Receita",
  entrada:     "Entrada",
  internet:    "Internet",
  aluguel:     "Aluguel",
  poupanca:    "Poupança",
}

const descricoesAmigaveis = {
  salario: "salário",
}

function chaveAmigavel(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Formata categorias internas normalizadas para exibição amigável.
 * @param {string} categoria
 * @returns {string}
 */
export function fmtCategoriaAmigavel(categoria) {
  const chave = chaveAmigavel(categoria)
  if (!chave) return ""
  return categoriasAmigaveis[chave] ?? String(categoria)
    .trim()
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .map(fmtCapitalizado)
    .join(" ")
}

/**
 * Formata a descrição curta de um lançamento sem alterar o dado salvo.
 * @param {string} descricao
 * @returns {string}
 */
export function fmtDescricaoLancamento(descricao) {
  const chave = chaveAmigavel(descricao)
  if (!chave) return ""
  return descricoesAmigaveis[chave] ?? String(descricao).trim()
}

function fmtDataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })
}

/**
 * Formata os últimos lançamentos de um usuário.
 * @param {object[]} lancamentos
 * @returns {string}
 */
export function fmtHistoricoLancamentos(lancamentos) {
  if (!lancamentos.length) {
    return "Você ainda não tem lançamentos registrados.\nMande algo como: gastei 35 no mercado"
  }

  const linhas = lancamentos.map((l, i) =>
    `${i + 1}. ${fmtDataCurta(l.criado_em)} - ${fmtTipoLancamento(l.tipo)} - ` +
    `R$ ${fmtValor(l.valor)} - ${fmtCategoriaAmigavel(l.categoria)} - ${fmtDescricaoLancamento(l.nome)}`
  )

  return `Últimos lançamentos:\n\n${linhas.join("\n")}`
}

/**
 * Formata resposta de meta por categoria criada.
 * @param {object} meta
 * @returns {string}
 */
export function fmtMetaCategoriaCriada(meta) {
  return `Meta criada: ${fmtCategoriaAmigavel(meta.categoria)} até R$ ${fmtValor(meta.valor_limite)} neste mês.`
}

/**
 * Formata resposta de meta por categoria atualizada.
 * @param {object} meta
 * @returns {string}
 */
export function fmtMetaCategoriaAtualizada(meta) {
  return `Atualizei sua meta de ${fmtCategoriaAmigavel(meta.categoria)} para R$ ${fmtValor(meta.valor_limite)} neste mês.`
}

/**
 * Formata mensagem de ausência de metas por categoria.
 * @returns {string}
 */
export function fmtSemMetasCategoria() {
  return "Você ainda não criou metas.\nExemplo: meta mercado 600"
}

/**
 * Formata lista de metas por categoria com progresso.
 * @param {object[]} metas
 * @returns {string}
 */
export function fmtListaMetasCategoria(metas) {
  if (!metas.length) return fmtSemMetasCategoria()

  const linhas = metas.map(meta =>
    `${fmtCategoriaAmigavel(meta.categoria)}: R$ ${fmtValor(meta.gasto ?? 0)} / R$ ${fmtValor(meta.valor_limite)}`
  )

  return `Suas metas deste mês:\n\n${linhas.join("\n")}`
}

/**
 * Formata progresso de meta por categoria dentro do limite.
 * @param {object} meta
 * @param {number} gastoAtual
 * @returns {string}
 */
export function fmtProgressoMetaCategoria(meta, gastoAtual) {
  const restante = Math.max(meta.valor_limite - gastoAtual, 0)
  return `Você já usou R$ ${fmtValor(gastoAtual)} da sua meta de R$ ${fmtValor(meta.valor_limite)}.\n` +
    `Ainda restam R$ ${fmtValor(restante)}.`
}

/**
 * Formata alerta de meta por categoria ultrapassada.
 * @param {object} meta
 * @param {number} gastoAtual
 * @returns {string}
 */
export function fmtMetaCategoriaUltrapassada(meta, gastoAtual) {
  return `Atenção: você ultrapassou sua meta de ${fmtCategoriaAmigavel(meta.categoria)}.\n` +
    `Meta: R$ ${fmtValor(meta.valor_limite)}\n` +
    `Gasto atual: R$ ${fmtValor(gastoAtual)}\n` +
    `Excedente: R$ ${fmtValor(gastoAtual - meta.valor_limite)}`
}

/**
 * Formata um saldo com cor (🟢 positivo / 🔴 negativo).
 * @param {number} saldo
 * @returns {string}
 */
export function fmtSaldo(saldo) {
  const emoji = saldo >= 0 ? "🟢" : "🔴"
  const sinal = saldo >= 0 ? "+" : ""
  return `${emoji} R$ ${sinal}${fmtValor(saldo)}`
}

/**
 * Gera barra de progresso para meta.
 * @param {number} gasto
 * @param {number} meta
 * @returns {string}
 */
export function fmtBarraMeta(gasto, meta) {
  const pct    = Math.min(Math.round((gasto / meta) * 100), 100)
  const blocos = Math.round(pct / 10)
  const barra  = "█".repeat(blocos) + "░".repeat(10 - blocos)
  return `${barra} ${pct}%`
}

/**
 * Monta o relatório mensal completo de um usuário.
 * @param {string} nome
 * @param {object[]} entradas
 * @param {object[]} gastos
 * @param {number|null} meta
 * @returns {{ texto:string, saldo:number, totalE:number, totalG:number }}
 */
export function fmtRelatorioMensal(nome, entradas, gastos, meta) {
  const totalE = entradas.reduce((s, l) => s + l.valor, 0)
  const totalG = gastos.reduce((s, l) => s + l.valor, 0)
  const saldo  = totalE - totalG
  const nomeExibicao = obterNomeExibicaoUsuario(nome)
  const titulo = nomeExibicao
    ? `📊 *RELATÓRIO MENSAL — ${nomeExibicao.toUpperCase()}*`
    : "📊 *RESUMO DO MÊS*"

  let texto =
`${titulo}

💰 *ENTRADAS*
${fmtLista(entradas)}
Total: R$ ${fmtValor(totalE)}

💸 *GASTOS*
${fmtLista(gastos)}
Total: R$ ${fmtValor(totalG)}

🧾 *SALDO DO MÊS*
${fmtSaldo(saldo)}`

  if (meta) {
    const status = totalG > meta
      ? `⚠️ Meta de R$ ${fmtValor(meta)} *ultrapassada* em R$ ${fmtValor(totalG - meta)}`
      : `✅ Dentro da meta de R$ ${fmtValor(meta)}`
    texto += `\n\n🎯 *META DO MÊS*\n${fmtBarraMeta(totalG, meta)}\n${status}`
  }

  return { texto, saldo, totalE, totalG }
}

/**
 * Monta o relatório geral do grupo.
 * @param {{ nome:string, totalE:number, totalG:number }[]} usuarios
 * @returns {{ resumo:string, ranking:string }}
 */
export function fmtRelatorioGeral(usuarios) {
  let totalEntradasGeral = 0
  let totalGastosGeral   = 0
  let textoPessoas       = ""
  const ranking          = []

  for (const { nome, totalE, totalG } of usuarios) {
    const nomeExibicao = obterNomeExibicaoUsuario(nome) ?? "Usuário"
    const saldo = totalE - totalG
    totalEntradasGeral += totalE
    totalGastosGeral   += totalG
    ranking.push({ nome: nomeExibicao, totalG })
    textoPessoas += `👤 *${nomeExibicao}*\nEntradas: R$ ${fmtValor(totalE)} | Gastos: R$ ${fmtValor(totalG)} | Saldo: ${fmtSaldo(saldo)}\n\n`
  }

  ranking.sort((a, b) => b.totalG - a.totalG)

  const saldoGeral    = totalEntradasGeral - totalGastosGeral
  const rankingTexto  = ranking.length
    ? ranking.map((r, i) => `${i + 1}. ${r.nome} — R$ ${fmtValor(r.totalG)}`).join("\n")
    : "_Nenhum gasto registrado._"

  return {
    resumo:
`📊 *RELATÓRIO GERAL DO MÊS*

💰 Total entradas: R$ ${fmtValor(totalEntradasGeral)}
💸 Total gastos:   R$ ${fmtValor(totalGastosGeral)}
🧾 Saldo geral:    ${fmtSaldo(saldoGeral)}

${textoPessoas.trim()}`,
    ranking:
`🏆 *QUEM MAIS GASTOU NO MÊS*

${rankingTexto}`,
  }
}
