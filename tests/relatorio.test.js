import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import { executar } from '../src/app.js';
import { popularBanco } from '../src/servicos/banco.js';
import { gerarVendas } from '../src/servicos/dadosFicticios.js';

const execFileP = promisify(execFile);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

/** Executa a CLI em memória, capturando a saída. */
async function rodar(argv, config) {
  const saida = [];
  const erros = [];
  const codigo = await executar(argv, { config, log: (m) => saida.push(m), erro: (m) => erros.push(m) });
  return { codigo, saida: saida.join('\n'), erros: erros.join('\n') };
}

async function abrirPlanilha(arquivo) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(arquivo);
  return livro;
}

describe('relatório Excel', () => {
  let pasta, banco, config, db;

  before(() => {
    pasta = mkdtempSync(join(tmpdir(), 'relatorio-teste-'));
    banco = join(pasta, 'vendas.db');
    popularBanco(banco, gerarVendas({ semente: 42 })).close();
    config = { banco, saida: join(pasta, 'padrao.xlsx') };
    db = new Database(banco, { readonly: true });
  });

  after(() => {
    db.close();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('gera o relatório do ano com abas Resumo e Detalhado', async () => {
    const arquivo = join(pasta, 'ano.xlsx');
    const r = await rodar(['--saida', arquivo], config);
    assert.equal(r.codigo, 0, r.erros);
    assert.match(r.saida, /Período: 01\/01\/2025 a 31\/12\/2025 \(12 meses\)/);

    const livro = await abrirPlanilha(arquivo);
    assert.deepEqual(livro.worksheets.map((w) => w.name), ['Resumo', 'Detalhado']);

    const resumo = livro.getWorksheet('Resumo');
    assert.equal(resumo.getCell('A1').value, 'Relatório de Vendas');
    const vendedores = db.prepare('SELECT nome FROM vendedores ORDER BY nome').pluck().all();
    assert.deepEqual(resumo.getRow(4).values.slice(1), ['Mês', ...vendedores, 'Total do mês', 'Nº de vendas']);
    assert.equal(resumo.getCell('A5').value, 'jan/2025');
    assert.equal(resumo.getCell('A16').value, 'dez/2025');
  });

  it('usa fórmulas SUM/AVERAGE reais com resultados que batem com o banco', async () => {
    const arquivo = join(pasta, 'formulas.xlsx');
    await rodar(['-o', arquivo], config);
    const resumo = (await abrirPlanilha(arquivo)).getWorksheet('Resumo');

    // Total de março (linha 7): fórmula SUM na coluna G (5 vendedores => B..F)
    const marco = db.prepare(`SELECT SUM(quantidade * valor_unitario_centavos) AS c, COUNT(*) AS n
                                FROM vendas WHERE data LIKE '2025-03-%'`).get();
    assert.deepEqual(resumo.getCell('G7').value, { formula: 'SUM(B7:F7)', result: marco.c / 100 });
    assert.equal(resumo.getCell('H7').value, marco.n);

    // Linha Total (17) e Média mensal (18)
    const total = db.prepare('SELECT SUM(quantidade * valor_unitario_centavos) AS c, COUNT(*) AS n FROM vendas').get();
    assert.deepEqual(resumo.getCell('G17').value, { formula: 'SUM(G5:G16)', result: total.c / 100 });
    assert.equal(resumo.getCell('G18').value.formula, 'AVERAGE(G5:G16)');
    assert.ok(Math.abs(resumo.getCell('G18').value.result - total.c / 100 / 12) < 1e-6);
    assert.deepEqual(resumo.getCell('H17').value, { formula: 'SUM(H5:H16)', result: total.n });

    // Soma por vendedor na coluna B
    const primeiro = db.prepare(`SELECT SUM(v.quantidade * v.valor_unitario_centavos) AS c FROM vendas v
                                  JOIN vendedores ve ON ve.id = v.vendedor_id WHERE ve.nome = ?`)
      .get(resumo.getCell('B4').value);
    assert.equal(resumo.getCell('B17').value.result, primeiro.c / 100);

    // Conferência cruzada com a aba Detalhado
    assert.equal(resumo.getCell('G20').value.formula, `SUM(Detalhado!H2:H${total.n + 1})`);
  });

  it('aplica formato de moeda R$ e formatação condicional', async () => {
    const arquivo = join(pasta, 'formatos.xlsx');
    await rodar(['-o', arquivo], config);
    const livro = await abrirPlanilha(arquivo);
    const resumo = livro.getWorksheet('Resumo');

    assert.equal(resumo.getCell('B5').numFmt, '"R$" #,##0.00');
    assert.equal(resumo.getCell('G17').numFmt, '"R$" #,##0.00');
    assert.equal(resumo.getCell('A1').font.bold, true);
    assert.equal(resumo.getCell('B4').font.bold, true);

    const tipos = resumo.conditionalFormattings.map((cf) => [cf.ref, cf.rules[0].type]);
    assert.deepEqual(tipos, [['B5:F16', 'colorScale'], ['G5:G16', 'expression']]);
    assert.equal(resumo.conditionalFormattings[1].rules[0].formulae[0], 'G5>AVERAGE($G$5:$G$16)');

    const detalhado = livro.getWorksheet('Detalhado');
    const regraDet = detalhado.conditionalFormattings[0].rules[0];
    assert.equal(regraDet.type, 'cellIs');
    assert.equal(regraDet.operator, 'greaterThan');
  });

  it('aba Detalhado tem uma linha por venda, fórmula por linha, autofiltro e cabeçalho congelado', async () => {
    const arquivo = join(pasta, 'detalhado.xlsx');
    await rodar(['-i', '2025-03', '-f', '2025-03', '-o', arquivo], config);
    const det = (await abrirPlanilha(arquivo)).getWorksheet('Detalhado');

    const vendas = db.prepare(`SELECT v.data, v.quantidade, v.valor_unitario_centavos AS c FROM vendas v
                                WHERE data BETWEEN '2025-03-01' AND '2025-03-31' ORDER BY v.data, v.id`).all();
    assert.equal(det.rowCount, vendas.length + 2); // cabeçalho + vendas + total
    assert.deepEqual(det.getRow(1).values.slice(1),
      ['Data', 'Vendedor', 'Região', 'Produto', 'Categoria', 'Qtd', 'Valor unitário', 'Total']);

    const a2 = det.getCell('A2');
    assert.ok(a2.value instanceof Date);
    assert.equal(a2.value.toISOString().slice(0, 10), vendas[0].data);
    assert.equal(a2.numFmt, 'dd/mm/yyyy');
    assert.equal(det.getCell('G2').value, vendas[0].c / 100);
    assert.deepEqual(det.getCell('H2').value, { formula: 'F2*G2', result: (vendas[0].quantidade * vendas[0].c) / 100 });

    const ultima = vendas.length + 2;
    assert.equal(det.getCell(`A${ultima}`).value, 'Total');
    assert.equal(det.getCell(`H${ultima}`).value.formula, `SUM(H2:H${ultima - 1})`);
    const totalCentavos = vendas.reduce((s, v) => s + v.quantidade * v.c, 0);
    assert.equal(det.getCell(`H${ultima}`).value.result, totalCentavos / 100);

    assert.equal(det.autoFilter, `A1:H${ultima - 1}`);
    assert.equal(det.views[0].state, 'frozen');
    assert.equal(det.views[0].ySplit, 1);
  });

  it('respeita o período: só os meses pedidos aparecem no resumo', async () => {
    const arquivo = join(pasta, 'trimestre.xlsx');
    const r = await rodar(['--inicio', '2025-04-01', '--fim', '2025-06-30', '--saida', arquivo], config);
    assert.equal(r.codigo, 0);
    const resumo = (await abrirPlanilha(arquivo)).getWorksheet('Resumo');
    assert.deepEqual([5, 6, 7].map((l) => resumo.getCell(`A${l}`).value), ['abr/2025', 'mai/2025', 'jun/2025']);
    assert.equal(resumo.getCell('A8').value, 'Total');
  });

  it('erros de uso devolvem código 2; banco ausente ou período vazio, código 1', async () => {
    const invalida = await rodar(['--inicio', '2025-02-30'], config);
    assert.equal(invalida.codigo, 2);
    assert.match(invalida.erros, /não é uma data válida/);

    assert.equal((await rodar(['--inicio', '2025-06', '--fim', '2025-01'], config)).codigo, 2);

    const semBanco = await rodar([], { ...config, banco: join(pasta, 'nao-existe.db') });
    assert.equal(semBanco.codigo, 1);
    assert.match(semBanco.erros, /npm run seed/);

    const vazio = await rodar(['-i', '2030-01', '-f', '2030-12'], config);
    assert.equal(vazio.codigo, 1);
    assert.match(vazio.erros, /Nenhuma venda/);
  });

  it('funciona como processo de linha de comando (node src/cli.js)', async () => {
    const arquivo = join(pasta, 'cli.xlsx');
    const { stdout } = await execFileP(process.execPath, [CLI, '-b', banco, '-i', '2025-01', '-f', '2025-01', '-o', arquivo]);
    assert.match(stdout, /Relatório gerado: .*cli\.xlsx/);
    assert.match(stdout, /Vendedores: 5/);

    const ajuda = await execFileP(process.execPath, [CLI, '--help']);
    assert.match(ajuda.stdout, /Uso: relatorio-vendas/);

    await assert.rejects(execFileP(process.execPath, [CLI, '--opcao-invalida']), (err) => err.code === 2);
  });
});
