import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lerArgumentos } from '../src/app.js';
import { popularBanco } from '../src/servicos/banco.js';
import { criarAleatorio, gerarVendas } from '../src/servicos/dadosFicticios.js';
import { ErroUso, normalizarData, rotuloMes } from '../src/servicos/periodo.js';
import { montarMatriz } from '../src/servicos/relatorio.js';

const config = { banco: 'dados/vendas.db', saida: 'relatorio-vendas.xlsx' };

describe('dados fictícios', () => {
  it('o gerador aleatório é determinístico', () => {
    const a = criarAleatorio(7);
    const b = criarAleatorio(7);
    const seqA = Array.from({ length: 5 }, a);
    assert.deepEqual(seqA, Array.from({ length: 5 }, b));
    assert.ok(seqA.every((x) => x >= 0 && x < 1));
  });

  it('mesma semente gera exatamente as mesmas vendas; semente diferente, outras', () => {
    assert.deepEqual(gerarVendas({ semente: 42 }), gerarVendas({ semente: 42 }));
    assert.notDeepEqual(gerarVendas({ semente: 42 }), gerarVendas({ semente: 43 }));
  });

  it('gera um ano inteiro com valores válidos', () => {
    const vendas = gerarVendas({ semente: 42 });
    assert.equal(vendas[0].data, '2025-01-01');
    assert.equal(vendas.at(-1).data, '2025-12-31');
    assert.ok(vendas.every((v) => v.quantidade >= 1 && v.quantidade <= 5 && Number.isInteger(v.valorUnitarioCentavos)));
  });

  it('o banco é populado com prepared statements em uma transação', () => {
    const db = popularBanco(':memory:', gerarVendas({ semente: 1 }));
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM vendas').get();
    assert.equal(n, gerarVendas({ semente: 1 }).length);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vendedores').get().n, 5);
    db.close();
  });
});

describe('período e argumentos', () => {
  it('normaliza datas completas e mês/ano', () => {
    assert.equal(normalizarData('2025-03-15'), '2025-03-15');
    assert.equal(normalizarData('2025-02'), '2025-02-01');
    assert.equal(normalizarData('2025-02', { fimDoMes: true }), '2025-02-28');
    assert.equal(normalizarData('2024-02', { fimDoMes: true }), '2024-02-29');
  });

  it('rejeita datas inválidas ou mal formatadas', () => {
    for (const d of ['2025-02-30', '2025-13-01', '15/03/2025', '2025-3-1', '']) {
      assert.throws(() => normalizarData(d), ErroUso, d);
    }
  });

  it('formata rótulos de mês em pt-BR', () => {
    assert.equal(rotuloMes('2025-03'), 'mar/2025');
    assert.equal(rotuloMes('2025-12'), 'dez/2025');
  });

  it('lê argumentos longos e curtos com parseArgs', () => {
    assert.deepEqual(lerArgumentos(['-i', '2025-01', '--fim', '2025-03', '-o', 'x.xlsx'], config), {
      inicio: '2025-01-01', fim: '2025-03-31', saida: 'x.xlsx', banco: 'dados/vendas.db'
    });
    assert.deepEqual(lerArgumentos(['--ajuda'], config), { ajuda: true });
    assert.equal(lerArgumentos([], config).inicio, null);
  });

  it('rejeita opção desconhecida e saída sem .xlsx', () => {
    assert.throws(() => lerArgumentos(['--xyz'], config), ErroUso);
    assert.throws(() => lerArgumentos(['--saida', 'relatorio.csv'], config), /\.xlsx/);
    assert.throws(() => lerArgumentos(['extra'], config), ErroUso);
  });
});

describe('matriz mês x vendedor', () => {
  it('agrupa e ordena meses e vendedores, somando o nº de vendas', () => {
    const m = montarMatriz([
      { mes: '2025-02', vendedor: 'Bia', totalCentavos: 500, vendas: 1 },
      { mes: '2025-01', vendedor: 'Ana', totalCentavos: 1000, vendas: 2 },
      { mes: '2025-02', vendedor: 'Ana', totalCentavos: 250, vendas: 3 }
    ]);
    assert.deepEqual(m.vendedores, ['Ana', 'Bia']);
    assert.deepEqual(m.meses, ['2025-01', '2025-02']);
    assert.equal(m.valores.get('2025-02').vendas, 4);
    assert.equal(m.valores.get('2025-01').porVendedor.get('Bia'), undefined);
  });
});
