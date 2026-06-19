import {
  AI_DATE_REFERENCES,
  AI_INTENTS,
  AI_QUERY_METRICS,
  AI_QUERY_PERIODS,
  AI_TRANSACTION_TYPES,
  normalizarAIDateReference,
  normalizarAIIntent,
  normalizarAIMetric,
  normalizarAIPeriod,
  normalizarAITransactionType,
} from "./aiSchemas.js"
import { analisarJsonObjectSafely } from "./aiProviders/providerUtils.js"
import { normalizarCategoriaCanonica } from "./categoryRules.js"

const CHAVES_RAIZ = [
  "intent",
  "confidence",
  "needs_confirmation",
  "reason",
  "transaction",
  "query",
  "clarification",
]
const CHAVES_TRANSACAO = [
  "type",
  "amount",
  "category",
  "description",
  "date_reference",
]
const CHAVES_CONSULTA = ["metric", "category", "period"]
const CHAVES_CLARIFICACAO = ["question", "options"]
const PADRAO_TEXTO_SUSPEITO =
  /(?:ignore\s+(?:as|the|previous)|system\s+prompt|developer\s+message|api[_ -]?key|authorization\s*:|bearer\s+|\.env\b|<script|```)/iu

function objetoSimples(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
}

function temExatamenteChaves(objeto, chaves) {
  if (!objetoSimples(objeto)) return false
  const recebidas = Object.keys(objeto).sort()
  const esperadas = [...chaves].sort()
  return recebidas.length === esperadas.length &&
    recebidas.every((chave, indice) => chave === esperadas[indice])
}

function temSomenteChaves(objeto, chaves) {
  return objetoSimples(objeto) &&
    Object.keys(objeto).every(chave => chaves.includes(chave))
}

function textoSeguro(valor, limite, { nullable = true } = {}) {
  if (valor === null && nullable) return null
  if (typeof valor !== "string") return undefined
  const texto = valor.trim().replace(/\s+/g, " ")
  if (!texto || texto.length > limite || PADRAO_TEXTO_SUSPEITO.test(texto)) {
    return undefined
  }
  return texto
}

function enumOuNull(valor, permitidos) {
  if (valor === null) return null
  return typeof valor === "string" && permitidos.includes(valor)
    ? valor
    : undefined
}

function camposNulos(objeto) {
  return Object.values(objeto).every(valor => valor === null)
}

function normalizarSubobjeto(valor, chaves, padrao) {
  if (valor === undefined || valor === null) {
    return { ok: true, valor: { ...padrao }, parcial: true }
  }
  if (!temSomenteChaves(valor, chaves)) {
    return { ok: false, erro: "schema_invalido" }
  }
  return {
    ok: true,
    valor: { ...padrao, ...valor },
    parcial: !temExatamenteChaves(valor, chaves),
  }
}

function normalizarObjetoParcial(entrada) {
  if (!temSomenteChaves(entrada, CHAVES_RAIZ)) {
    return { ok: false, erro: "schema_invalido" }
  }

  const transaction = normalizarSubobjeto(
    entrada.transaction,
    CHAVES_TRANSACAO,
    {
      type: null,
      amount: null,
      category: null,
      description: null,
      date_reference: null,
    }
  )
  const query = normalizarSubobjeto(
    entrada.query,
    CHAVES_CONSULTA,
    { metric: null, category: null, period: null }
  )
  const clarification = normalizarSubobjeto(
    entrada.clarification,
    CHAVES_CLARIFICACAO,
    { question: null, options: [] }
  )
  const erro = [transaction, query, clarification].find(item => !item.ok)
  if (erro) return erro

  const confidence = entrada.confidence === undefined ||
      entrada.confidence === null ||
      !Number.isFinite(entrada.confidence)
    ? 0
    : entrada.confidence
  const raizParcial = !temExatamenteChaves(entrada, CHAVES_RAIZ)
  const camposPadronizados =
    entrada.intent === undefined ||
    entrada.intent === null ||
    entrada.intent === "" ||
    entrada.confidence === undefined ||
    entrada.confidence === null ||
    !Number.isFinite(entrada.confidence) ||
    typeof entrada.needs_confirmation !== "boolean" ||
    entrada.reason === undefined ||
    entrada.reason === null
  const parcial =
    raizParcial ||
    camposPadronizados ||
    transaction.parcial ||
    query.parcial ||
    clarification.parcial

  return {
    ok: true,
    parcial,
    valor: {
      intent: entrada.intent === undefined ||
          entrada.intent === null ||
          entrada.intent === ""
        ? "desconhecido"
        : entrada.intent,
      confidence: parcial ? 0 : confidence,
      needs_confirmation: parcial
        ? true
        : typeof entrada.needs_confirmation === "boolean"
        ? entrada.needs_confirmation
        : true,
      reason: entrada.reason === undefined || entrada.reason === null
        ? "Resposta parcial normalizada com seguranca."
        : entrada.reason,
      transaction: transaction.valor,
      query: query.valor,
      clarification: clarification.valor,
    },
  }
}

function classificarFalhaParse(parseStage) {
  if (["empty", "no_json_object", "invalid_type"].includes(parseStage)) {
    return "no_json_object"
  }
  if (["array_rejected", "primitive_rejected"].includes(parseStage)) {
    return "schema_invalido"
  }
  return "json_invalido"
}

function numeroToken(token) {
  const bruto = String(token ?? "").trim()
  let normalizado = bruto
  if (bruto.includes(".") && bruto.includes(",")) {
    normalizado = bruto.replace(/\./g, "").replace(",", ".")
  } else if (bruto.includes(",")) {
    normalizado = bruto.replace(",", ".")
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(bruto)) {
    normalizado = bruto.replace(/\./g, "")
  }
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : null
}

function mensagemContemValor(mensagem, valor) {
  if (!Number.isFinite(valor)) return false
  const tokens = String(mensagem ?? "").match(/\d[\d.,]*/g) ?? []
  return tokens.some(token => {
    const numero = numeroToken(token)
    return numero !== null && Math.abs(numero - valor) < 0.001
  })
}

function validarCompatibilidade(valor) {
  const { intent, transaction, query } = valor
  const registro = intent === "registrar_despesa" || intent === "registrar_receita"
  const consulta = intent === "consultar_gastos" ||
    intent === "consultar_receitas" ||
    intent === "consultar_saldo"

  if (registro) {
    const tipoEsperado = intent === "registrar_despesa" ? "despesa" : "receita"
    if (transaction.type !== tipoEsperado || !camposNulos(query)) return false
    if (transaction.date_reference &&
        !["hoje", "ontem", "anteontem"].includes(transaction.date_reference)) {
      return false
    }
  }

  if (consulta) {
    if (!camposNulos(transaction)) return false
    if (intent === "consultar_gastos" &&
        !["gastos", "maior_gasto", "top_categorias"].includes(query.metric)) {
      return false
    }
    if (intent === "consultar_receitas" &&
        !["receitas", "top_categorias"].includes(query.metric)) {
      return false
    }
    if (intent === "consultar_saldo" && query.metric !== "saldo") return false
  }

  if (intent === "fechamento") {
    if (!camposNulos(transaction) || query.metric !== "fechamento") return false
  }

  if (["gerar_planilha", "corrigir_lancamento", "excluir_lancamento", "ajuda"]
    .includes(intent)) {
    if (!camposNulos(transaction) || !camposNulos(query)) return false
  }

  return true
}

function decidirAcao(valor, minConfidence, confirmationConfidence) {
  if (valor.confidence < confirmationConfidence) return "reformular"

  if (valor.intent === "desconhecido") {
    return valor.clarification.question ? "esclarecer" : "reformular"
  }

  const ehRegistro = valor.intent === "registrar_despesa" ||
    valor.intent === "registrar_receita"
  if (ehRegistro && valor.transaction.amount === null) return "coletar_valor"
  if (ehRegistro &&
      valor.transaction.category === null &&
      valor.transaction.description === null) {
    return "coletar_categoria"
  }

  if (valor.needs_confirmation || valor.confidence < minConfidence) {
    return "confirmar"
  }

  return "executar"
}

export function validarInterpretacaoAI(
  bruto,
  {
    valorMaximo = 100_000,
    minConfidence = 0.85,
    confirmationConfidence = 0.60,
    mensagemOriginal = null,
  } = {}
) {
  const analise = analisarJsonObjectSafely(bruto)
  if (!analise.value) {
    return {
      ok: false,
      erro: classificarFalhaParse(analise.parseStage),
      parseStage: analise.parseStage,
    }
  }
  const normalizacao = normalizarObjetoParcial(analise.value)
  if (!normalizacao.ok) {
    return {
      ok: false,
      erro: normalizacao.erro,
      parseStage: analise.parseStage,
    }
  }
  const entrada = normalizacao.valor
  const intent = normalizarAIIntent(entrada.intent)
  const rejeitar = erro => ({
    ok: false,
    erro,
    parseStage: analise.parseStage,
    normalizedPartial: normalizacao.parcial,
  })
  if (!temExatamenteChaves(entrada.transaction, CHAVES_TRANSACAO) ||
      !temExatamenteChaves(entrada.query, CHAVES_CONSULTA) ||
      !temExatamenteChaves(entrada.clarification, CHAVES_CLARIFICACAO)) {
    return rejeitar("schema_invalido")
  }
  if (!AI_INTENTS.includes(intent)) {
    return rejeitar("intent_invalida")
  }
  if (!Number.isFinite(entrada.confidence) ||
      entrada.confidence < 0 ||
      entrada.confidence > 1) {
    return rejeitar("confidence_invalida")
  }
  if (typeof entrada.needs_confirmation !== "boolean") {
    return rejeitar("confirmacao_invalida")
  }

  const reason = textoSeguro(entrada.reason, 300, { nullable: false })
  const transactionType = enumOuNull(
    normalizarAITransactionType(entrada.transaction.type),
    AI_TRANSACTION_TYPES
  )
  const transactionDescription = textoSeguro(
    entrada.transaction.description,
    120
  )
  const transactionCategoryInput = textoSeguro(
    entrada.transaction.category,
    80
  )
  const tipoCategoriaTransacao =
    intent === "registrar_receita" || transactionType === "receita"
      ? "entrada"
      : "gasto"
  const categoriaTransacao = transactionCategoryInput === undefined
    ? null
    : normalizarCategoriaCanonica(
        transactionCategoryInput ?? transactionDescription,
        { tipo: tipoCategoriaTransacao }
      )
  const transactionCategory = transactionCategoryInput === undefined
    ? undefined
    : transactionCategoryInput === null &&
        categoriaTransacao?.source === "unknown"
      ? null
      : categoriaTransacao?.category ?? null

  const queryCategoryInput = textoSeguro(entrada.query.category, 80)
  const tipoCategoriaConsulta = intent === "consultar_receitas"
    ? "entrada"
    : "gasto"
  const categoriaConsulta = queryCategoryInput === undefined ||
      queryCategoryInput === null
    ? null
    : normalizarCategoriaCanonica(queryCategoryInput, {
        tipo: tipoCategoriaConsulta,
      })
  const transaction = {
    type: transactionType,
    amount: entrada.transaction.amount,
    category: transactionCategory,
    description: transactionDescription,
    date_reference: enumOuNull(
      normalizarAIDateReference(entrada.transaction.date_reference),
      AI_DATE_REFERENCES
    ),
  }
  const query = {
    metric: enumOuNull(
      normalizarAIMetric(entrada.query.metric),
      AI_QUERY_METRICS
    ),
    category: queryCategoryInput === undefined
      ? undefined
      : categoriaConsulta?.category ?? null,
    period: enumOuNull(
      normalizarAIPeriod(entrada.query.period),
      AI_QUERY_PERIODS
    ),
  }
  const clarification = {
    question: textoSeguro(entrada.clarification.question, 200),
    options: entrada.clarification.options,
  }

  if (reason === undefined ||
      Object.values(transaction).some(valor => valor === undefined) ||
      Object.values(query).some(valor => valor === undefined) ||
      clarification.question === undefined ||
      !Array.isArray(clarification.options) ||
      clarification.options.length > 4) {
    return rejeitar("campos_invalidos")
  }
  const options = clarification.options.map(opcao =>
    textoSeguro(opcao, 80, { nullable: false })
  )
  if (options.some(opcao => opcao === undefined)) {
    return rejeitar("opcoes_invalidas")
  }
  if (transaction.amount !== null &&
      (!Number.isFinite(transaction.amount) ||
       transaction.amount <= 0 ||
       transaction.amount > valorMaximo)) {
    return rejeitar("valor_invalido")
  }
  const ehRegistro = intent === "registrar_despesa" ||
    intent === "registrar_receita"
  if (ehRegistro &&
      transaction.amount !== null &&
      mensagemOriginal !== null &&
      !mensagemContemValor(mensagemOriginal, transaction.amount)) {
    return rejeitar("valor_nao_encontrado")
  }

  const textoIndicaAmbiguidade = mensagemOriginal !== null &&
    /\b(?:uns?|aproximadamente|aprox|cerca de|mais ou menos|por volta|acho|talvez)\b/iu
      .test(String(mensagemOriginal))
  const categoriaIncerta =
    categoriaTransacao?.source === "fuzzy" ||
    categoriaConsulta?.source === "fuzzy"
  const valor = {
    intent,
    confidence: entrada.confidence,
    needs_confirmation:
      entrada.needs_confirmation ||
      textoIndicaAmbiguidade ||
      categoriaIncerta,
    reason,
    transaction,
    query,
    clarification: { ...clarification, options },
  }
  if (!validarCompatibilidade(valor)) {
    return rejeitar("campos_incompativeis")
  }

  const limiteExecucao = Math.min(
    1,
    Math.max(0, Number(minConfidence) || 0.85)
  )
  const limiteConfirmacao = Math.min(
    limiteExecucao,
    Math.max(0, Number(confirmationConfidence) || 0.60)
  )

  return {
    ok: true,
    normalizedPartial: normalizacao.parcial,
    valor: {
      ...valor,
      action: decidirAcao(valor, limiteExecucao, limiteConfirmacao),
    },
  }
}
