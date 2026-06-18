import { db, inserirLancamento, mesAtual } from "./database.js"

export const DADOS_EXEMPLO = Object.freeze([
  { tipo: "entrada", nome: "salario", categoria: "salario", valor: 2500 },
  { tipo: "entrada", nome: "freelance", categoria: "freelance", valor: 1250 },
  { tipo: "gasto", nome: "mercado", categoria: "mercado", valor: 180 },
  { tipo: "gasto", nome: "transporte", categoria: "transporte", valor: 42.50 },
  { tipo: "gasto", nome: "alimentacao", categoria: "alimentacao", valor: 65 },
  { tipo: "gasto", nome: "pets", categoria: "pets", valor: 80 },
  { tipo: "gasto", nome: "assinaturas", categoria: "assinaturas", valor: 39.90 },
])

export function criarDadosExemploUsuario(usuarioId) {
  const inserirTodos = db.transaction((id) => {
    const mes = mesAtual()
    return DADOS_EXEMPLO.map(item =>
      inserirLancamento({
        usuarioId: id,
        ...item,
        mes,
        tags: "dado_exemplo",
      })
    )
  })

  return inserirTodos(usuarioId)
}
