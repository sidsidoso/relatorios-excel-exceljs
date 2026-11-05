// Validação e normalização do período (AAAA-MM-DD ou AAAA-MM)
export class ErroUso extends Error {}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function ultimoDiaDoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Converte o texto em data ISO. "AAAA-MM" vira o primeiro (ou último, se fimDoMes) dia do mês.
 */
export function normalizarData(texto, { fimDoMes = false, nome = 'data' } = {}) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(texto ?? '');
  if (!m) throw new ErroUso(`--${nome} deve estar no formato AAAA-MM-DD ou AAAA-MM (recebido: "${texto}")`);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = m[3] ? Number(m[3]) : (fimDoMes ? ultimoDiaDoMes(ano, mes) : 1);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita datas inexistentes (ex.: 2025-02-30), que o Date "corrigiria" silenciosamente
  if (mes < 1 || mes > 12 || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new ErroUso(`--${nome} não é uma data válida: "${texto}"`);
  }
  return data.toISOString().slice(0, 10);
}

/** "2025-03" -> "mar/2025" */
export const rotuloMes = (anoMes) => `${MESES[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(0, 4)}`;

/** "2025-03-01" -> "01/03/2025" */
export const dataBr = (iso) => iso.split('-').reverse().join('/');
