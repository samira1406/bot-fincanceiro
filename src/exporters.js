/**
 * @fileoverview Geração e gravação de arquivos de exportação.
 */

import { createHash } from "crypto"
import ExcelJS from "exceljs"
import fs from "fs"
import { resolve } from "path"
import { fmtCategoriaAmigavel, fmtTipoLancamento } from "./formatters.js"

const CSV_HEADER = "data,tipo,categoria,descricao,valor"
const XLSX_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const CORES = {
  azulEscuro: "#1F4E78",
  azulMedio:  "#5B9BD5",
  azulClaro:  "#D9EAF7",
  verde:      "#70AD47",
  vermelho:   "#C00000",
  laranja:    "#F4B183",
  cinzaClaro: "#F2F2F2",
  cinzaMedio: "#D9D9D9",
  branco:     "#FFFFFF",
  preto:      "#1F1F1F",
  cinzaTexto: "#666666",
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function pad2(valor) {
  return String(valor).padStart(2, "0")
}

function fmtDataISO(timestamp) {
  const data = new Date(timestamp)
  return `${data.getFullYear()}-${pad2(data.getMonth() + 1)}-${pad2(data.getDate())}`
}

function fmtTipoCSV(tipo) {
  return tipo === "entrada" ? "receita" : "despesa"
}

function escaparCSV(valor) {
  const texto = String(valor ?? "")
  if (!/[",\n\r]/.test(texto)) return texto
  return `"${texto.replace(/"/g, '""')}"`
}

function mesParaArquivo(mes) {
  const [mesNumero, ano] = String(mes).split("-")
  if (!mesNumero || !ano) return String(mes).replace(/[^\w-]/g, "")
  return `${ano}-${pad2(mesNumero)}`
}

function mesParaTitulo(mes) {
  const [mesNumero, ano] = String(mes).split("-")
  const nomeMes = MESES[Number(mesNumero) - 1]
  if (!nomeMes || !ano) return String(mes)
  return `${nomeMes}/${ano}`
}

function removerAcentos(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function slugSeguro(texto) {
  return removerAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function hashUsuario(usuarioId) {
  return createHash("sha256").update(String(usuarioId)).digest("hex").slice(0, 8)
}

function fill(cor) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: cor.replace("#", "") } }
}

function fonte({ cor = CORES.preto, bold = false, italic = false, size = 11 } = {}) {
  return { color: { argb: cor.replace("#", "") }, bold, italic, size }
}

function bordaFina() {
  return {
    top:    { style: "thin", color: { argb: CORES.cinzaMedio.replace("#", "") } },
    left:   { style: "thin", color: { argb: CORES.cinzaMedio.replace("#", "") } },
    bottom: { style: "thin", color: { argb: CORES.cinzaMedio.replace("#", "") } },
    right:  { style: "thin", color: { argb: CORES.cinzaMedio.replace("#", "") } },
  }
}

function estilizarTitulo(worksheet, range, titulo, tamanho = 16) {
  worksheet.mergeCells(range)
  const cell = worksheet.getCell(range.split(":")[0])
  cell.value = titulo
  cell.fill = fill(CORES.azulEscuro)
  cell.font = fonte({ cor: CORES.branco, bold: true, size: tamanho })
  cell.alignment = { vertical: "middle", horizontal: "center" }
  worksheet.getRow(cell.row).height = 28
}

function estilizarCabecalho(row) {
  row.eachCell(cell => {
    cell.fill = fill(CORES.azulMedio)
    cell.font = fonte({ cor: CORES.branco, bold: true })
    cell.alignment = { vertical: "middle", horizontal: "center" }
    cell.border = bordaFina()
  })
}

function estilizarTabela(worksheet, inicio, fim, colunasMoeda = []) {
  for (let rowNumber = inicio; rowNumber <= fim; rowNumber++) {
    const row = worksheet.getRow(rowNumber)
    row.eachCell((cell, colNumber) => {
      cell.border = bordaFina()
      cell.alignment = { vertical: "middle" }
      if (rowNumber > inicio && (rowNumber - inicio) % 2 === 0) {
        cell.fill = fill(CORES.cinzaClaro)
      }
      if (colunasMoeda.includes(colNumber)) {
        cell.numFmt = "R$ #,##0.00"
      }
    })
  }
}

function totalPorTipo(lancamentos, tipo) {
  return lancamentos
    .filter(l => l.tipo === tipo)
    .reduce((soma, l) => soma + Number(l.valor), 0)
}

function gastosPorCategoria(lancamentos) {
  const grupos = new Map()
  for (const lancamento of lancamentos) {
    if (lancamento.tipo !== "gasto") continue
    const categoria = fmtCategoriaAmigavel(lancamento.categoria)
    grupos.set(categoria, (grupos.get(categoria) ?? 0) + Number(lancamento.valor))
  }
  return [...grupos.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
}

function aplicarLargurasResumo(worksheet) {
  worksheet.columns = [
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
  ]
}

function aplicarLargurasLancamentos(worksheet) {
  worksheet.columns = [
    { width: 15 },
    { width: 14 },
    { width: 18 },
    { width: 35 },
    { width: 16 },
  ]
}

function criarAbaResumo(workbook, { usuario, mes, lancamentos, metas }) {
  const worksheet = workbook.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 2 }],
  })
  worksheet.properties.defaultRowHeight = 20
  worksheet.views = [{ showGridLines: false, state: "frozen", ySplit: 2 }]
  aplicarLargurasResumo(worksheet)

  const nomeUsuario = usuario?.nome || "Usuário"
  estilizarTitulo(worksheet, "A1:E1", `Controle Financeiro - ${nomeUsuario} - ${mesParaTitulo(mes)}`)

  const totalEntradas = totalPorTipo(lancamentos, "entrada")
  const totalGastos = totalPorTipo(lancamentos, "gasto")
  const saldo = totalEntradas - totalGastos

  worksheet.addRow([])
  worksheet.addRow(["Indicador", "Valor"])
  estilizarCabecalho(worksheet.getRow(3))
  worksheet.addRow(["Total de Entradas", totalEntradas])
  worksheet.addRow(["Total de Gastos", totalGastos])
  worksheet.addRow(["Saldo do Mês", saldo])
  worksheet.addRow(["Quantidade de Lançamentos", lancamentos.length])
  estilizarTabela(worksheet, 3, 7, [2])
  worksheet.getCell("B4").font = fonte({ cor: CORES.verde, bold: true })
  worksheet.getCell("B5").font = fonte({ cor: CORES.vermelho, bold: true })
  worksheet.getCell("B6").font = fonte({ cor: saldo >= 0 ? CORES.verde : CORES.vermelho, bold: true })
  worksheet.getCell("B7").numFmt = "0"

  let linha = 10
  worksheet.getCell(linha, 1).value = "Gastos por Categoria"
  worksheet.getCell(linha, 1).font = fonte({ bold: true, size: 13, cor: CORES.azulEscuro })
  linha += 1

  const categorias = gastosPorCategoria(lancamentos)
  if (categorias.length) {
    worksheet.getRow(linha).values = ["Categoria", "Total Gasto", "% dos Gastos"]
    estilizarCabecalho(worksheet.getRow(linha))
    const inicio = linha
    for (const grupo of categorias) {
      linha += 1
      worksheet.getRow(linha).values = [
        grupo.categoria,
        grupo.total,
        totalGastos > 0 ? grupo.total / totalGastos : 0,
      ]
    }
    estilizarTabela(worksheet, inicio, linha, [2])
    for (let i = inicio + 1; i <= linha; i++) {
      worksheet.getCell(i, 3).numFmt = "0%"
    }
  } else {
    worksheet.getCell(linha, 1).value = "Nenhuma despesa registrada neste mês."
    worksheet.getCell(linha, 1).font = fonte({ cor: CORES.cinzaTexto, italic: true })
  }

  linha += 3
  worksheet.getCell(linha, 1).value = "Metas por Categoria"
  worksheet.getCell(linha, 1).font = fonte({ bold: true, size: 13, cor: CORES.azulEscuro })
  linha += 1

  if (metas?.length) {
    worksheet.getRow(linha).values = ["Categoria", "Gasto Atual", "Meta", "Restante/Excedente", "Status"]
    estilizarCabecalho(worksheet.getRow(linha))
    const inicio = linha
    for (const meta of metas) {
      const gasto = Number(meta.gasto ?? 0)
      const limite = Number(meta.valor_limite)
      const restante = limite - gasto
      const ultrapassada = gasto > limite
      linha += 1
      worksheet.getRow(linha).values = [
        fmtCategoriaAmigavel(meta.categoria),
        gasto,
        limite,
        restante,
        ultrapassada ? "Ultrapassada" : "Dentro da meta",
      ]
      worksheet.getCell(linha, 4).font = fonte({
        cor: ultrapassada ? CORES.vermelho : CORES.verde,
        bold: true,
      })
      worksheet.getCell(linha, 5).fill = fill(ultrapassada ? CORES.laranja : CORES.azulClaro)
      worksheet.getCell(linha, 5).font = fonte({
        cor: ultrapassada ? CORES.vermelho : CORES.verde,
        bold: true,
      })
    }
    estilizarTabela(worksheet, inicio, linha, [2, 3, 4])
  } else {
    worksheet.getCell(linha, 1).value = "Nenhuma meta criada neste mês. Exemplo: meta mercado 600"
    worksheet.getCell(linha, 1).font = fonte({ cor: CORES.cinzaTexto, italic: true })
  }

  linha += 3
  worksheet.mergeCells(linha, 1, linha, 5)
  worksheet.getCell(linha, 1).value = "Planilha gerada automaticamente pelo bot financeiro via WhatsApp."
  worksheet.getCell(linha, 1).font = fonte({ cor: CORES.cinzaTexto, italic: true, size: 10 })
}

function criarAbaLancamentos(workbook, { mes, lancamentos }) {
  const worksheet = workbook.addWorksheet("Lancamentos", {
    views: [{ state: "frozen", ySplit: 3 }],
  })
  worksheet.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }]
  aplicarLargurasLancamentos(worksheet)

  estilizarTitulo(worksheet, "A1:E1", `Lançamentos do mês - ${mesParaTitulo(mes)}`, 15)
  worksheet.addRow([])
  worksheet.addRow(["Data", "Tipo", "Categoria", "Descrição", "Valor"])
  estilizarCabecalho(worksheet.getRow(3))

  const ordenados = [...lancamentos].sort((a, b) => b.criado_em - a.criado_em)
  for (const lancamento of ordenados) {
    const row = worksheet.addRow([
      new Date(lancamento.criado_em),
      fmtTipoLancamento(lancamento.tipo),
      fmtCategoriaAmigavel(lancamento.categoria),
      lancamento.nome,
      Number(lancamento.valor),
    ])
    row.getCell(1).numFmt = "dd/mm/yyyy"
    row.getCell(5).numFmt = "R$ #,##0.00"
    row.getCell(5).font = fonte({
      cor: lancamento.tipo === "entrada" ? CORES.verde : CORES.vermelho,
      bold: true,
    })
  }

  const fim = Math.max(3, worksheet.rowCount)
  estilizarTabela(worksheet, 3, fim, [5])
  worksheet.autoFilter = { from: "A3", to: `E${fim}` }
}

/**
 * Gera o conteúdo CSV dos lançamentos informados.
 * @param {object[]} lancamentos
 * @returns {string}
 */
export function gerarCSVLancamentos(lancamentos) {
  const linhas = lancamentos.map(l => [
    fmtDataISO(l.criado_em),
    fmtTipoCSV(l.tipo),
    fmtCategoriaAmigavel(l.categoria),
    l.nome,
    Number(l.valor).toFixed(2),
  ].map(escaparCSV).join(","))

  return [CSV_HEADER, ...linhas].join("\n")
}

/**
 * Gera um nome de arquivo sem expor o telefone completo do usuário.
 * @param {string} usuarioId
 * @param {string} mes
 * @returns {string}
 */
export function gerarNomeArquivoExportacao(usuarioId, mes) {
  return `extrato_usuario_${hashUsuario(usuarioId)}_${mesParaArquivo(mes)}.csv`
}

/**
 * Salva o CSV em uma pasta local ignorada pelo Git.
 * @param {{ usuarioId:string, mes:string, csv:string, diretorio?:string }} params
 * @returns {{ caminho:string, nomeArquivo:string }}
 */
export function salvarCSVExportacao({ usuarioId, mes, csv, diretorio = resolve("exports") }) {
  fs.mkdirSync(diretorio, { recursive: true })
  const nomeArquivo = gerarNomeArquivoExportacao(usuarioId, mes)
  const caminho = resolve(diretorio, nomeArquivo)
  fs.writeFileSync(caminho, csv, "utf8")
  return { caminho, nomeArquivo }
}

/**
 * Gera uma planilha XLSX financeira com abas Resumo e Lancamentos.
 * @param {{ usuario:object, usuarioId:string, mes:string, lancamentos:object[], metas?:object[] }} params
 * @returns {Promise<Buffer>}
 */
export async function gerarXlsxFinanceiro({ usuario, usuarioId, mes, lancamentos, metas = [] }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "Bot Financeiro WhatsApp"
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = "Controle financeiro mensal"
  workbook.title = `Controle Financeiro - ${usuario?.nome ?? usuarioId}`

  criarAbaResumo(workbook, { usuario, mes, lancamentos, metas })
  criarAbaLancamentos(workbook, { mes, lancamentos })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Gera nome seguro para arquivo XLSX sem expor telefone completo.
 * @param {{ usuarioId:string, nomeUsuario?:string, mes:string }} params
 * @returns {string}
 */
export function gerarNomeArquivoXlsx({ usuarioId, nomeUsuario, mes }) {
  const slug = slugSeguro(nomeUsuario) || `usuario_${hashUsuario(usuarioId)}`
  return `controle_financeiro_${slug}_${mesParaArquivo(mes)}.xlsx`
}

/**
 * Salva a planilha XLSX em exports/.
 * @param {{ usuarioId:string, nomeUsuario?:string, mes:string, buffer:Buffer, diretorio?:string }} params
 * @returns {{ caminho:string, nomeArquivo:string, mimetype:string }}
 */
export function salvarXlsxExportacao({
  usuarioId,
  nomeUsuario,
  mes,
  buffer,
  diretorio = resolve("exports"),
}) {
  fs.mkdirSync(diretorio, { recursive: true })
  const nomeArquivo = gerarNomeArquivoXlsx({ usuarioId, nomeUsuario, mes })
  const caminho = resolve(diretorio, nomeArquivo)
  fs.writeFileSync(caminho, buffer)
  return { caminho, nomeArquivo, mimetype: XLSX_MIMETYPE }
}

export { XLSX_MIMETYPE }
