// Cria (ou recria) o banco SQLite com dados fictícios determinísticos.
// Uso: npm run seed -- [--banco dados/vendas.db] [--semente 42]
import { parseArgs } from 'node:util';
import { carregarConfig } from '../src/config.js';
import { popularBanco } from '../src/servicos/banco.js';
import { gerarVendas } from '../src/servicos/dadosFicticios.js';

try {
  process.loadEnvFile();
} catch {
  // sem .env
}

const config = carregarConfig();
const { values } = parseArgs({
  options: {
    banco: { type: 'string', short: 'b', default: config.banco },
    semente: { type: 'string', short: 's', default: String(config.semente) }
  }
});

const semente = Number.parseInt(values.semente, 10);
if (!Number.isInteger(semente)) {
  console.error('A semente deve ser um número inteiro.');
  process.exit(2);
}

const inicio = performance.now();
const vendas = gerarVendas({ semente });
const db = popularBanco(values.banco, vendas);
db.close();

const ms = Math.round(performance.now() - inicio);
console.log(`Banco "${values.banco}" criado com ${vendas.length.toLocaleString('pt-BR')} vendas (semente ${semente}) em ${ms} ms.`);
