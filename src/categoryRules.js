function normalizarTexto(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
}

const regrasGasto = new Map()
const regrasEntrada = new Map()

function registrarRegras(destino, categoria, termos) {
  for (const termo of termos) {
    destino.set(normalizarTexto(termo), categoria)
  }
}

registrarRegras(regrasGasto, "mercado", [
  "mercado", "supermercado", "feira", "atacadao", "assai",
  "max atacadista", "compra do mes",
])
registrarRegras(regrasGasto, "alimentacao", [
  "alimentacao", "alimento", "comida", "delivery", "ifood",
  "restaurante", "lanche", "pizza", "padaria", "acai", "almoco", "jantar",
])
registrarRegras(regrasGasto, "transporte", [
  "transporte", "uber", "99", "taxi", "gasolina", "posto", "combustivel",
  "estacionamento", "onibus",
])
registrarRegras(regrasGasto, "moradia", [
  "moradia", "aluguel", "condominio", "luz", "energia", "agua", "internet casa",
])
registrarRegras(regrasGasto, "saude", [
  "saude", "farmacia", "remedio", "consulta", "exame", "medico",
])
registrarRegras(regrasGasto, "pets", [
  "pets", "petshop", "racao", "veterinario",
])
registrarRegras(regrasGasto, "lazer", [
  "lazer", "cinema", "jogo", "role", "bar", "passeio",
])
registrarRegras(regrasGasto, "assinaturas", [
  "assinaturas", "netflix", "spotify", "amazon prime", "disney", "assinatura",
])

registrarRegras(regrasEntrada, "salario", ["salario"])
registrarRegras(regrasEntrada, "pix", ["pix"])
registrarRegras(regrasEntrada, "freelance", ["freela", "free", "freelance"])
registrarRegras(regrasEntrada, "comissao", [
  "comissao", "comissionamento",
])
registrarRegras(regrasEntrada, "servico", [
  "cliente", "servico",
])
registrarRegras(regrasEntrada, "consultoria", ["consultoria"])
registrarRegras(regrasEntrada, "bonus", ["bonus"])
registrarRegras(regrasEntrada, "extra", ["extra"])
registrarRegras(regrasEntrada, "receita", ["receita"])
registrarRegras(regrasEntrada, "entrada", ["entrada"])
registrarRegras(regrasEntrada, "deposito", ["deposito"])

export function detectarCategoriaCanonica(texto, tipo) {
  const chave = normalizarTexto(texto)
  if (!chave) return null

  const mapas = tipo === "entrada"
    ? [regrasEntrada]
    : tipo === "gasto"
      ? [regrasGasto]
      : [regrasEntrada, regrasGasto]

  for (const mapa of mapas) {
    const exata = mapa.get(chave)
    if (exata) return exata

    const textoComLimites = ` ${chave} `
    const termos = [...mapa.keys()].sort((a, b) => b.length - a.length)
    const termoEncontrado = termos.find(termo =>
      textoComLimites.includes(` ${termo} `)
    )
    if (termoEncontrado) return mapa.get(termoEncontrado)
  }

  return null
}

export function normalizarCategoriaPorPalavraChave(texto, tipo = "gasto") {
  const original = String(texto ?? "").trim().toLowerCase()
  if (!original) return ""
  return detectarCategoriaCanonica(original, tipo) ?? original
}

export function categoriaEhEntrada(texto) {
  return detectarCategoriaCanonica(texto, "entrada") !== null
}
