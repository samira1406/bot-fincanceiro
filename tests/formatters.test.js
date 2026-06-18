import { describe, it, expect } from "vitest"
import {
  fmtValor, fmtLista, fmtCategorias, fmtSaldo,
  fmtAjuda, fmtBetaFechado, fmtBoasVindas, fmtMensagemNaoEntendida,
  fmtCancelamentoTotal, fmtComandoBloqueadoPorPendencia,
  fmtNomeAtualizado, fmtNomeInvalido, fmtNomeNecessarioAntes,
  fmtNomeSalvo, fmtSaudacaoUsuario,
  fmtMenuMetasTexto, fmtMenuPrincipalTexto,
  fmtFallbackMenuInterativo,
  fmtOrientacaoEntrada, fmtOrientacaoGasto, fmtOrientacaoMeta,
  fmtExemplosRapidos, formatarMensagemNaoEntendida,
  fmtValorAmbiguo,
  fmtConfirmacaoDespesa, fmtConfirmacaoReceita,
  fmtConfirmacaoExclusaoLancamento, fmtDataLancamentoEdicao,
  fmtBarraMeta, fmtCategoriaAmigavel, fmtDescricaoLancamento,
  fmtHistoricoLancamentos, fmtListaLancamentosEdicao,
  fmtMenuEdicaoLancamento, fmtResumoLancamentoEdicao,
  fmtTituloResumo, obterNomeExibicaoUsuario,
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
  it("formata menu textual principal numerado", () => {
    const texto = fmtMenuPrincipalTexto("Sadu")

    expect(texto).toContain("Oi, Sadu")
    expect(texto).toContain("MENU DO BOT FINANÇAS")
    expect(texto).toContain("1. 💸 Registrar gasto")
    expect(texto).toContain("7. 📋 Ajuda completa")
    expect(texto).toContain("mercado 35")
    expect(texto).toContain("recebi 2500 salario")
    expect(texto).toContain("saldo = resumo")
    expect(texto).toContain("csv = gerar CSV")
  })

  it("orienta comandos enviados antes do nome sem salvar o comando", () => {
    expect(fmtNomeNecessarioAntes()).toContain("preciso saber como posso te chamar")
    expect(fmtNomeNecessarioAntes()).toContain("Sadu")
  })

  it("confirma correção de nome", () => {
    expect(fmtNomeAtualizado("Sadu"))
      .toBe("Pronto, vou te chamar de Sadu a partir de agora.")
  })

  it("orienta pendência financeira e cancelamento total", () => {
    expect(fmtComandoBloqueadoPorPendencia()).toContain("Mande cancelar")
    expect(fmtCancelamentoTotal())
      .toBe("Cancelei as ações pendentes. Nenhum dado foi apagado.")
  })

  it("formata menu e orientações secundárias", () => {
    expect(fmtMenuMetasTexto()).toContain("1. Criar meta")
    expect(fmtMenuMetasTexto()).toContain("3. Voltar ao menu")
    expect(fmtOrientacaoGasto()).toContain("paguei 50 internet")
    expect(fmtOrientacaoEntrada()).toContain("recebi 2500 salario")
    expect(fmtOrientacaoMeta()).toContain("meta mercado 600")
    expect(fmtFallbackMenuInterativo()).toContain("menu texto")
  })

  it("formata mensagem de ajuda com comandos principais", () => {
    const texto = fmtAjuda()

    expect(texto).toContain("MENU DO BOT FINANÇAS")
    expect(texto).toContain("1. ")
    expect(texto).toContain("2. ")
    expect(texto).toContain("7. ")
    expect(texto).toContain("gastei 35 no mercado")
    expect(texto).toContain("recebi 2500 salario")
    expect(texto).toContain("recebi 1250 em freelance")
    expect(texto).toContain("planilha ou exportar planilha")
    expect(texto).toContain("exportar planilha")
    expect(texto).toContain("corrigir ultimo para 45")
    expect(texto).toContain("excluir ultimo")
  })

  it("formata orientação para valor ambíguo", () => {
    const texto = fmtValorAmbiguo(1250)

    expect(texto).toContain("R$ 1.250,00")
    expect(texto).toContain("1 - Entrada")
    expect(texto).toContain("2 - Gasto")
    expect(texto).toContain("recebi 1.250,00 freelance")
  })

  it("formata mensagem de boas-vindas", () => {
    const texto = fmtBoasVindas()

    expect(texto).toContain("Oi! Eu sou seu assistente financeiro")
    expect(texto).toContain("como você gostaria que eu te chamasse")
    expect(texto).toContain("Sadu")
  })

  it("formata confirmação de nome salvo", () => {
    const texto = fmtNomeSalvo("Sadu")

    expect(texto).toContain("Perfeito, Sadu")
    expect(texto).toContain("gastei 35 no mercado")
    expect(texto).toContain("exportar planilha")
    expect(texto).toContain("ajuda")
  })

  it("formata saudação para usuário cadastrado", () => {
    const texto = fmtSaudacaoUsuario("Sadu")

    expect(texto).toContain("Oi, Sadu")
    expect(texto).toContain("Como posso te ajudar hoje")
    expect(texto).toContain("resumo")
  })

  it("pede novamente quando o nome é inválido", () => {
    const texto = fmtNomeInvalido()

    expect(texto).toContain("parece mais um comando do que um nome")
    expect(texto).toContain("Como você gostaria que eu te chamasse")
    expect(texto).toContain("Sadu")
  })

  it("formata mensagem de erro amigável", () => {
    const texto = fmtMensagemNaoEntendida()

    expect(texto).toContain("ainda não entendi direitinho")
    expect(texto).toContain("mercado 35")
    expect(texto).toContain("menu")
  })

  it("formata fallbacks específicos com linguagem curta", () => {
    expect(formatarMensagemNaoEntendida({
      motivo: "categoria_sem_valor",
      categoria: "mercado",
      nome: "Sadu",
    })).toContain("Sadu, entendi a categoria Mercado")

    expect(formatarMensagemNaoEntendida({
      motivo: "comando_com_typo",
      comandoSugerido: "planilha",
    })).toContain("quis dizer “planilha”")

    expect(formatarMensagemNaoEntendida({
      motivo: "agradecimento",
    })).toContain("Por nada")

    expect(formatarMensagemNaoEntendida({
      motivo: "pendencia_incompleta",
      pendencia: { etapa: "categoria", tipo: "gasto", valor: 1250 },
    })).toContain("gasto de R$ 1.250,00")
  })

  it("formata exemplos rápidos naturais", () => {
    const texto = fmtExemplosRapidos()

    expect(texto).toContain("mercado 35")
    expect(texto).toContain("paguei 50 internet")
    expect(texto).toContain("recebi 1250 em comissão")
  })

  it("formata mensagem de beta fechado", () => {
    const texto = fmtBetaFechado()

    expect(texto).toContain("Este bot está em beta fechado")
    expect(texto).toContain("liberar seu número")
  })
})

describe("confirmacoes de lancamento", () => {
  it("formata despesa com dados do lancamento atual", () => {
    expect(fmtConfirmacaoDespesa({ valor: 10, categoria: "teste" }))
      .toBe("Despesa registrada: R$ 10,00 em Teste.")
  })

  it("formata receita com categoria amigavel", () => {
    expect(fmtConfirmacaoReceita({ valor: 2500, categoria: "salario" }))
      .toBe("Receita registrada: R$ 2.500,00 em Salário.")
  })
})

describe("nome de usuário em mensagens", () => {
  it("usa fallback no resumo quando o nome salvo é inválido", () => {
    const titulo = fmtTituloResumo("gastei 35 no mercado")

    expect(titulo).toContain("RESUMO DO MÊS")
    expect(titulo).not.toContain("GASTEI 35 NO MERCADO")
  })

  it("mantém nome válido no resumo", () => {
    expect(fmtTituloResumo("Sadu")).toContain("RESUMO — SADU")
  })

  it("retorna null para nome contaminado", () => {
    expect(obterNomeExibicaoUsuario({ nome: "exportar planilha" })).toBeNull()
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
    ["comissao", "Comissão"],
    ["comissionamento", "Comissionamento"],
    ["freelance", "Freelance"],
    ["free", "Free"],
    ["moradia", "Moradia"],
    ["saude", "Saúde"],
    ["pets", "Pets"],
    ["lazer", "Lazer"],
    ["assinaturas", "Assinaturas"],
    ["servico", "Serviço"],
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

describe("formatadores de edição segura", () => {
  const agora = new Date("2026-06-18T12:00:00-03:00")
  const lancamento = {
    tipo: "gasto",
    categoria: "transporte",
    valor: 12.5,
    criado_em: agora.getTime(),
  }

  it("formata hoje e ontem de forma amigável", () => {
    expect(fmtDataLancamentoEdicao(agora.getTime(), agora)).toBe("hoje")
    const ontem = new Date(agora)
    ontem.setDate(ontem.getDate() - 1)
    expect(fmtDataLancamentoEdicao(ontem.getTime(), agora)).toBe("ontem")
  })

  it("resume o lançamento para seleção", () => {
    expect(fmtResumoLancamentoEdicao(lancamento, agora))
      .toBe("Gasto - R$ 12,50 - Transporte - hoje")
  })

  it("lista lançamentos e mostra o menu de campos", () => {
    expect(fmtListaLancamentosEdicao([lancamento]))
      .toContain("1. Gasto - R$ 12,50 - Transporte")
    expect(fmtMenuEdicaoLancamento(lancamento)).toContain("1 - Corrigir valor")
    expect(fmtMenuEdicaoLancamento(lancamento)).toContain("6 - Excluir")
  })

  it("pede confirmação explícita para exclusão", () => {
    const texto = fmtConfirmacaoExclusaoLancamento(lancamento)
    expect(texto).toContain("Tem certeza que deseja excluir?")
    expect(texto).toContain("1 - Sim, excluir")
    expect(texto).toContain("2 - Cancelar")
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

  it("não usa nome inválido no título", () => {
    const { texto } = fmtRelatorioMensal("gastei 35 no mercado", entradas, gastos, null)

    expect(texto).toContain("RESUMO DO MÊS")
    expect(texto).not.toContain("GASTEI 35 NO MERCADO")
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
