// Geração determinística de dados fictícios: mesma semente => mesmos dados, sempre.

/** PRNG mulberry32: pequeno, rápido e reprodutível (não usar para criptografia). */
export function criarAleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VENDEDORES = [
  { id: 1, nome: 'Ana Ribeiro', regiao: 'Sudeste' },
  { id: 2, nome: 'Bruno Carvalho', regiao: 'Sul' },
  { id: 3, nome: 'Camila Rocha', regiao: 'Nordeste' },
  { id: 4, nome: 'Diego Santana', regiao: 'Centro-Oeste' },
  { id: 5, nome: 'Elisa Moura', regiao: 'Norte' }
];

// Preços em centavos (inteiros evitam erro de arredondamento com dinheiro)
export const PRODUTOS = [
  { id: 1, nome: 'Notebook 14"', categoria: 'Informática', precoCentavos: 389900 },
  { id: 2, nome: 'Monitor 27"', categoria: 'Informática', precoCentavos: 149990 },
  { id: 3, nome: 'Teclado mecânico', categoria: 'Periféricos', precoCentavos: 34990 },
  { id: 4, nome: 'Mouse sem fio', categoria: 'Periféricos', precoCentavos: 12990 },
  { id: 5, nome: 'Headset USB', categoria: 'Periféricos', precoCentavos: 24990 },
  { id: 6, nome: 'Cadeira ergonômica', categoria: 'Mobiliário', precoCentavos: 179900 },
  { id: 7, nome: 'Mesa regulável', categoria: 'Mobiliário', precoCentavos: 249900 },
  { id: 8, nome: 'Webcam Full HD', categoria: 'Periféricos', precoCentavos: 29990 }
];

const PESOS_VENDEDORES = [0.3, 0.25, 0.2, 0.15, 0.1];
const PESOS_PRODUTOS = [0.08, 0.1, 0.14, 0.2, 0.15, 0.08, 0.05, 0.2];

function sortearPorPeso(aleatorio, pesos) {
  let r = aleatorio();
  for (let i = 0; i < pesos.length; i++) {
    r -= pesos[i];
    if (r < 0) return i;
  }
  return pesos.length - 1;
}

/** Gera as vendas de um ano inteiro (padrão: 2025). */
export function gerarVendas({ semente = 42, ano = 2025 } = {}) {
  const aleatorio = criarAleatorio(semente);
  const vendas = [];
  for (let dia = new Date(Date.UTC(ano, 0, 1)); dia.getUTCFullYear() === ano; dia.setUTCDate(dia.getUTCDate() + 1)) {
    const fimDeSemana = dia.getUTCDay() === 0 || dia.getUTCDay() === 6;
    // Sazonalidade simples: mais vendas no fim do ano
    const extra = dia.getUTCMonth() >= 10 ? 2 : 0;
    const quantidadeNoDia = fimDeSemana ? 1 + Math.floor(aleatorio() * 2) : 2 + extra + Math.floor(aleatorio() * 4);
    const data = dia.toISOString().slice(0, 10);

    for (let i = 0; i < quantidadeNoDia; i++) {
      const vendedor = VENDEDORES[sortearPorPeso(aleatorio, PESOS_VENDEDORES)];
      const produto = PRODUTOS[sortearPorPeso(aleatorio, PESOS_PRODUTOS)];
      const desconto = Math.floor(aleatorio() * 3) * 0.05; // 0%, 5% ou 10%
      vendas.push({
        data,
        vendedorId: vendedor.id,
        produtoId: produto.id,
        quantidade: 1 + Math.floor(aleatorio() * 5),
        valorUnitarioCentavos: Math.round(produto.precoCentavos * (1 - desconto))
      });
    }
  }
  return vendas;
}
