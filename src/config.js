// Padrões lidos de variáveis de ambiente; os argumentos da CLI têm prioridade
export function carregarConfig(env = process.env) {
  return {
    banco: env.BANCO_ARQUIVO ?? 'dados/vendas.db',
    saida: env.RELATORIO_SAIDA ?? 'relatorio-vendas.xlsx',
    semente: Number.parseInt(env.SEED_SEMENTE ?? '42', 10)
  };
}
