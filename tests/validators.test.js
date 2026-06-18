import { describe, it, expect, beforeAll, vi } from "vitest"
import {
  classificarMensagemDesconhecida,
  ehNomeUsuarioValido, normalizarNomeUsuario,
  isCancelamentoPendencia, parseCategoriaLancamentoPendente,
  parseAjuda, parseCorrecaoUltimo, parseExportacao, parseLancamento,
  parseMetaCategoria, parseSaudacao, parseTipoLancamentoPendente,
  parseValorAmbiguo, parseValorSimples,
} from "../src/validators.js"

// Mock config para testes
vi.mock("../src/config.js", () => ({
  config: {
    valorMaximo:     100_000,
    palavrasEntrada: ["salario", "freela", "bonus", "pix"],
  },
}))

describe("nomes de usuário", () => {
  it.each([
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "gastei 35 no mercado",
    "recebi 2500 salario",
    "planilha",
    "excel",
    "saldo",
    "extrato",
    "exportar planilha",
    "ajuda",
    "resumo",
    "historico",
    "salario 200",
    "mercado",
    "obrigado",
    "planiha",
  ])("rejeita %s como nome", (mensagem) => {
    expect(ehNomeUsuarioValido(mensagem)).toBe(false)
    expect(normalizarNomeUsuario(mensagem)).toBeNull()
  })

  it("normaliza nome válido", () => {
    expect(normalizarNomeUsuario("sadu")).toBe("Sadu")
  })

  it("aceita frase meu nome é", () => {
    expect(normalizarNomeUsuario("meu nome é Sadu")).toBe("Sadu")
  })

  it("aceita frase sou", () => {
    expect(normalizarNomeUsuario("sou Sadu")).toBe("Sadu")
  })
})

describe("parseSaudacao", () => {
  it.each([
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "opa",
    "e ai",
    "e aí",
    "start",
    "inicio",
    "início",
  ])("reconhece %s", (mensagem) => {
    expect(parseSaudacao(mensagem)).toEqual({ tipo: "saudacao" })
  })

  it("não confunde comando financeiro com saudação", () => {
    expect(parseSaudacao("gastei 35 no mercado")).toBeNull()
  })
})

describe("parseLancamento", () => {
  describe("formato simples: nome valor", () => {
    it("parseia gasto básico", () => {
      expect(parseLancamento("mercado 120,50")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 120.50,
      })
    })

    it("parseia com valor inteiro", () => {
      expect(parseLancamento("uber 30")).toEqual({
        nome: "uber", categoria: "transporte", valor: 30,
      })
    })

    it("parseia com ponto decimal", () => {
      expect(parseLancamento("netflix 39.90")).toEqual({
        nome: "netflix", categoria: "netflix", valor: 39.90,
      })
    })

    it("parseia gasto natural com categoria", () => {
      expect(parseLancamento("gastei 50 no mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 50,
      })
    })

    it("parseia valor antes da categoria", () => {
      expect(parseLancamento("50 mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 50,
      })
    })

    it("parseia valor antes da categoria com maiúscula", () => {
      expect(parseLancamento("900 Mercado")).toEqual({
        nome: "mercado", categoria: "mercado", valor: 900,
      })
    })

    it("converte ifood para categoria alimentacao", () => {
      expect(parseLancamento("gastei 80 no ifood")).toEqual({
        nome: "ifood", categoria: "alimentacao", valor: 80,
      })
    })

    it.each([
      ["gastei 10 mercado", "mercado", 10],
      ["paguei 50 internet", "internet", 50],
      ["comprei 20 padaria", "padaria", 20],
      ["despesa 20 padaria", "padaria", 20],
      ["saida 20 padaria", "padaria", 20],
      ["saída 20 padaria", "padaria", 20],
    ])("parseia despesa natural %s", (mensagem, categoria, valor) => {
      expect(parseLancamento(mensagem)).toEqual({
        nome: categoria,
        categoria,
        valor,
      })
    })
  })

  describe("formato com categoria: nome categoria valor", () => {
    it("parseia gasto com categoria", () => {
      expect(parseLancamento("uber transporte 30")).toEqual({
        nome: "uber", categoria: "transporte", valor: 30,
      })
    })

    it("parseia mercado com categoria alimentacao", () => {
      expect(parseLancamento("mercado alimentacao 150,00")).toEqual({
        nome: "mercado", categoria: "alimentacao", valor: 150,
      })
    })
  })

  describe("entradas", () => {
    it("parseia salario", () => {
      expect(parseLancamento("salario 5000")).toEqual({
        tipo: "entrada", nome: "salario", categoria: "salario", valor: 5000,
      })
    })

    it.each([
      ["recebi 2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["recebi 2500 salário", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["entrou 500 pix", { nome: "pix", categoria: "pix", valor: 500 }],
      ["ganhei 1200 freelance", { nome: "freelance", categoria: "freelance", valor: 1200 }],
      ["caiu 2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["caiu salario 2500", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["salario 2500", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["2500 salario", { nome: "salario", categoria: "salario", valor: 2500 }],
      ["receita 3000", { nome: "receita", categoria: "receita", valor: 3000 }],
      ["entrada 3000", { nome: "entrada", categoria: "entrada", valor: 3000 }],
    ])("parseia %s como receita", (mensagem, esperado) => {
      expect(parseLancamento(mensagem)).toEqual({
        tipo: "entrada",
        ...esperado,
      })
    })

    it.each([
      ["recebi 1250 em comissionamento", "comissionamento"],
      ["Recebi 1250 em free", "free"],
      ["recebi 1250 em freelance", "freelance"],
      ["recebi 1250 de comissionamento", "comissionamento"],
      ["recebi 1250 por consultoria", "consultoria"],
      ["recebi 1250 referente a freela", "freela"],
      ["recebi 1250 do cliente", "cliente"],
      ["recebi 1250 da venda", "venda"],
    ])("parseia receita natural %s", (mensagem, categoria) => {
      expect(parseLancamento(mensagem)).toEqual({
        tipo: "entrada",
        nome: categoria,
        categoria,
        valor: 1250,
      })
    })

    it.each([
      ["comissao 1250", "comissao", 1250],
      ["comissão 1250", "comissao", 1250],
      ["freela 300", "freela", 300],
      ["freelance 300", "freelance", 300],
      ["pix 200", "pix", 200],
      ["entrou 450", "entrada", 450],
      ["ganhei 80", "entrada", 80],
      ["caiu 1250", "entrada", 1250],
      ["depositaram 1000", "deposito", 1000],
      ["receita 1250 consultoria", "consultoria", 1250],
      ["entrada 1250 consultoria", "consultoria", 1250],
    ])("parseia atalho de receita %s", (mensagem, categoria, valor) => {
      expect(parseLancamento(mensagem)).toEqual({
        tipo: "entrada",
        nome: categoria,
        categoria,
        valor,
      })
    })
  })

  describe("valores inválidos", () => {
    it("rejeita valor zero", () => {
      expect(parseLancamento("mercado 0")).toBeNull()
    })

    it("rejeita valor negativo", () => {
      expect(parseLancamento("mercado -50")).toBeNull()
    })

    it("rejeita valor acima do máximo", () => {
      expect(parseLancamento("mercado 200000")).toBeNull()
    })

    it("rejeita valor não numérico", () => {
      expect(parseLancamento("mercado abc")).toBeNull()
    })

    it("rejeita mensagem sem valor", () => {
      expect(parseLancamento("mercado")).toBeNull()
    })

    it("rejeita mensagem vazia", () => {
      expect(parseLancamento("")).toBeNull()
    })
  })

  describe("nomes inválidos", () => {
    it("rejeita nome com caracteres especiais", () => {
      expect(parseLancamento("merca!do 50")).toBeNull()
    })

    it("rejeita nome com espaço duplo tratado como categoria inválida", () => {
      // "a b! 10" — categoria 'b!' é inválida
      expect(parseLancamento("a b! 10")).toBeNull()
    })
  })
})

describe("parseValorSimples", () => {
  it("parseia valor inteiro", () => {
    expect(parseValorSimples("3000")).toBe(3000)
  })

  it("parseia valor com vírgula", () => {
    expect(parseValorSimples("1500,50")).toBe(1500.50)
  })

  it("parseia valor brasileiro com separador de milhar", () => {
    expect(parseValorSimples("1.250,00")).toBe(1250)
  })

  it("parseia valor com ponto decimal", () => {
    expect(parseValorSimples("12.50")).toBe(12.5)
  })

  it("retorna null para string vazia", () => {
    expect(parseValorSimples("")).toBeNull()
  })

  it("retorna null para valor negativo", () => {
    expect(parseValorSimples("-100")).toBeNull()
  })

  it("retorna null para valor acima do máximo", () => {
    expect(parseValorSimples("200000")).toBeNull()
  })

  it("retorna null para texto não numérico", () => {
    expect(parseValorSimples("abc")).toBeNull()
  })
})

describe("parseValorAmbiguo", () => {
  it("identifica valor sozinho sem criar lançamento", () => {
    expect(parseValorAmbiguo("1250")).toEqual({ valor: 1250 })
    expect(parseLancamento("1250")).toBeNull()
  })

  it("não trata texto aleatório como valor", () => {
    expect(parseValorAmbiguo("Sadu")).toBeNull()
  })

  it.each([
    ["R$ 300", 300],
    ["300 reais", 300],
    ["1.250", 1250],
  ])("identifica valor flexível %s", (mensagem, valor) => {
    expect(parseValorAmbiguo(mensagem)).toEqual({ valor })
  })
})

describe("classificarMensagemDesconhecida", () => {
  it("classifica categoria comum sem valor", () => {
    expect(classificarMensagemDesconhecida("mercado")).toEqual({
      motivo: "categoria_sem_valor",
      categoria: "mercado",
    })
  })

  it.each([
    ["planiha", "planilha"],
    ["resumoo", "resumo"],
    ["hstoric", "historico"],
    ["ajdua", "ajuda"],
  ])("sugere %s para typo %s", (mensagem, comandoSugerido) => {
    expect(classificarMensagemDesconhecida(mensagem)).toEqual({
      motivo: "comando_com_typo",
      comandoSugerido,
    })
  })

  it.each([
    "obrigado",
    "valeu",
    "ok",
    "beleza",
  ])("classifica agradecimento %s", (mensagem) => {
    expect(classificarMensagemDesconhecida(mensagem)).toEqual({
      motivo: "agradecimento",
    })
  })

  it("classifica valor com descrição de tipo ambíguo", () => {
    expect(classificarMensagemDesconhecida("300 manutenção")).toEqual({
      motivo: "valor_com_descricao_ambigua",
      valor: 300,
      descricao: "manutencao",
      categoria: "manutencao",
    })
  })

  it("não intercepta categoria segura com valor", () => {
    expect(classificarMensagemDesconhecida("300 mercado").motivo)
      .toBe("desconhecido_total")
  })

  it("classifica texto aleatório como desconhecido total", () => {
    expect(classificarMensagemDesconhecida("banana azul")).toEqual({
      motivo: "desconhecido_total",
    })
  })
})

describe("pendência de lançamento", () => {
  it.each([
    ["1", "entrada"],
    ["entrada", "entrada"],
    ["receita", "entrada"],
    ["recebido", "entrada"],
    ["ganho", "entrada"],
    ["2", "gasto"],
    ["gasto", "gasto"],
    ["despesa", "gasto"],
    ["saida", "gasto"],
    ["saída", "gasto"],
    ["pago", "gasto"],
  ])("interpreta %s como %s", (mensagem, tipo) => {
    expect(parseTipoLancamentoPendente(mensagem)).toBe(tipo)
  })

  it("não transforma outro valor em escolha de tipo", () => {
    expect(parseTipoLancamentoPendente("1250")).toBeNull()
  })

  it.each([
    "cancelar",
    "cancela",
    "sair",
    "voltar",
  ])("reconhece %s como cancelamento", (mensagem) => {
    expect(isCancelamentoPendencia(mensagem)).toBe(true)
  })

  it("normaliza categoria ou descrição", () => {
    expect(parseCategoriaLancamentoPendente("Conta de luz")).toEqual({
      nome: "conta-de-luz",
      categoria: "conta-de-luz",
    })
    expect(parseCategoriaLancamentoPendente("mercado")).toEqual({
      nome: "mercado",
      categoria: "mercado",
    })
  })

  it("rejeita categoria apenas numérica", () => {
    expect(parseCategoriaLancamentoPendente("2")).toBeNull()
  })

  it.each([
    "sei la",
    "sei lá",
    "não sei",
    "talvez",
  ])("rejeita resposta vaga %s como categoria", (mensagem) => {
    expect(parseCategoriaLancamentoPendente(mensagem)).toBeNull()
  })
})

describe("parseCorrecaoUltimo", () => {
  it("parseia corrigir último com acento", () => {
    expect(parseCorrecaoUltimo("corrigir último para 45")).toEqual({ valor: 45 })
  })

  it("parseia corrigir ultimo sem acento", () => {
    expect(parseCorrecaoUltimo("corrigir ultimo para 45")).toEqual({ valor: 45 })
  })

  it("parseia corrige último com vírgula decimal", () => {
    expect(parseCorrecaoUltimo("corrige último para 45,50")).toEqual({ valor: 45.5 })
  })

  it("parseia alterar ultimo", () => {
    expect(parseCorrecaoUltimo("alterar ultimo para 120")).toEqual({ valor: 120 })
  })

  it("parseia editar último", () => {
    expect(parseCorrecaoUltimo("editar último para 75")).toEqual({ valor: 75 })
  })

  it("rejeita valor inválido", () => {
    expect(parseCorrecaoUltimo("corrigir ultimo para abc")).toBeNull()
  })
})

describe("parseAjuda", () => {
  it.each([
    "ajuda",
    "comandos",
    "como usar",
    "menu",
    "inicio",
    "início",
    "start",
  ])("parseia %s", (mensagem) => {
    expect(parseAjuda(mensagem)).toEqual({ tipo: "ajuda" })
  })

  it("retorna null para comando que não é ajuda", () => {
    expect(parseAjuda("resumo")).toBeNull()
  })
})

describe("parseExportacao", () => {
  it.each([
    "csv",
    "exportar csv",
    "baixar csv",
  ])("parseia %s como CSV", (mensagem) => {
    expect(parseExportacao(mensagem)).toEqual({ tipo: "exportacao", formato: "csv" })
  })

  it.each([
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
  ])("parseia %s como XLSX", (mensagem) => {
    expect(parseExportacao(mensagem)).toEqual({ tipo: "exportacao", formato: "xlsx" })
  })

  it("retorna null para comando desconhecido", () => {
    expect(parseExportacao("exportar tudo agora")).toBeNull()
  })
})

describe("parseMetaCategoria", () => {
  it("parseia meta mercado 600", () => {
    expect(parseMetaCategoria("meta mercado 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia meta alimentação 500", () => {
    expect(parseMetaCategoria("meta alimentação 500")).toEqual({
      tipo: "meta_categoria", categoria: "alimentacao", valor: 500,
    })
  })

  it("parseia criar meta de 600 para mercado", () => {
    expect(parseMetaCategoria("criar meta de 600 para mercado")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia minha meta de mercado é 600", () => {
    expect(parseMetaCategoria("minha meta de mercado é 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("parseia limite mercado 600", () => {
    expect(parseMetaCategoria("limite mercado 600")).toEqual({
      tipo: "meta_categoria", categoria: "mercado", valor: 600,
    })
  })

  it("retorna erro para valor inválido", () => {
    expect(parseMetaCategoria("meta mercado abc")).toEqual({
      tipo: "meta_categoria", erro: "valor",
    })
  })

  it("retorna erro para categoria ausente", () => {
    expect(parseMetaCategoria("criar meta de 600")).toEqual({
      tipo: "meta_categoria", erro: "categoria",
    })
  })

  it("retorna erro para valor ausente", () => {
    expect(parseMetaCategoria("meta mercado")).toEqual({
      tipo: "meta_categoria", erro: "valor", categoria: "mercado",
    })
  })

  it("mantém meta mensal geral fora do parser de categoria", () => {
    expect(parseMetaCategoria("meta 3000")).toBeNull()
  })
})
