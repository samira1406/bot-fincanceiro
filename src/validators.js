import { config } from "./config.js"

function normalizarComando(texto) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function normalizarEspacos(texto) {
  return texto.trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizarCategoriaInput(categoria) {
  return String(categoria ?? "").trim().toLowerCase()
}

function removerAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function categoriaValida(categoria) {
  return /^[\p{L}0-9\-_]+$/u.test(categoria)
}

const categoriasCanonicas = {
  mercado:      "mercado",
  supermercado: "mercado",
  feira:        "mercado",

  alimentacao:  "alimentacao",
  alimento:     "alimentacao",
  comida:       "alimentacao",
  restaurante:  "alimentacao",
  delivery:     "alimentacao",
  ifood:        "alimentacao",

  uber:         "transporte",
  taxi:         "transporte",
  onibus:       "transporte",
  transporte:   "transporte",
  gasolina:     "transporte",
  combustivel:  "transporte",

  farmacia:     "farmacia",
  remedio:      "farmacia",
  internet:     "internet",
  aluguel:      "aluguel",
}

const entradasCanonicas = {
  salario:   "salario",
  pix:       "pix",
  freela:    "freela",
  free:      "free",
  freelance: "freelance",
  comissao:  "comissao",
  comissionamento: "comissionamento",
  consultoria: "consultoria",
  bonus:     "bonus",
  extra:     "extra",
  receita:   "receita",
  entrada:   "entrada",
}

const PADRAO_VALOR = String.raw`(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)`

const categoriasComunsFallback = new Set([
  "mercado", "supermercado", "feira", "aluguel", "internet", "petshop",
  "farmacia", "remedio", "uber", "taxi", "onibus", "gasolina",
  "combustivel", "transporte", "restaurante", "ifood", "padaria",
  "luz", "agua", "energia", "telefone", "academia", "escola",
  "faculdade", "saude", "lazer", "roupa", "roupas", "casa",
])

const agradecimentos = new Set([
  "obrigado", "obrigada", "valeu", "show", "beleza", "ok", "okay",
  "certo", "perfeito", "otimo", "ótimo", "blz",
])

const typosComandos = new Map([
  ["resumoo", "resumo"],
  ["resmo", "resumo"],
  ["rezumo", "resumo"],
  ["planiha", "planilha"],
  ["planila", "planilha"],
  ["plannilha", "planilha"],
  ["exel", "excel"],
  ["ecxel", "excel"],
  ["hstoric", "historico"],
  ["historco", "historico"],
  ["istorico", "historico"],
  ["ajdua", "ajuda"],
  ["ajda", "ajuda"],
  ["meniu", "menu"],
])

const descricoesAmbiguasTipo = new Set([
  "cliente", "venda", "servico", "serviço", "trabalho", "manutencao",
  "manutenção", "projeto", "pagamento",
])

const respostasCategoriaInvalidas = new Set([
  "sei la", "sei lá", "nao sei", "não sei", "qualquer", "talvez",
  "nao lembro", "não lembro", "depois vejo",
])

const palavrasIniciaisNomeInvalido = new Set([
  "oi", "ola", "bom", "boa", "opa", "e",
  "gastei", "paguei", "comprei", "recebi", "entrou", "ganhei", "caiu",
  "depositaram", "despesa", "saida", "salario", "resumo", "saldo",
  "relatorio", "historico", "extrato", "ajuda", "comandos",
  "exportar", "baixar", "gerar", "planilha", "meta", "metas",
  "excluir", "corrigir", "corrige", "alterar", "apagar", "deletar",
  "entrada", "receita", "xlsx", "excel", "csv",
  ...agradecimentos,
  ...typosComandos.keys(),
])

const termosFinanceirosNome = new Set([
  "mercado", "supermercado", "feira", "alimentacao", "alimento",
  "comida", "restaurante", "delivery", "ifood", "uber", "taxi",
  "onibus", "transporte", "gasolina", "combustivel", "farmacia",
  "remedio", "internet", "aluguel", "pix", "freela", "free", "freelance",
  "comissao", "comissionamento", "consultoria",
  "bonus", "extra", "poupanca", "caixinha",
  ...categoriasComunsFallback,
])

function normalizarCategoria(categoria) {
  const valor = normalizarCategoriaInput(categoria)
  const chave = removerAcentos(valor)
  return categoriasCanonicas[chave] ?? valor
}

function normalizarEntrada(nome) {
  const valor = normalizarCategoriaInput(nome)
  const chave = removerAcentos(valor)
  return entradasCanonicas[chave] ?? valor
}

function isEntrada(nome) {
  const entrada = normalizarEntrada(nome)
  return config.palavrasEntrada.includes(entrada) || Object.values(entradasCanonicas).includes(entrada)
}

function montarEntrada(nomeRaw, valorRaw) {
  const valor = parseValorSimples(valorRaw)
  const nome = normalizarEntrada(nomeRaw)
  const categoria = nome

  if (!valor || !categoriaValida(nome) || !categoriaValida(categoria)) return null
  return { tipo: "entrada", nome, categoria, valor }
}

function normalizarDescricaoLancamento(texto, fallback) {
  const descricao = removerAcentos(normalizarCategoriaInput(texto))
    .replace(/^(?:em|de|por|do|da|com|referente\s+a)\s+/u, "")
    .replace(/[^\p{L}0-9\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")

  return descricao || fallback
}

function montarEntradaNatural(descricaoRaw, valorRaw, fallback = "entrada") {
  return montarEntrada(normalizarDescricaoLancamento(descricaoRaw, fallback), valorRaw)
}

function montarDespesaNatural(descricaoRaw, valorRaw) {
  const valor = parseValorSimples(valorRaw)
  const nome = normalizarDescricaoLancamento(descricaoRaw, "")
  const categoria = normalizarCategoria(nome)

  if (!valor || !nome || !categoriaValida(nome) || !categoriaValida(categoria)) return null
  return { nome, categoria, valor }
}

/**
 * Valida e parseia uma mensagem de lançamento.
 *
 * Formatos aceitos:
 *   "mercado 120,50"              → { nome:"mercado", categoria:"mercado", valor:120.50 }
 *   "mercado alimentacao 120,50"  → { nome:"mercado", categoria:"alimentacao", valor:120.50 }
 *   "120,50 mercado"              → { nome:"mercado", categoria:"mercado", valor:120.50 }
 *
 * @param {string} mensagem
 * @returns {{ nome:string, categoria:string, valor:number }|null}
 */
function extrairNomeDeclarado(texto) {
  const match = texto.match(/^(?:meu nome (?:é|e)|me chamo|sou|pode me chamar de)\s+(.+)$/iu)
  return match ? match[1] : texto
}

function capitalizarNomeUsuario(texto) {
  return texto
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s'.-])(\p{L})/gu, (_, prefixo, letra) => prefixo + letra.toLocaleUpperCase("pt-BR"))
}

/**
 * Normaliza um texto para nome de usuário apenas quando ele parece um nome real.
 * @param {string|null|undefined} nome
 * @returns {string|null}
 */
export function normalizarNomeUsuario(nome) {
  const bruto = String(nome ?? "").trim().replace(/\s+/g, " ")
  if (!bruto) return null

  const candidato = extrairNomeDeclarado(bruto).trim().replace(/\s+/g, " ")
  const chave = removerAcentos(candidato).toLowerCase()
  const palavras = chave.split(/\s+/).filter(Boolean)

  if (candidato.length < 3 || candidato.length > 50) return null
  if (/\d/.test(candidato)) return null
  if (!/^[\p{L}\s'.-]+$/u.test(candidato)) return null
  if (palavrasIniciaisNomeInvalido.has(palavras[0])) return null
  if (palavras.some(palavra => termosFinanceirosNome.has(palavra))) return null
  if (parseSaudacao(candidato) || parseAjuda(candidato) || parseExportacao(candidato) ||
      parseCorrecaoUltimo(candidato) || parseMetaCategoria(candidato) ||
      parseLancamento(candidato)) {
    return null
  }

  return capitalizarNomeUsuario(candidato)
}

/**
 * Verifica se um texto pode ser salvo/exibido como nome de usuário.
 * @param {string|null|undefined} nome
 * @returns {boolean}
 */
export function ehNomeUsuarioValido(nome) {
  return normalizarNomeUsuario(nome) !== null
}

export function parseLancamento(mensagem) {
  const texto = normalizarEspacos(mensagem)
  if (!texto) return null

  const entradaNatural = texto.match(new RegExp(
    `^(recebi|entrou|ganhei|caiu|depositaram)\\s+(${PADRAO_VALOR})` +
    `(?:\\s+(?:(?:em|de|por|do|da|com|referente\\s+a)\\s+)?([\\p{L}][\\p{L}0-9 _-]*))?$`,
    "u"
  ))
  if (entradaNatural) {
    const fallback = entradaNatural[1] === "depositaram" ? "deposito" : "entrada"
    return montarEntradaNatural(entradaNatural[3], entradaNatural[2], fallback)
  }

  const entradaNomePrimeiro = texto.match(new RegExp(
    `^caiu\\s+([\\p{L}][\\p{L}0-9 _-]*)\\s+(${PADRAO_VALOR})$`,
    "u"
  ))
  if (entradaNomePrimeiro) {
    return montarEntradaNatural(entradaNomePrimeiro[1], entradaNomePrimeiro[2])
  }

  const receitaDeclarada = texto.match(new RegExp(
    `^(receita|entrada)\\s+(${PADRAO_VALOR})` +
    `(?:\\s+(?:(?:em|de|por|do|da|com|referente\\s+a)\\s+)?([\\p{L}][\\p{L}0-9 _-]*))?$`,
    "u"
  ))
  if (receitaDeclarada) {
    return montarEntradaNatural(receitaDeclarada[3], receitaDeclarada[2], receitaDeclarada[1])
  }

  const gastoNatural = texto.match(new RegExp(
    `^(gastei|paguei|comprei|despesa|saida|saída)\\s+(${PADRAO_VALOR})` +
    `(?:\\s+(?:(?:no|na|em|com|de|do|da|por)\\s+)?([\\p{L}][\\p{L}0-9 _-]*))$`,
    "u"
  ))
  if (gastoNatural) {
    return montarDespesaNatural(gastoNatural[3], gastoNatural[2])
  }

  const valorPrimeiro = texto.match(new RegExp(
    `^(${PADRAO_VALOR})\\s+([\\p{L}0-9_-]+)$`,
    "u"
  ))
  if (valorPrimeiro) {
    const valor = parseValorSimples(valorPrimeiro[1])
    const nome = normalizarCategoriaInput(valorPrimeiro[2])
    if (isEntrada(nome)) {
      return montarEntrada(nome, valorPrimeiro[1])
    }

    const categoria = normalizarCategoria(nome)
    if (!valor || !categoriaValida(categoria)) return null
    return { nome, categoria, valor }
  }

  const partes = texto.split(/\s+/)
  if (partes.length < 2) return null

  const valor = parseValorSimples(partes[partes.length - 1])

  if (!valor) return null

  const nome = removerAcentos(partes[0])
  if (partes.length === 2 && isEntrada(nome)) {
    return montarEntrada(nome, partes[1])
  }

  const categoria = partes.length >= 3
    ? normalizarCategoria(partes[1])
    : (config.palavrasEntrada.includes(nome) ? "geral" : normalizarCategoria(nome))

  if (!categoriaValida(nome))      return null
  if (!categoriaValida(categoria)) return null

  return { nome, categoria, valor }
}

/**
 * Parseia um valor monetário simples de uma string.
 * @param {string} texto
 * @returns {number|null}
 */
export function parseValorSimples(texto) {
  if (!texto) return null
  const bruto = String(texto).trim().replace(/\s+/g, "")
  if (!new RegExp(`^${PADRAO_VALOR}$`).test(bruto)) return null

  let normalizado = bruto
  if (bruto.includes(".") && bruto.includes(",")) {
    normalizado = bruto.replace(/\./g, "").replace(",", ".")
  } else if (bruto.includes(",")) {
    normalizado = bruto.replace(",", ".")
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(bruto)) {
    normalizado = bruto.replace(/\./g, "")
  }

  const valor = parseFloat(normalizado)
  if (!Number.isFinite(valor) || valor <= 0 || valor > config.valorMaximo) return null
  return valor
}

/**
 * Identifica uma mensagem composta somente por um valor monetário.
 * @param {string} mensagem
 * @returns {{ valor:number }|null}
 */
export function parseValorAmbiguo(mensagem) {
  const texto = normalizarEspacos(String(mensagem ?? ""))
  const match = texto.match(new RegExp(`^(?:r\\$\\s*)?(${PADRAO_VALOR})(?:\\s*reais?)?$`, "u"))
  const valor = match ? parseValorSimples(match[1]) : null
  return valor ? { valor } : null
}

function extrairValorComDescricaoAmbigua(mensagem) {
  const texto = normalizarEspacos(String(mensagem ?? ""))

  let match = texto.match(new RegExp(`^(${PADRAO_VALOR})\\s+(.+)$`, "u"))
  if (match) {
    const valor = parseValorSimples(match[1])
    const descricaoRaw = match[2].replace(/\b(?:talvez|acho|seria)\b/gu, "").trim()
    const chaveDescricao = removerAcentos(descricaoRaw)
    if (!valor || !descricaoRaw) return null
    if (categoriasComunsFallback.has(chaveDescricao) || isEntrada(chaveDescricao)) return null

    const descricao = normalizarDescricaoLancamento(descricaoRaw, "")
    return descricao ? {
      motivo: "valor_com_descricao_ambigua",
      valor,
      descricao,
      categoria: normalizarCategoria(descricao),
    } : null
  }

  match = texto.match(new RegExp(`^(.+?)\\s+(${PADRAO_VALOR})(?:\\s+(.+))?$`, "u"))
  if (!match) return null

  const descricaoRaw = match[1].trim()
  const complemento = match[3]?.trim() ?? ""
  const chaveDescricao = removerAcentos(descricaoRaw)
  const temIncerteza = /\b(?:talvez|acho|seria)\b/u.test(removerAcentos(complemento))
  if (!temIncerteza && !descricoesAmbiguasTipo.has(descricaoRaw) &&
      !descricoesAmbiguasTipo.has(chaveDescricao)) {
    return null
  }

  const valor = parseValorSimples(match[2])
  const descricao = normalizarDescricaoLancamento(descricaoRaw, "")
  return valor && descricao ? {
    motivo: "valor_com_descricao_ambigua",
    valor,
    descricao,
    categoria: normalizarCategoria(descricao),
  } : null
}

/**
 * Classifica mensagens que chegaram ao fallback sem usar IA externa.
 * @param {string} mensagem
 * @param {{ pendencia?:object|null }} [contexto]
 * @returns {object}
 */
export function classificarMensagemDesconhecida(mensagem, contexto = {}) {
  const texto = normalizarEspacos(String(mensagem ?? ""))
  const normalizado = normalizarComando(texto).replace(/\s+/g, " ")

  if (contexto.pendencia) {
    return { motivo: "pendencia_incompleta", pendencia: contexto.pendencia }
  }

  if (agradecimentos.has(texto) || agradecimentos.has(normalizado)) {
    return { motivo: "agradecimento" }
  }

  if (parseSaudacao(texto)) {
    return { motivo: "saudacao" }
  }

  const comandoSugerido = typosComandos.get(normalizado)
  if (comandoSugerido) {
    return { motivo: "comando_com_typo", comandoSugerido }
  }

  const valorAmbiguo = parseValorAmbiguo(texto)
  if (valorAmbiguo) {
    return { motivo: "valor_sem_tipo", ...valorAmbiguo }
  }

  const valorComDescricao = extrairValorComDescricaoAmbigua(texto)
  if (valorComDescricao) return valorComDescricao

  if (categoriasComunsFallback.has(normalizado)) {
    return {
      motivo: "categoria_sem_valor",
      categoria: normalizarCategoria(normalizado),
    }
  }

  return { motivo: "desconhecido_total" }
}

/**
 * Interpreta a escolha do tipo de um lançamento pendente.
 * @param {string} mensagem
 * @returns {"entrada"|"gasto"|null}
 */
export function parseTipoLancamentoPendente(mensagem) {
  const normalizado = normalizarComando(String(mensagem ?? "")).replace(/\s+/g, " ")
  const entradas = new Set(["1", "entrada", "receita", "recebido", "ganho"])
  const gastos = new Set(["2", "gasto", "despesa", "saida", "pago"])

  if (entradas.has(normalizado)) return "entrada"
  if (gastos.has(normalizado)) return "gasto"
  return null
}

/**
 * Reconhece comandos que cancelam um lançamento pendente.
 * @param {string} mensagem
 * @returns {boolean}
 */
export function isCancelamentoPendencia(mensagem) {
  const normalizado = normalizarComando(String(mensagem ?? "")).replace(/\s+/g, " ")
  return new Set(["cancelar", "cancela", "sair", "voltar"]).has(normalizado)
}

/**
 * Normaliza a categoria/descrição informada na segunda etapa da pendência.
 * @param {string} mensagem
 * @returns {{ nome:string, categoria:string }|null}
 */
export function parseCategoriaLancamentoPendente(mensagem) {
  const texto = normalizarEspacos(String(mensagem ?? ""))
  const normalizado = normalizarComando(texto).replace(/\s+/g, " ")
  if (respostasCategoriaInvalidas.has(texto) || respostasCategoriaInvalidas.has(normalizado)) {
    return null
  }

  const nome = normalizarDescricaoLancamento(texto, "")
  if (!nome || !/\p{L}/u.test(nome)) return null

  const categoria = normalizarCategoria(nome)
  if (!categoriaValida(nome) || !categoriaValida(categoria)) return null
  return { nome, categoria }
}

/**
 * Parseia comandos de correção do último lançamento.
 * @param {string} mensagem
 * @returns {{ valor:number }|null}
 */
export function parseCorrecaoUltimo(mensagem) {
  const match = normalizarComando(mensagem).match(/^(corrigir|corrige|alterar|editar) ultimo para (.+)$/)
  if (!match) return null

  const valor = parseValorSimples(match[2])
  if (!valor) return null

  return { valor }
}

/**
 * Parseia comandos de ajuda/onboarding.
 * @param {string} mensagem
 * @returns {{ tipo:"ajuda" }|null}
 */
export function parseAjuda(mensagem) {
  const normalizado = normalizarComando(mensagem).replace(/\s+/g, " ")
  const comandos = new Set([
    "ajuda",
    "comandos",
    "como usar",
    "menu",
    "inicio",
    "start",
  ])

  return comandos.has(normalizado) ? { tipo: "ajuda" } : null
}

/**
 * Parseia saudações usadas para iniciar ou retomar o onboarding.
 * @param {string} mensagem
 * @returns {{ tipo:"saudacao" }|null}
 */
export function parseSaudacao(mensagem) {
  const normalizado = normalizarComando(mensagem).replace(/\s+/g, " ")
  const saudacoes = new Set([
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "opa",
    "e ai",
    "start",
    "inicio",
  ])

  return saudacoes.has(normalizado) ? { tipo: "saudacao" } : null
}

/**
 * Parseia comandos de exportação CSV.
 * @param {string} mensagem
 * @returns {{ tipo:"exportacao", formato:"csv"|"xlsx" }|null}
 */
export function parseExportacao(mensagem) {
  const normalizado = normalizarComando(mensagem).replace(/\s+/g, " ")
  const comandosCSV = new Set([
    "csv",
    "exportar csv",
    "baixar csv",
  ])
  const comandosXLSX = new Set([
    "exportar",
    "planilha",
    "excel",
    "baixar planilha",
    "gerar planilha",
    "minha planilha",
    "exportar planilha",
    "planilha bonita",
    "planilha excel",
    "exportar excel",
    "xlsx",
    "exportar xlsx",
  ])

  if (comandosCSV.has(normalizado)) return { tipo: "exportacao", formato: "csv" }
  if (comandosXLSX.has(normalizado)) return { tipo: "exportacao", formato: "xlsx" }
  return null
}

function montarMetaCategoria(categoriaRaw, valorRaw) {
  const categoria = normalizarCategoria(categoriaRaw)
  if (!categoria || !categoriaValida(categoria)) {
    return { tipo: "meta_categoria", erro: "categoria" }
  }

  const valor = parseValorSimples(valorRaw)
  if (!valor) {
    return { tipo: "meta_categoria", erro: "valor", categoria }
  }

  return { tipo: "meta_categoria", categoria, valor }
}

/**
 * Parseia comandos de meta mensal por categoria.
 * @param {string} mensagem
 * @returns {{ tipo:"meta_categoria", categoria?:string, valor?:number, erro?:string }|null}
 */
export function parseMetaCategoria(mensagem) {
  const texto = normalizarEspacos(mensagem)
  const normalizado = normalizarComando(mensagem).replace(/\s+/g, " ")

  if (/^meta\s+(ver|\d)/.test(normalizado)) return null
  if (/^(metas|minhas metas|ver metas)$/.test(normalizado)) return null

  let match = texto.match(/^meta\s+(.+?)\s+(\d+(?:[,.]\d{1,2})?)$/u)
  if (match) return montarMetaCategoria(match[1], match[2])

  match = texto.match(/^criar\s+meta\s+de\s+(.+?)\s+para\s+(.+)$/u)
  if (match) return montarMetaCategoria(match[2], match[1])

  match = texto.match(/^minha\s+meta\s+de\s+(.+?)\s+(?:é|e)\s+(.+)$/u)
  if (match) return montarMetaCategoria(match[1], match[2])

  match = texto.match(/^limite\s+(.+?)\s+(\d+(?:[,.]\d{1,2})?)$/u)
  if (match) return montarMetaCategoria(match[1], match[2])

  if (/^meta\s+[\p{L}0-9\-_]+$/u.test(texto) || /^limite\s+[\p{L}0-9\-_]+$/u.test(texto)) {
    return { tipo: "meta_categoria", erro: "valor", categoria: texto.split(" ")[1] }
  }

  if (/^criar\s+meta\s+de\s+\d+(?:[,.]\d{1,2})?$/.test(texto)) {
    return { tipo: "meta_categoria", erro: "categoria" }
  }

  if (/^(meta|criar meta|minha meta|limite)\b/.test(normalizado)) {
    return { tipo: "meta_categoria", erro: "valor" }
  }

  return null
}
