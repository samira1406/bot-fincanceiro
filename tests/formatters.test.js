import { describe, it, expect } from "vitest"
import {
  fmtValor, fmtLista, fmtCategorias, fmtSaldo,
  fmtAjuda, fmtBoasVindas, fmtMensagemNaoEntendida,
  fmtBarraMeta, fmtCategoriaAmigavel, fmtDescricaoLancamento,
  fmtHistoricoLancamentos,
  fmtListaMetasCategoria, fmtMetaCategoriaAtualizada,
  fmtMetaCategoriaCriada, fmtMetaCategoriaUltrapassada,
  fmtProgressoMetaCategoria, fmtSemMetasCategoria,
  fmtRelatorioMensal, fmtRelatorioGeral,
} from "../src/formatters.js"

describe("fmtValor", () => {
  it("formata inteiro", () => {
    expect(fmtValor(1000)).toBe("1.000,00")
  })

  it("formata decimal", () => {
    expect(fmtValor(120.5)).toBe("120,50")
  })

  it("formata zero", () => {
    expect(fmtValor(0)).toBe("0,00")
  })
})

describe("mensagens de ajuda e onboarding", () => {
  it("formata mensagem de ajuda com comandos principais", () => {
    const texto = fmtAjuda()

    expect(texto).toContain("assistente financeiro")
    expect(texto).toContain("gastei 35 no mercado")
    expect(texto).toContain("recebi 2500 salario")
    expect(texto).toContain("exportar planilha")
    expect(texto).toContain("corrigir ultimo para 45")
    expect(texto).toContain("excluir ultimo")
  })

  it("formata mensagem de boas-vindas", () => {
    const texto = fmtBoasVindas()

    expect(texto).toContain("Olá! Eu sou seu assistente financeiro")
    expect(texto).toContain("gastei 35 no mercado")
    expect(texto).toContain("ajuda")
  })

  it("formata mensagem de erro amigável", () => {
    const texto = fmtMensagemNaoEntendida()

    expect(texto).toContain("Não consegui entender essa mensagem")
    expect(texto).toContain("gastei 35 no mercado")
    expect(texto).toContain("ajuda")
  })
})

describe("fmtSaldo", () => {
  it("positivo tem emoji verde e sinal +", () => {
    const s = fmtSaldo(500)
    expect(s).toContain("🟢")
    expect(s).toContain("+")
  })

  it("negativo tem emoji vermelho", () => {
    const s = fmtSaldo(-200)
    expect(s).toContain("🔴")
  })

  it("zero é positivo", () => {
    expect(fmtSaldo(0)).toContain("🟢")
  })
})

describe("fmtBarraMeta", () => {
  it("barra cheia a 100%", () => {
    const b = fmtBarraMeta(1000, 1000)
    expect(b).toContain("100%")
    expect(b).not.toContain("░")
  })

  it("barra vazia a 0%", () => {
    const b = fmtBarraMeta(0, 1000)
    expect(b).toContain("0%")
    expect(b).not.toContain("█")
  })

  it("barra pela metade a 50%", () => {
    const b = fmtBarraMeta(500, 1000)
    expect(b).toContain("50%")
    // 5 blocos cheios, 5 vazios
    expect(b).toContain("█████░░░░░")
  })

  it("cap em 100% mesmo quando ultrapassa", () => {
    const b = fmtBarraMeta(2000, 1000)
    expect(b).toContain("100%")
  })
})

describe("fmtLista", () => {
  it("retorna placeholder para lista vazia", () => {
    expect(fmtLista([])).toContain("Nenhum")
  })

  it("numera e formata corretamente", () => {
    const lista = [{ nome: "uber", categoria: "transporte", valor: 30 }]
    const texto = fmtLista(lista)
    expect(texto).toContain("1.")
    expect(texto).toContain("uber")
    expect(texto).toContain("Transporte")
    expect(texto).toContain("30,00")
  })
})

describe("fmtCategorias", () => {
  it("retorna placeholder vazio", () => {
    expect(fmtCategorias([])).toContain("Nenhum")
  })

  it("formata corretamente", () => {
    const grupos = [{ categoria: "alimentacao", total: 450 }]
    const texto  = fmtCategorias(grupos)
    expect(texto).toContain("Alimentação")
    expect(texto).toContain("450,00")
  })
})

describe("fmtCategoriaAmigavel", () => {
  it.each([
    ["alimentacao", "Alimentação"],
    ["farmacia", "Farmácia"],
    ["salario", "Salário"],
    ["mercado", "Mercado"],
    ["transporte", "Transporte"],
  ])("formata %s como %s", (categoria, esperado) => {
    expect(fmtCategoriaAmigavel(categoria)).toBe(esperado)
  })

  it("formata descrição de salário com acento", () => {
    expect(fmtDescricaoLancamento("salario")).toBe("salário")
  })
})

describe("fmtHistoricoLancamentos", () => {
  it("retorna mensagem amigável quando não há lançamentos", () => {
    const texto = fmtHistoricoLancamentos([])
    expect(texto).toContain("Você ainda não tem lançamentos registrados")
    expect(texto).toContain("gastei 35 no mercado")
  })

  it("formata últimos lançamentos com data, tipo, valor, categoria e descrição", () => {
    const texto = fmtHistoricoLancamentos([
      {
        tipo: "gasto",
        valor: 35,
        categoria: "mercado",
        nome: "mercado",
        criado_em: new Date(2026, 5, 16, 12).getTime(),
      },
      {
        tipo: "entrada",
        valor: 2500,
        categoria: "salario",
        nome: "salario",
        criado_em: new Date(2026, 5, 16, 13).getTime(),
      },
    ])

    expect(texto).toContain("Últimos lançamentos")
    expect(texto).toContain("16/06 - Despesa - R$ 35,00 - Mercado - mercado")
    expect(texto).toContain("16/06 - Receita - R$ 2.500,00 - Salário - salário")
  })
})

describe("metas por categoria", () => {
  const meta = { categoria: "mercado", valor_limite: 600 }

  it("formata meta criada", () => {
    expect(fmtMetaCategoriaCriada(meta)).toBe("Meta criada: Mercado até R$ 600,00 neste mês.")
  })

  it("formata meta atualizada", () => {
    expect(fmtMetaCategoriaAtualizada(meta)).toBe("Atualizei sua meta de Mercado para R$ 600,00 neste mês.")
  })

  it("formata lista de metas", () => {
    const texto = fmtListaMetasCategoria([
      { categoria: "mercado", valor_limite: 600, gasto: 420 },
      { categoria: "transporte", valor_limite: 300, gasto: 90 },
    ])

    expect(texto).toContain("Suas metas deste mês")
    expect(texto).toContain("Mercado: R$ 420,00 / R$ 600,00")
    expect(texto).toContain("Transporte: R$ 90,00 / R$ 300,00")
  })

  it("formata meta vazia", () => {
    expect(fmtSemMetasCategoria()).toContain("Você ainda não criou metas")
    expect(fmtListaMetasCategoria([])).toContain("meta mercado 600")
  })

  it("formata progresso dentro do limite", () => {
    const texto = fmtProgressoMetaCategoria(meta, 420)

    expect(texto).toContain("Você já usou R$ 420,00")
    expect(texto).toContain("Ainda restam R$ 180,00")
  })

  it("formata meta ultrapassada", () => {
    const texto = fmtMetaCategoriaUltrapassada(meta, 640)

    expect(texto).toContain("ultrapassou sua meta de Mercado")
    expect(texto).toContain("Meta: R$ 600,00")
    expect(texto).toContain("Gasto atual: R$ 640,00")
    expect(texto).toContain("Excedente: R$ 40,00")
  })
})

describe("fmtRelatorioMensal", () => {
  const entradas = [{ nome: "salario", categoria: "geral", valor: 5000 }]
  const gastos   = [{ nome: "mercado", categoria: "alimentacao", valor: 800 }]

  it("contém nome do usuário", () => {
    const { texto } = fmtRelatorioMensal("João", entradas, gastos, null)
    expect(texto).toContain("JOÃO")
  })

  it("calcula saldo corretamente", () => {
    const { saldo, totalE, totalG } = fmtRelatorioMensal("x", entradas, gastos, null)
    expect(totalE).toBe(5000)
    expect(totalG).toBe(800)
    expect(saldo).toBe(4200)
  })

  it("sem meta não mostra seção META", () => {
    const { texto } = fmtRelatorioMensal("x", entradas, gastos, null)
    expect(texto).not.toContain("META DO MÊS")
  })

  it("com meta dentro do limite mostra ✅", () => {
    const { texto } = fmtRelatorioMensal("x", entradas, gastos, 1000)
    expect(texto).toContain("✅")
  })

  it("com meta ultrapassada mostra ⚠️", () => {
    const { texto } = fmtRelatorioMensal("x", entradas, gastos, 500)
    expect(texto).toContain("⚠️")
  })
})

describe("fmtRelatorioGeral", () => {
  it("calcula totais gerais", () => {
    const usuarios = [
      { nome: "Ana",  totalE: 3000, totalG: 1000 },
      { nome: "Rui",  totalE: 4000, totalG: 2000 },
    ]
    const { resumo } = fmtRelatorioGeral(usuarios)
    expect(resumo).toContain("7.000,00")  // total entradas
    expect(resumo).toContain("3.000,00")  // total gastos
  })

  it("ranking ordena por maior gasto", () => {
    const usuarios = [
      { nome: "Ana",  totalE: 0, totalG: 500 },
      { nome: "Rui",  totalE: 0, totalG: 2000 },
    ]
    const { ranking } = fmtRelatorioGeral(usuarios)
    const posAna = ranking.indexOf("Ana")
    const posRui = ranking.indexOf("Rui")
    expect(posRui).toBeLessThan(posAna)   // Rui aparece primeiro
  })
})
