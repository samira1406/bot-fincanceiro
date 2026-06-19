export const AI_INTERPRETER_VERSION = "v0.5.2-beta-normalizacao-canonica"

export const AI_INTENTS = Object.freeze([
  "registrar_despesa",
  "registrar_receita",
  "consultar_gastos",
  "consultar_receitas",
  "consultar_saldo",
  "fechamento",
  "gerar_planilha",
  "corrigir_lancamento",
  "excluir_lancamento",
  "ajuda",
  "desconhecido",
])

export const AI_TRANSACTION_TYPES = Object.freeze(["despesa", "receita"])
export const AI_DATE_REFERENCES = Object.freeze([
  "hoje",
  "ontem",
  "anteontem",
  "esta_semana",
  "semana_passada",
  "este_mes",
  "mes_passado",
])
export const AI_QUERY_METRICS = Object.freeze([
  "gastos",
  "receitas",
  "saldo",
  "maior_gasto",
  "top_categorias",
  "fechamento",
])
export const AI_QUERY_PERIODS = Object.freeze([
  "hoje",
  "ontem",
  "ultimos_7_dias",
  "esta_semana",
  "semana_passada",
  "este_mes",
  "mes_passado",
])

function chaveAlias(valor) {
  if (valor === null || valor === undefined) return null
  return String(valor)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}0-9]+/gu, "_")
    .replace(/^_+|_+$/g, "")
}

function criarNormalizador(valoresCanonicos, aliases) {
  const mapa = new Map(valoresCanonicos.map(valor => [valor, valor]))
  for (const [alias, canonico] of Object.entries(aliases)) {
    mapa.set(chaveAlias(alias), canonico)
  }
  return valor => {
    const chave = chaveAlias(valor)
    if (chave === null) return null
    return mapa.get(chave) ?? chave
  }
}

export const normalizarAIIntent = criarNormalizador(AI_INTENTS, {
  consulta_gastos: "consultar_gastos",
  consulta_gasto: "consultar_gastos",
  consultar_gasto: "consultar_gastos",
  consultar_despesas: "consultar_gastos",
  consulta_despesas: "consultar_gastos",
  ver_gastos: "consultar_gastos",
  quanto_gastei: "consultar_gastos",
  gastos_categoria: "consultar_gastos",
  consulta_receitas: "consultar_receitas",
  consultar_receita: "consultar_receitas",
  ver_receitas: "consultar_receitas",
  quanto_recebi: "consultar_receitas",
  saldo: "consultar_saldo",
  consulta_saldo: "consultar_saldo",
  ver_saldo: "consultar_saldo",
  relatorio_mensal: "fechamento",
  fechar_mes: "fechamento",
  analise_mes: "fechamento",
  exportar_planilha: "gerar_planilha",
  baixar_planilha: "gerar_planilha",
  excel: "gerar_planilha",
  unknown: "desconhecido",
  nao_entendi: "desconhecido",
})

export const normalizarAIMetric = criarNormalizador(AI_QUERY_METRICS, {
  gasto: "gastos",
  despesa: "gastos",
  despesas: "gastos",
  receita: "receitas",
  entrada: "receitas",
  entradas: "receitas",
  saldo_atual: "saldo",
  top: "top_categorias",
  ranking: "top_categorias",
  categorias: "top_categorias",
  ranking_categorias: "top_categorias",
})

const aliasesPeriodo = {
  esse_mes: "este_mes",
  mes_atual: "este_mes",
  atual: "este_mes",
  mes_passado: "mes_passado",
  essa_semana: "esta_semana",
  semana_atual: "esta_semana",
  ultimos7: "ultimos_7_dias",
  ultimos_7: "ultimos_7_dias",
  ultimos_7_dias: "ultimos_7_dias",
  hj: "hoje",
}

export const normalizarAIPeriod = criarNormalizador(
  AI_QUERY_PERIODS,
  aliasesPeriodo
)
export const normalizarAIDateReference = criarNormalizador(
  AI_DATE_REFERENCES,
  aliasesPeriodo
)

export const normalizarAITransactionType = criarNormalizador(
  AI_TRANSACTION_TYPES,
  {
    gasto: "despesa",
    saida: "despesa",
    pago: "despesa",
    entrada: "receita",
    recebido: "receita",
  }
)

const nullableString = (maxLength = 80) => ({
  anyOf: [
    { type: "string", maxLength },
    { type: "null" },
  ],
})

const nullableEnum = valores => ({
  anyOf: [
    { type: "string", enum: valores },
    { type: "null" },
  ],
})

export const AI_INTERPRETER_JSON_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    intent: { type: "string", enum: AI_INTENTS },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_confirmation: { type: "boolean" },
    reason: { type: "string", maxLength: 300 },
    transaction: {
      type: "object",
      properties: {
        type: nullableEnum(AI_TRANSACTION_TYPES),
        amount: {
          anyOf: [
            { type: "number", minimum: 0 },
            { type: "null" },
          ],
        },
        category: nullableString(80),
        description: nullableString(120),
        date_reference: nullableEnum(AI_DATE_REFERENCES),
      },
      required: [
        "type",
        "amount",
        "category",
        "description",
        "date_reference",
      ],
      additionalProperties: false,
    },
    query: {
      type: "object",
      properties: {
        metric: nullableEnum(AI_QUERY_METRICS),
        category: nullableString(80),
        period: nullableEnum(AI_QUERY_PERIODS),
      },
      required: ["metric", "category", "period"],
      additionalProperties: false,
    },
    clarification: {
      type: "object",
      properties: {
        question: nullableString(200),
        options: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 80 },
          maxItems: 4,
        },
      },
      required: ["question", "options"],
      additionalProperties: false,
    },
  },
  required: [
    "intent",
    "confidence",
    "needs_confirmation",
    "reason",
    "transaction",
    "query",
    "clarification",
  ],
  additionalProperties: false,
})
