// Acesso ao SQLite com better-sqlite3 (síncrono e rápido); todas as consultas usam prepared statements.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { PRODUTOS, VENDEDORES } from './dadosFicticios.js';

const ESQUEMA = `
  DROP TABLE IF EXISTS vendas;
  DROP TABLE IF EXISTS produtos;
  DROP TABLE IF EXISTS vendedores;

  CREATE TABLE vendedores (
    id     INTEGER PRIMARY KEY,
    nome   TEXT NOT NULL,
    regiao TEXT NOT NULL
  );

  CREATE TABLE produtos (
    id             INTEGER PRIMARY KEY,
    nome           TEXT NOT NULL,
    categoria      TEXT NOT NULL,
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0)
  );

  CREATE TABLE vendas (
    id                      INTEGER PRIMARY KEY,
    data                    TEXT NOT NULL,             -- AAAA-MM-DD
    vendedor_id             INTEGER NOT NULL REFERENCES vendedores(id),
    produto_id              INTEGER NOT NULL REFERENCES produtos(id),
    quantidade              INTEGER NOT NULL CHECK (quantidade > 0),
    valor_unitario_centavos INTEGER NOT NULL CHECK (valor_unitario_centavos > 0)
  );

  CREATE INDEX idx_vendas_data ON vendas (data);
`;

export class ErroBanco extends Error {}

/** Abre o banco existente em modo somente leitura (para relatórios). */
export function abrirBancoLeitura(arquivo) {
  if (!existsSync(arquivo)) {
    throw new ErroBanco(`Banco não encontrado: ${arquivo}. Rode "npm run seed" para criá-lo.`);
  }
  return new Database(arquivo, { readonly: true, fileMustExist: true });
}

/** Recria o esquema e insere vendedores, produtos e vendas em uma única transação. */
export function popularBanco(arquivo, vendas) {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('foreign_keys = ON');
  db.exec(ESQUEMA);

  const inserirVendedor = db.prepare('INSERT INTO vendedores (id, nome, regiao) VALUES (@id, @nome, @regiao)');
  const inserirProduto = db.prepare(
    'INSERT INTO produtos (id, nome, categoria, preco_centavos) VALUES (@id, @nome, @categoria, @precoCentavos)'
  );
  const inserirVenda = db.prepare(`
    INSERT INTO vendas (data, vendedor_id, produto_id, quantidade, valor_unitario_centavos)
    VALUES (@data, @vendedorId, @produtoId, @quantidade, @valorUnitarioCentavos)
  `);

  // Transação única: milhares de inserts viram uma só escrita em disco
  db.transaction(() => {
    for (const v of VENDEDORES) inserirVendedor.run(v);
    for (const p of PRODUTOS) inserirProduto.run(p);
    for (const v of vendas) inserirVenda.run(v);
  })();
  return db;
}

/** Consultas usadas pelo relatório (statements preparados uma única vez). */
export function criarConsultas(db) {
  const limites = db.prepare('SELECT MIN(data) AS inicio, MAX(data) AS fim FROM vendas');
  const resumo = db.prepare(`
    SELECT substr(v.data, 1, 7)                         AS mes,
           ve.nome                                       AS vendedor,
           SUM(v.quantidade * v.valor_unitario_centavos) AS totalCentavos,
           COUNT(*)                                      AS vendas
      FROM vendas v
      JOIN vendedores ve ON ve.id = v.vendedor_id
     WHERE v.data BETWEEN ? AND ?
     GROUP BY mes, ve.id
     ORDER BY mes, ve.nome
  `);
  const detalhes = db.prepare(`
    SELECT v.data, ve.nome AS vendedor, ve.regiao, p.nome AS produto, p.categoria,
           v.quantidade, v.valor_unitario_centavos AS valorUnitarioCentavos
      FROM vendas v
      JOIN vendedores ve ON ve.id = v.vendedor_id
      JOIN produtos p    ON p.id  = v.produto_id
     WHERE v.data BETWEEN ? AND ?
     ORDER BY v.data, v.id
  `);
  const totais = db.prepare(`
    SELECT COUNT(*) AS vendas, COALESCE(SUM(quantidade * valor_unitario_centavos), 0) AS totalCentavos
      FROM vendas WHERE data BETWEEN ? AND ?
  `);

  return {
    limites: () => limites.get(),
    resumo: (inicio, fim) => resumo.all(inicio, fim),
    // iterate(): percorre linha a linha, sem carregar tudo em memória
    detalhes: (inicio, fim) => detalhes.iterate(inicio, fim),
    totais: (inicio, fim) => totais.get(inicio, fim)
  };
}
