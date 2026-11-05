// Lógica da CLI separada do processo (argv, saída e config injetados) para facilitar os testes
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { carregarConfig } from './config.js';
import { abrirBancoLeitura, criarConsultas, ErroBanco } from './servicos/banco.js';
import { dataBr, ErroUso, normalizarData } from './servicos/periodo.js';
import { ErroRelatorio, gerarRelatorio } from './servicos/relatorio.js';

export const AJUDA = `Uso: relatorio-vendas [opções]

Gera um relatório de vendas em Excel (.xlsx) a partir do banco SQLite.

Opções:
  -i, --inicio <data>   Início do período (AAAA-MM-DD ou AAAA-MM). Padrão: primeira venda
  -f, --fim <data>      Fim do período (AAAA-MM-DD ou AAAA-MM). Padrão: última venda
  -o, --saida <arq>     Arquivo .xlsx de saída. Padrão: relatorio-vendas.xlsx
  -b, --banco <arq>     Banco SQLite. Padrão: dados/vendas.db
  -h, --ajuda, --help   Mostra esta ajuda

Exemplos:
  relatorio-vendas --inicio 2025-01 --fim 2025-06 --saida saida/semestre1.xlsx
  relatorio-vendas -i 2025-03-01 -f 2025-03-31`;

const OPCOES = {
  inicio: { type: 'string', short: 'i' },
  fim: { type: 'string', short: 'f' },
  saida: { type: 'string', short: 'o' },
  banco: { type: 'string', short: 'b' },
  ajuda: { type: 'boolean', short: 'h' },
  help: { type: 'boolean' }
};

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function lerArgumentos(argv, config) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: OPCOES, strict: true, allowPositionals: false }));
  } catch (err) {
    throw new ErroUso(err.message);
  }
  if (values.ajuda || values.help) return { ajuda: true };

  const saida = values.saida ?? config.saida;
  if (extname(saida).toLowerCase() !== '.xlsx') throw new ErroUso('--saida deve terminar em .xlsx');

  return {
    inicio: values.inicio ? normalizarData(values.inicio, { nome: 'inicio' }) : null,
    fim: values.fim ? normalizarData(values.fim, { nome: 'fim', fimDoMes: true }) : null,
    saida,
    banco: values.banco ?? config.banco
  };
}

/**
 * Executa a CLI e devolve o código de saída: 0 (ok), 1 (erro de execução), 2 (uso incorreto).
 */
export async function executar(argv, { config = carregarConfig(), log = console.log, erro = console.error } = {}) {
  let db;
  try {
    const args = lerArgumentos(argv, config);
    if (args.ajuda) {
      log(AJUDA);
      return 0;
    }

    db = abrirBancoLeitura(args.banco);
    const consultas = criarConsultas(db);
    const limites = consultas.limites();
    const inicio = args.inicio ?? limites.inicio;
    const fim = args.fim ?? limites.fim;
    if (!inicio || !fim) throw new ErroRelatorio('O banco não possui vendas. Rode "npm run seed".');
    if (inicio > fim) throw new ErroUso('--inicio deve ser anterior ou igual a --fim');

    const t0 = performance.now();
    const r = await gerarRelatorio({ consultas, inicio, fim, arquivo: resolve(args.saida) });
    const ms = Math.round(performance.now() - t0);

    log(`Relatório gerado: ${args.saida}`);
    log(`Período: ${dataBr(inicio)} a ${dataBr(fim)} (${r.meses} ${r.meses === 1 ? 'mês' : 'meses'})`);
    log(`Vendas: ${r.vendas.toLocaleString('pt-BR')} | Vendedores: ${r.vendedores} | Total: ${reais(r.totalCentavos)}`);
    log(`Tempo: ${ms} ms`);
    return 0;
  } catch (err) {
    if (err instanceof ErroUso) {
      erro(`Erro: ${err.message}\n\nUse --ajuda para ver as opções.`);
      return 2;
    }
    if (err instanceof ErroBanco || err instanceof ErroRelatorio) {
      erro(`Erro: ${err.message}`);
      return 1;
    }
    erro(`Erro inesperado: ${err.message}`);
    return 1;
  } finally {
    db?.close();
  }
}
