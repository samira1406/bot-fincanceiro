import fs from "fs"
import { resolve } from "path"
import ExcelJS from "exceljs"
import { afterEach, describe, expect, it } from "vitest"
import {
  gerarCSVLancamentos, gerarNomeArquivoExportacao,
  gerarNomeArquivoXlsx, gerarXlsxFinanceiro,
  salvarCSVExportacao, salvarXlsxExportacao, XLSX_MIMETYPE,
} from "../src/exporters.js"

const diretorioTeste = resolve("exports", "test-exporters")

afterEach(() => {
  fs.rmSync(diretorioTeste, { recursive: true, force: true })
})

const lancamentos = [
  {
    tipo: "gasto",
    categoria: "mercado",
    nome: "mercado",
    valor: 35,
    criado_em: new Date(2026, 5, 16, 12).getTime(),
  },
  {
    tipo: "entrada",
    categoria: "salario",
    nome: "salario",
    valor: 2500,
    criado_em: new Date(2026, 5, 16, 13).getTime(),
  },
]

async function carregarWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

describe("exportação CSV", () => {
  it("gera CSV com cabeçalho correto", () => {
    const csv = gerarCSVLancamentos(lancamentos)

    expect(csv.split("\n")[0]).toBe("data,tipo,categoria,descricao,valor")
  })

  it("gera CSV com categorias formatadas e valores decimais", () => {
    const csv = gerarCSVLancamentos(lancamentos)

    expect(csv).toContain("2026-06-16,despesa,Mercado,mercado,35.00")
    expect(csv).toContain("2026-06-16,receita,Salário,salario,2500.00")
  })

  it("gera nome de arquivo sem telefone completo", () => {
    const nome = gerarNomeArquivoExportacao("5511999999999@s.whatsapp.net", "6-2026")

    expect(nome).toMatch(/^extrato_usuario_[a-f0-9]{8}_2026-06\.csv$/)
    expect(nome).not.toContain("5511999999999")
  })

  it("salva CSV em exports", () => {
    const csv = gerarCSVLancamentos(lancamentos)
    const { caminho, nomeArquivo } = salvarCSVExportacao({
      usuarioId: "5511999999999@s.whatsapp.net",
      mes: "6-2026",
      csv,
      diretorio: diretorioTeste,
    })

    expect(nomeArquivo).toMatch(/^extrato_usuario_[a-f0-9]{8}_2026-06\.csv$/)
    expect(caminho).toContain("exports")
    expect(fs.readFileSync(caminho, "utf8")).toBe(csv)
  })

  it("mantém exports no .gitignore", () => {
    const gitignore = fs.readFileSync(resolve(".gitignore"), "utf8")

    expect(gitignore).toContain("exports/")
  })
})

describe("exportação XLSX", () => {
  it("gera arquivo .xlsx com abas Resumo e Lancamentos", async () => {
    const buffer = await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "5511999999999@s.whatsapp.net",
      mes: "6-2026",
      lancamentos,
    })
    const workbook = await carregarWorkbook(buffer)

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(["Resumo", "Lancamentos"])
  })

  it("aba Resumo contém título esperado e totais", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
    }))
    const resumo = workbook.getWorksheet("Resumo")

    expect(resumo.getCell("A1").value).toBe("Controle Financeiro - Sadu - Junho/2026")
    expect(resumo.getCell("A3").value).toBe("Indicador")
    expect(resumo.getCell("B4").value).toBe(2500)
    expect(resumo.getCell("B5").value).toBe(35)
    expect(resumo.getCell("B6").value).toBe(2465)
  })

  it("aba Resumo usa fallback quando nome do usuário é inválido", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "gastei 35 no mercado" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
    }))
    const resumo = workbook.getWorksheet("Resumo")

    expect(resumo.getCell("A1").value).toBe("Controle Financeiro - Junho/2026")
    expect(resumo.getCell("A1").value).not.toContain("gastei 35 no mercado")
  })

  it("aba Lancamentos contém cabeçalhos corretos", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
    }))
    const sheet = workbook.getWorksheet("Lancamentos")

    expect(sheet.getRow(3).values.slice(1, 6)).toEqual([
      "Data", "Tipo", "Categoria", "Descrição", "Valor",
    ])
  })

  it("XLSX contém valores monetários e categorias amigáveis", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos: [
        ...lancamentos,
        {
          tipo: "gasto",
          categoria: "alimentacao",
          nome: "ifood",
          valor: 80,
          criado_em: new Date(2026, 5, 16, 14).getTime(),
        },
      ],
    }))
    const sheet = workbook.getWorksheet("Lancamentos")

    expect(sheet.getCell("B4").value).toBe("Despesa")
    expect(sheet.getCell("C4").value).toBe("Alimentação")
    expect(sheet.getCell("E4").value).toBe(80)
    expect(sheet.getCell("E4").numFmt).toBe("R$ #,##0.00")
  })

  it("não inclui dados de outro usuário quando eles não foram fornecidos", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
    }))
    const sheet = workbook.getWorksheet("Lancamentos")
    const valores = JSON.stringify(sheet.getSheetValues())

    expect(valores).toContain("mercado")
    expect(valores).not.toContain("uber")
  })

  it("quando há metas, aba Resumo contém status Dentro da meta e Ultrapassada", async () => {
    const workbook = await carregarWorkbook(await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
      metas: [
        { categoria: "mercado", valor_limite: 30, gasto: 35 },
        { categoria: "alimentacao", valor_limite: 500, gasto: 80 },
      ],
    }))
    const resumo = workbook.getWorksheet("Resumo")
    const valores = JSON.stringify(resumo.getSheetValues())

    expect(valores).toContain("Metas por Categoria")
    expect(valores).toContain("Ultrapassada")
    expect(valores).toContain("Dentro da meta")
  })

  it("gera nome de arquivo seguro e sem telefone completo", () => {
    const nome = gerarNomeArquivoXlsx({
      usuarioId: "5511999999999@s.whatsapp.net",
      nomeUsuario: "Sadu Cliente",
      mes: "6-2026",
    })

    expect(nome).toBe("controle_financeiro_sadu_cliente_2026-06.xlsx")
    expect(nome).not.toContain("5511999999999")
  })

  it("usa hash quando não há nome do usuário", () => {
    const nome = gerarNomeArquivoXlsx({
      usuarioId: "5511999999999@s.whatsapp.net",
      mes: "6-2026",
    })

    expect(nome).toMatch(/^controle_financeiro_usuario_[a-f0-9]{8}_2026-06\.xlsx$/)
    expect(nome).not.toContain("5511999999999")
  })

  it("usa hash quando o nome do usuário parece comando ou lançamento", () => {
    const nome = gerarNomeArquivoXlsx({
      usuarioId: "5511999999999@s.whatsapp.net",
      nomeUsuario: "gastei 35 no mercado",
      mes: "6-2026",
    })

    expect(nome).toMatch(/^controle_financeiro_usuario_[a-f0-9]{8}_2026-06\.xlsx$/)
    expect(nome).not.toContain("gastei")
    expect(nome).not.toContain("mercado")
  })

  it("salva XLSX em exports", async () => {
    const buffer = await gerarXlsxFinanceiro({
      usuario: { nome: "Sadu" },
      usuarioId: "user-a",
      mes: "6-2026",
      lancamentos,
    })
    const { caminho, nomeArquivo, mimetype } = salvarXlsxExportacao({
      usuarioId: "user-a",
      nomeUsuario: "Sadu",
      mes: "6-2026",
      buffer,
      diretorio: diretorioTeste,
    })

    expect(nomeArquivo).toBe("controle_financeiro_sadu_2026-06.xlsx")
    expect(mimetype).toBe(XLSX_MIMETYPE)
    expect(caminho).toContain("exports")
    expect(fs.existsSync(caminho)).toBe(true)
  })
})
