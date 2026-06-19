function normalizarTexto(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}0-9]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const CATEGORIAS = Object.freeze([
  {
    category: "mercado",
    type: "gasto",
    aliases: [
      "mercado", "mercd", "merc", "supermercado", "super mercado",
      "compra mercado", "compras mercado", "feira", "atacadao", "assai",
      "max atacadista", "compra do mes",
    ],
  },
  {
    category: "ifood",
    type: "gasto",
    aliases: [
      "ifood", "ifod", "ifodi", "i food", "delivery", "lanche app",
    ],
  },
  {
    category: "uber",
    type: "gasto",
    aliases: ["uber", "ubber", "transporte app", "corrida"],
  },
  {
    category: "farmacia",
    type: "gasto",
    aliases: [
      "farmacia", "farma", "remedio", "medicamentos",
    ],
  },
  {
    category: "internet",
    type: "gasto",
    aliases: [
      "internet", "wifi", "wi fi", "net", "claro", "vivo", "tim",
      "oi fibra", "internet casa",
    ],
  },
  {
    category: "petshop",
    type: "gasto",
    aliases: ["petshop", "pet shop", "pet", "racao"],
  },
  {
    category: "netflix",
    type: "gasto",
    aliases: ["netflix", "netiflix"],
  },
  {
    category: "aluguel",
    type: "gasto",
    aliases: ["aluguel", "alugel", "moradia aluguel"],
  },
  {
    category: "condominio",
    type: "gasto",
    aliases: ["condominio", "cond", "taxa condominio"],
  },
  {
    category: "alimentacao",
    type: "gasto",
    aliases: [
      "alimentacao", "alimento", "comida", "restaurante", "lanche",
      "pizza", "padaria", "acai", "almoco", "jantar",
    ],
  },
  {
    category: "transporte",
    type: "gasto",
    aliases: [
      "transporte", "99", "taxi", "gasolina", "posto", "combustivel",
      "estacionamento", "onibus",
    ],
  },
  {
    category: "moradia",
    type: "gasto",
    aliases: ["moradia", "luz", "energia", "agua"],
  },
  {
    category: "saude",
    type: "gasto",
    aliases: ["saude", "consulta", "exame", "medico"],
  },
  {
    category: "pets",
    type: "gasto",
    aliases: ["pets", "veterinario"],
  },
  {
    category: "lazer",
    type: "gasto",
    aliases: ["lazer", "cinema", "jogo", "role", "bar", "passeio"],
  },
  {
    category: "assinaturas",
    type: "gasto",
    aliases: [
      "assinaturas", "spotify", "amazon prime", "disney", "assinatura",
    ],
  },
  {
    category: "freelance",
    type: "entrada",
    aliases: [
      "freelance", "freela", "frila", "freelas", "frilance",
      "trabalho extra", "job", "free",
    ],
  },
  {
    category: "salario",
    type: "entrada",
    aliases: [
      "salario", "salar", "pagamento", "holerite",
    ],
  },
  {
    category: "comissao",
    type: "entrada",
    aliases: [
      "comissao", "comisionamento", "comissionamento", "comissao venda",
    ],
  },
  {
    category: "pix",
    type: "entrada",
    aliases: ["pix"],
  },
  {
    category: "servico",
    type: "entrada",
    aliases: ["cliente", "servico"],
  },
  {
    category: "consultoria",
    type: "entrada",
    aliases: ["consultoria"],
  },
  {
    category: "bonus",
    type: "entrada",
    aliases: ["bonus"],
  },
  {
    category: "extra",
    type: "entrada",
    aliases: ["extra"],
  },
  {
    category: "receita",
    type: "entrada",
    aliases: ["receita"],
  },
  {
    category: "entrada",
    type: "entrada",
    aliases: ["entrada"],
  },
  {
    category: "deposito",
    type: "entrada",
    aliases: ["deposito"],
  },
])

const INDICE_ALIAS = CATEGORIAS.flatMap(regra => {
  const aliases = new Set([regra.category, ...regra.aliases])
  return [...aliases].map(alias => ({
    alias: normalizarTexto(alias),
    category: regra.category,
    type: regra.type,
  }))
})

function tipoNormalizado(tipo) {
  const valor = normalizarTexto(tipo)
  if (["entrada", "receita", "recebido"].includes(valor)) return "entrada"
  if (["gasto", "despesa", "saida", "pago"].includes(valor)) return "gasto"
  return null
}

function distanciaLevenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let anterior = Array.from({ length: b.length + 1 }, (_, indice) => indice)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(
        atual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    anterior = atual
  }
  return anterior[b.length]
}

function candidatosPorTipo(tipo) {
  const movimento = tipoNormalizado(tipo)
  return movimento
    ? INDICE_ALIAS.filter(item => item.type === movimento)
    : INDICE_ALIAS
}

function melhorFuzzy(chave, candidatos) {
  if (chave.length < 4 || chave.length > 32) return null

  const porCategoria = new Map()
  for (const candidato of candidatos) {
    const tamanho = Math.max(chave.length, candidato.alias.length)
    const confidence = 1 -
      (distanciaLevenshtein(chave, candidato.alias) / tamanho)
    const atual = porCategoria.get(candidato.category)
    if (!atual || confidence > atual.confidence) {
      porCategoria.set(candidato.category, {
        ...candidato,
        confidence,
      })
    }
  }

  const ordenados = [...porCategoria.values()]
    .sort((a, b) => b.confidence - a.confidence)
  const melhor = ordenados[0]
  const segundo = ordenados[1]
  if (!melhor || melhor.confidence < 0.82) return null
  if (segundo && melhor.confidence - segundo.confidence < 0.08) return null
  return melhor
}

export function normalizarCategoriaCanonica(
  input,
  { tipo = null } = {}
) {
  const original = String(input ?? "").trim()
  const chave = normalizarTexto(original)
  if (!chave) {
    return {
      category: "",
      confidence: 0,
      source: "unknown",
      original,
    }
  }

  const candidatos = candidatosPorTipo(tipo)
  const exato = candidatos.find(item =>
    item.category === chave && item.alias === chave
  )
  if (exato) {
    return {
      category: exato.category,
      confidence: 1,
      source: "exact",
      original,
    }
  }

  const alias = candidatos.find(item => item.alias === chave)
  if (alias) {
    return {
      category: alias.category,
      confidence: 0.98,
      source: "alias",
      original,
    }
  }

  const comLimites = ` ${chave} `
  const dentroDoTexto = [...candidatos]
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(item => comLimites.includes(` ${item.alias} `))
  if (dentroDoTexto) {
    return {
      category: dentroDoTexto.category,
      confidence: 0.96,
      source: "alias",
      original,
    }
  }

  const fuzzy = melhorFuzzy(chave, candidatos)
  if (fuzzy) {
    return {
      category: fuzzy.category,
      confidence: Number(fuzzy.confidence.toFixed(2)),
      source: "fuzzy",
      original,
    }
  }

  return {
    category: original.toLowerCase().replace(/\s+/g, " "),
    confidence: 0,
    source: "unknown",
    original,
  }
}

export const normalizeCategory = normalizarCategoriaCanonica

export function detectarCategoriaCanonica(texto, tipo) {
  const resultado = normalizarCategoriaCanonica(texto, { tipo })
  return resultado.source === "unknown" ? null : resultado.category
}

export function normalizarCategoriaPorPalavraChave(texto, tipo = "gasto") {
  return normalizarCategoriaCanonica(texto, { tipo }).category
}

export function categoriaEhEntrada(texto) {
  const resultado = normalizarCategoriaCanonica(texto, { tipo: "entrada" })
  return resultado.source !== "unknown"
}
