// Monta o relatório .xlsx em streaming (ExcelJS WorkbookWriter): as linhas vão para o disco
// à medida que são escritas, sem manter a planilha inteira em memória.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import ExcelJS from 'exceljs';
import { dataBr, rotuloMes } from './periodo.js';

export class ErroRelatorio extends Error {}

export const MOEDA = '"R$" #,##0.00';
const INTEIRO = '#,##0';
const AZUL = 'FF1F4E78';
const CINZA = 'FFF2F2F2';

const letra = (n) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function estilizarCabecalho(linha) {
  linha.height = 20;
  linha.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function estilizarTotal(linha) {
  linha.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
    c.border = { top: { style: 'thin' } };
  });
}

/** Agrupa as linhas (mês, vendedor) do SQL numa matriz mês x vendedor, em centavos. */
export function montarMatriz(linhasResumo) {
  const vendedores = [...new Set(linhasResumo.map((l) => l.vendedor))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const meses = [...new Set(linhasResumo.map((l) => l.mes))].sort();
  const valores = new Map(meses.map((m) => [m, { porVendedor: new Map(), vendas: 0 }]));
  for (const l of linhasResumo) {
    const mes = valores.get(l.mes);
    mes.porVendedor.set(l.vendedor, l.totalCentavos);
    mes.vendas += l.vendas;
  }
  return { vendedores, meses, valores };
}

function escreverResumo(livro, { matriz, inicio, fim, totalVendas }) {
  const { vendedores, meses, valores } = matriz;
  const nV = vendedores.length;
  const colTotal = nV + 2;
  const colQtd = nV + 3;
  const L = { primeiroMes: 5, ultimoMes: 4 + meses.length };
  L.total = L.ultimoMes + 1;
  L.media = L.ultimoMes + 2;
  L.conferencia = L.ultimoMes + 4;
  const T = letra(colTotal);
  const ultimaVend = letra(nV + 1);

  const aba = livro.addWorksheet('Resumo', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }],
    properties: { tabColor: { argb: AZUL } }
  });
  aba.columns = [
    { width: 16 },
    ...vendedores.map((v) => ({ width: Math.max(16, v.length + 4) })),
    { width: 18 },
    { width: 14 }
  ];

  aba.mergeCells(1, 1, 1, colQtd);
  const titulo = aba.getRow(1);
  titulo.getCell(1).value = 'Relatório de Vendas';
  titulo.getCell(1).font = { bold: true, size: 16, color: { argb: AZUL } };
  titulo.height = 26;
  titulo.commit();

  aba.mergeCells(2, 1, 2, colQtd);
  const subtitulo = aba.getRow(2);
  subtitulo.getCell(1).value = `Período: ${dataBr(inicio)} a ${dataBr(fim)} — ${totalVendas.toLocaleString('pt-BR')} vendas`;
  subtitulo.getCell(1).font = { italic: true, color: { argb: 'FF595959' } };
  subtitulo.commit();
  aba.getRow(3).commit();

  const cabecalho = aba.getRow(4);
  cabecalho.values = ['Mês', ...vendedores, 'Total do mês', 'Nº de vendas'];
  estilizarCabecalho(cabecalho);
  cabecalho.commit();

  // Linhas de meses: valores vindos do SQL + fórmula SUM real para o total do mês
  const totaisVendedor = new Array(nV).fill(0);
  let totalGeral = 0;
  let totalQtd = 0;
  meses.forEach((mes, i) => {
    const r = L.primeiroMes + i;
    const { porVendedor, vendas } = valores.get(mes);
    const linha = aba.getRow(r);
    linha.getCell(1).value = rotuloMes(mes);
    let somaMes = 0;
    vendedores.forEach((v, j) => {
      const centavos = porVendedor.get(v) ?? 0;
      somaMes += centavos;
      totaisVendedor[j] += centavos;
      linha.getCell(j + 2).value = centavos / 100;
      linha.getCell(j + 2).numFmt = MOEDA;
    });
    totalGeral += somaMes;
    totalQtd += vendas;
    linha.getCell(colTotal).value = { formula: `SUM(B${r}:${ultimaVend}${r})`, result: somaMes / 100 };
    linha.getCell(colTotal).numFmt = MOEDA;
    linha.getCell(colTotal).font = { bold: true };
    linha.getCell(colQtd).value = vendas;
    linha.getCell(colQtd).numFmt = INTEIRO;
    linha.commit();
  });

  // Linha de totais (SUM) e de média mensal (AVERAGE) por coluna
  const intervalo = (c) => `${letra(c)}${L.primeiroMes}:${letra(c)}${L.ultimoMes}`;
  const linhaTotal = aba.getRow(L.total);
  const linhaMedia = aba.getRow(L.media);
  linhaTotal.getCell(1).value = 'Total';
  linhaMedia.getCell(1).value = 'Média mensal';
  const totaisColuna = [...totaisVendedor, totalGeral];
  totaisColuna.forEach((centavos, j) => {
    const c = j + 2;
    linhaTotal.getCell(c).value = { formula: `SUM(${intervalo(c)})`, result: centavos / 100 };
    linhaTotal.getCell(c).numFmt = MOEDA;
    linhaMedia.getCell(c).value = { formula: `AVERAGE(${intervalo(c)})`, result: centavos / 100 / meses.length };
    linhaMedia.getCell(c).numFmt = MOEDA;
  });
  linhaTotal.getCell(colQtd).value = { formula: `SUM(${intervalo(colQtd)})`, result: totalQtd };
  linhaTotal.getCell(colQtd).numFmt = INTEIRO;
  linhaMedia.getCell(colQtd).value = { formula: `AVERAGE(${intervalo(colQtd)})`, result: totalQtd / meses.length };
  linhaMedia.getCell(colQtd).numFmt = '#,##0.0';
  estilizarTotal(linhaTotal);
  linhaTotal.commit();
  linhaMedia.eachCell((c) => { c.font = { italic: true }; });
  linhaMedia.commit();

  // Conferência cruzada com a aba Detalhado (deve bater com o total geral)
  const conferencia = aba.getRow(L.conferencia);
  conferencia.getCell(1).value = 'Conferência (soma da aba Detalhado)';
  conferencia.getCell(1).font = { italic: true, color: { argb: 'FF595959' } };
  conferencia.getCell(colTotal).value = { formula: `SUM(Detalhado!H2:H${totalVendas + 1})`, result: totalGeral / 100 };
  conferencia.getCell(colTotal).numFmt = MOEDA;
  conferencia.commit();

  // Formatação condicional: escala de cores na matriz e destaque dos meses acima da média
  aba.addConditionalFormatting({
    ref: `B${L.primeiroMes}:${ultimaVend}${L.ultimoMes}`,
    rules: [{
      type: 'colorScale',
      priority: 1,
      cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
      color: [{ argb: 'FFF8696B' }, { argb: 'FFFFEB84' }, { argb: 'FF63BE7B' }]
    }]
  });
  aba.addConditionalFormatting({
    ref: `${T}${L.primeiroMes}:${T}${L.ultimoMes}`,
    rules: [{
      type: 'expression',
      priority: 2,
      formulae: [`${T}${L.primeiroMes}>AVERAGE($${T}$${L.primeiroMes}:$${T}$${L.ultimoMes})`],
      style: {
        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFC6EFCE' } },
        font: { color: { argb: 'FF006100' }, bold: true }
      }
    }]
  });

  aba.commit();
  return { totalGeral, totalQtd };
}

function escreverDetalhado(livro, linhas, totalVendas) {
  const aba = livro.addWorksheet('Detalhado', { views: [{ state: 'frozen', ySplit: 1 }] });
  aba.columns = [
    { header: 'Data', key: 'data', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Vendedor', key: 'vendedor', width: 18 },
    { header: 'Região', key: 'regiao', width: 14 },
    { header: 'Produto', key: 'produto', width: 22 },
    { header: 'Categoria', key: 'categoria', width: 14 },
    { header: 'Qtd', key: 'quantidade', width: 7, style: { numFmt: INTEIRO } },
    { header: 'Valor unitário', key: 'valorUnitario', width: 16, style: { numFmt: MOEDA } },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: MOEDA } }
  ];
  estilizarCabecalho(aba.getRow(1));
  aba.getRow(1).commit();

  let r = 1;
  let somaQtd = 0;
  let somaCentavos = 0;
  for (const l of linhas) {
    r++;
    somaQtd += l.quantidade;
    somaCentavos += l.quantidade * l.valorUnitarioCentavos;
    aba.addRow({
      data: new Date(`${l.data}T00:00:00Z`),
      vendedor: l.vendedor,
      regiao: l.regiao,
      produto: l.produto,
      categoria: l.categoria,
      quantidade: l.quantidade,
      valorUnitario: l.valorUnitarioCentavos / 100,
      // Fórmula real; o "result" guarda o valor já calculado para leitores que não recalculam
      total: { formula: `F${r}*G${r}`, result: (l.quantidade * l.valorUnitarioCentavos) / 100 }
    }).commit();
  }
  if (r - 1 !== totalVendas) throw new ErroRelatorio('Quantidade de linhas divergente durante a exportação');

  const total = aba.addRow({
    data: 'Total',
    quantidade: { formula: `SUM(F2:F${r})`, result: somaQtd },
    total: { formula: `SUM(H2:H${r})`, result: somaCentavos / 100 }
  });
  estilizarTotal(total);
  total.commit();

  aba.autoFilter = `A1:H${r}`;
  // Destaca vendas acima de R$ 10.000,00
  aba.addConditionalFormatting({
    ref: `H2:H${r}`,
    rules: [{
      type: 'cellIs',
      operator: 'greaterThan',
      priority: 1,
      formulae: [10000],
      style: { font: { color: { argb: 'FF1F4E78' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDDEBF7' } } }
    }]
  });
  aba.commit();
}

/**
 * Gera o relatório do período [inicio, fim] (datas ISO) no arquivo informado.
 * @returns {Promise<{ arquivo, vendas, totalCentavos, vendedores, meses }>}
 */
export async function gerarRelatorio({ consultas, inicio, fim, arquivo }) {
  const { vendas: totalVendas, totalCentavos } = consultas.totais(inicio, fim);
  if (totalVendas === 0) throw new ErroRelatorio(`Nenhuma venda encontrada entre ${dataBr(inicio)} e ${dataBr(fim)}.`);

  const matriz = montarMatriz(consultas.resumo(inicio, fim));
  mkdirSync(dirname(arquivo), { recursive: true });

  const livro = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: arquivo, useStyles: true, useSharedStrings: true });
  livro.creator = 'relatorios-excel-exceljs';
  livro.created = new Date();

  const { totalGeral } = escreverResumo(livro, { matriz, inicio, fim, totalVendas });
  if (totalGeral !== totalCentavos) throw new ErroRelatorio('Totais divergentes entre resumo e banco');
  escreverDetalhado(livro, consultas.detalhes(inicio, fim), totalVendas);
  await livro.commit();
  return { arquivo, vendas: totalVendas, totalCentavos, vendedores: matriz.vendedores.length, meses: matriz.meses.length };
}
