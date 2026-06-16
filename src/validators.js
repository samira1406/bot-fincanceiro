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
  freelance: "freela",
  bonus:     "bonus",
  extra:     "extra",
  receita:   "receita",
  entrada:   "entrada",
}

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
export function parseLancamento(mensagem) {
  const texto = normalizarEspacos(mensagem)
  const entradaValorPrimeiro = texto.match(/^(?:recebi|entrou|ganhei|caiu)\s+(\d+(?:[,.]\d{1,2})?)\s+([\p{L}0-9\-_]+)$/u)
  if (entradaValorPrimeiro) {
    return montarEntrada(entradaValorPrimeiro[2], entradaValorPrimeiro[1])
  }

  const entradaNomePrimeiro = texto.match(/^caiu\s+([\p{L}0-9\-_]+)\s+(\d+(?:[,.]\d{1,2})?)$/u)
  if (entradaNomePrimeiro) {
    return montarEntrada(entradaNomePrimeiro[1], entradaNomePrimeiro[2])
  }

  const gastoNatural = texto.match(/^gastei\s+(\d+(?:[,.]\d{1,2})?)\s+(?:no|na|em|com)\s+([\p{L}0-9\-_]+)$/u)
  if (gastoNatural) {
    const valor = parseValorSimples(gastoNatural[1])
    const nome = normalizarCategoriaInput(gastoNatural[2])
    const categoria = normalizarCategoria(nome)
    if (!valor || !categoriaValida(categoria)) return null
    return { nome, categoria, valor }
  }

  const valorPrimeiro = texto.match(/^(\d+(?:[,.]\d{1,2})?)\s+([\p{L}0-9\-_]+)$/u)
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

  const nome      = partes[0]
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
  const normalizado = texto.trim().replace(",", ".")
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null
  const valor = parseFloat(normalizado)
  if (!Number.isFinite(valor) || valor <= 0 || valor > config.valorMaximo) return null
  return valor
}

/**
 * Parseia comandos de correção do último lançamento.
 * @param {string} mensagem
 * @returns {{ valor:number }|null}
 */
export function parseCorrecaoUltimo(mensagem) {
  const match = normalizarComando(mensagem).match(/^(corrigir|corrige|alterar) ultimo para (.+)$/)
  if (!match) return null

  const valor = parseValorSimples(match[2])
  if (!valor) return null

  return { valor }
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
