# relatorios-excel-exceljs

[![CI](https://github.com/sidsidoso/relatorios-excel-exceljs/actions/workflows/ci.yml/badge.svg)](https://github.com/sidsidoso/relatorios-excel-exceljs/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.12-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

Ferramenta de **linha de comando** em Node.js que lê vendas de um banco **SQLite** e gera um **relatório em Excel (.xlsx)** com ExcelJS: aba **Resumo** (matriz mês × vendedor com totais e médias), aba **Detalhado** (uma linha por venda), **fórmulas reais do Excel** (`SUM`, `AVERAGE`), **formato de moeda R$** e **formatação condicional**.

Um script de `seed` cria um banco com **dados fictícios determinísticos** (mesma semente, mesmos dados), útil para demonstração e testes.

## Tecnologias

- [Node.js](https://nodejs.org/) ≥ 20.12 (ES Modules, `node:util` `parseArgs`, `node:test`)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite síncrono e rápido, com prepared statements
- [ExcelJS 4.4.0](https://github.com/exceljs/exceljs) — escrita em streaming com `stream.xlsx.WorkbookWriter`

## Arquitetura

```
 npm run seed                                   npm start -- [opções]
 ────────────                                   ─────────────────────
 gerarVendas(semente)  (PRNG mulberry32)        parseArgs ─▶ valida período/saída
        │                                              │
        ▼                                              ▼
 popularBanco()  ── 1 transação ──▶  SQLite  ◀── consultas preparadas (somente leitura)
 (prepared statements)            dados/vendas.db     │  totais · resumo (GROUP BY mês, vendedor)
                                                      │  detalhes (.iterate(): linha a linha)
                                                      ▼
                                       ExcelJS WorkbookWriter (streaming)
                                         ├─ Resumo:    valores + =SUM / =AVERAGE + cores
                                         └─ Detalhado: =F*G por linha + =SUM + autofiltro
                                                      ▼
                                             relatorio-vendas.xlsx
```

`src/app.js` contém a lógica da CLI com argumentos, saída e configuração **injetados** (testável sem abrir processos); `src/cli.js` é só o ponto de entrada.

## Opções da CLI

| Opção                    | Descrição                                                  | Padrão                    |
|--------------------------|------------------------------------------------------------|---------------------------|
| `-i`, `--inicio <data>`  | Início do período: `AAAA-MM-DD` ou `AAAA-MM` (1º dia)      | data da primeira venda    |
| `-f`, `--fim <data>`     | Fim do período: `AAAA-MM-DD` ou `AAAA-MM` (último dia)     | data da última venda      |
| `-o`, `--saida <arq>`    | Arquivo de saída (precisa terminar em `.xlsx`)             | `relatorio-vendas.xlsx`   |
| `-b`, `--banco <arq>`    | Banco SQLite                                               | `dados/vendas.db`         |
| `-h`, `--ajuda`, `--help`| Mostra a ajuda                                             | —                         |

Códigos de saída: `0` sucesso, `1` erro de execução (banco ausente, período sem vendas), `2` uso incorreto (data inválida, opção desconhecida, `--inicio` depois de `--fim`).

O seed aceita `--banco` e `--semente` (`npm run seed -- --semente 7`).

## Exemplos (saídas reais)

```bash
npm run seed
```

```
Banco "dados/vendas.db" criado com 1.171 vendas (semente 42) em 41 ms.
```

Relatório do ano inteiro:

```bash
npm start
```

```
Relatório gerado: relatorio-vendas.xlsx
Período: 01/01/2025 a 31/12/2025 (12 meses)
Vendas: 1.171 | Vendedores: 5 | Total: R$ 2.857.554,63
Tempo: 119 ms
```

Primeiro semestre, em outra pasta:

```bash
npm start -- --inicio 2025-01 --fim 2025-06 --saida saida/semestre1.xlsx
```

```
Relatório gerado: saida/semestre1.xlsx
Período: 01/01/2025 a 30/06/2025 (6 meses)
Vendas: 541 | Vendedores: 5 | Total: R$ 1.344.797,94
Tempo: 105 ms
```

Erros de uso:

```bash
npm start -- -i 2025-02-30
# Erro: --inicio não é uma data válida: "2025-02-30"
#
# Use --ajuda para ver as opções.        (código de saída 2)

npm start -- -i 2030-01
# Erro: --inicio deve ser anterior ou igual a --fim
```

### Conteúdo da planilha gerada

Aba **Resumo** (trecho, valores exibidos com o formato `"R$" #,##0.00`):

| Linha | Mês          | Ana Ribeiro        | … | Elisa Moura        | Total do mês                     | Nº de vendas        |
|-------|--------------|--------------------|---|--------------------|----------------------------------|---------------------|
| 5     | jan/2025     | 56.930,88          | … | 36.048,66          | `=SUM(B5:F5)` → 238.148,78       | 88                  |
| 6     | fev/2025     | 41.978,75          | … | 21.633,61          | `=SUM(B6:F6)` → 221.987,98       | 92                  |
| …     | …            | …                  | … | …                  | …                                | …                   |
| 16    | dez/2025     | 105.265,14         | … | 26.361,77          | `=SUM(B16:F16)` → 320.992,33     | 143                 |
| 17    | **Total**    | `=SUM(B5:B16)` → 805.473,83 | … | `=SUM(F5:F16)` → 331.534,71 | `=SUM(G5:G16)` → 2.857.554,63 | `=SUM(H5:H16)` → 1.171 |
| 18    | Média mensal | `=AVERAGE(B5:B16)` → 67.122,82 | … | `=AVERAGE(F5:F16)` → 27.627,89 | `=AVERAGE(G5:G16)` → 238.129,55 | `=AVERAGE(H5:H16)` → 97,6 |
| 20    | Conferência (soma da aba Detalhado) | | | | `=SUM(Detalhado!H2:H1172)` → 2.857.554,63 | |

- título mesclado, cabeçalho azul com fonte branca, colunas da matriz e linha de cabeçalho congeladas;
- **formatação condicional**: escala de 3 cores (vermelho → amarelo → verde) na matriz mês × vendedor e destaque verde nos meses cujo total está **acima da média** (regra de expressão `G5>AVERAGE($G$5:$G$16)`).

Aba **Detalhado** (1.171 vendas + cabeçalho + total):

| Data       | Vendedor       | Região | Produto          | Categoria   | Qtd | Valor unitário | Total                     |
|------------|----------------|--------|------------------|-------------|-----|----------------|---------------------------|
| 01/01/2025 | Bruno Carvalho | Sul    | Webcam Full HD   | Periféricos | 1   | R$ 269,91      | `=F2*G2` → R$ 269,91      |
| 01/01/2025 | Bruno Carvalho | Sul    | Teclado mecânico | Periféricos | 5   | R$ 332,41      | `=F3*G3` → R$ 1.662,05    |
| …          |                |        |                  |             |     |                |                           |
| **Total**  |                |        |                  |             | `=SUM(F2:F1172)` → 3.461 | | `=SUM(H2:H1172)` → R$ 2.857.554,63 |

- datas como datas reais do Excel (`dd/mm/yyyy`), **autofiltro**, cabeçalho congelado e destaque (regra `cellIs`) para vendas acima de R$ 10.000,00.

## Decisões de implementação e otimizações

- **Dinheiro em centavos (inteiros)** no banco e nas somas; a conversão para reais só acontece ao escrever a célula. Assim os totais batem ao centavo, e o relatório confere `resumo == banco` antes de concluir.
- **Agregação no SQL** (`GROUP BY mês, vendedor`) para o resumo, com índice em `vendas(data)` para o filtro de período.
- **Prepared statements** em todas as consultas e inserts; o seed insere tudo em **uma única transação** (milhares de inserts em ~40 ms). O relatório abre o banco em **modo somente leitura**.
- **Streaming de ponta a ponta:** os detalhes são lidos com `.iterate()` (linha a linha) e cada linha é escrita e `commit()`ada no `WorkbookWriter`, que grava direto no disco, então o consumo de memória não cresce com o tamanho do relatório.
- **Fórmulas reais com resultado em cache:** cada fórmula leva também o `result` já calculado, então o arquivo exibe valores corretos mesmo em leitores que não recalculam (visualizadores, bibliotecas), e o Excel continua podendo recalcular.
- **Dados determinísticos:** PRNG `mulberry32` com semente fixa; os testes dependem disso.
- **Validação de entrada:** `parseArgs` em modo `strict` (opções desconhecidas e argumentos posicionais são rejeitados), datas inexistentes como `2025-02-30` são recusadas e `AAAA-MM` vira o primeiro/último dia do mês.

## Como rodar

Pré-requisitos: Node.js 20.12 ou superior e npm. O `better-sqlite3` usa binários pré-compilados para Windows, Linux e macOS; se não houver um para sua plataforma, ele compila na instalação (requer ferramentas de build C++).

```bash
git clone https://github.com/sidsidoso/relatorios-excel-exceljs.git
cd relatorios-excel-exceljs
npm install
npm run seed          # cria dados/vendas.db
npm start             # gera relatorio-vendas.xlsx
```

Para passar opções via npm use `--`: `npm start -- -i 2025-03 -f 2025-03 -o marco.xlsx`. Também é possível chamar direto: `node src/cli.js --ajuda`. `npm run dev` reexecuta a CLI ao salvar arquivos (`node --watch`).

Configuração opcional (o `.env` é carregado automaticamente):

```bash
cp .env.example .env              # Linux/macOS
```

```powershell
Copy-Item .env.example .env       # Windows (PowerShell)
```

| Variável          | Padrão                  | Descrição                         |
|-------------------|-------------------------|-----------------------------------|
| `BANCO_ARQUIVO`   | `dados/vendas.db`       | Banco SQLite                      |
| `RELATORIO_SAIDA` | `relatorio-vendas.xlsx` | Arquivo de saída padrão           |
| `SEED_SEMENTE`    | `42`                    | Semente dos dados fictícios       |

## Testes

```bash
npm test
```

Os testes (`node:test` + `node:assert/strict`) criam um banco temporário, geram relatórios e **reabrem os .xlsx com ExcelJS** para conferir abas, cabeçalhos, valores, fórmulas e seus resultados contra o próprio SQLite, formato R$, formatação condicional, autofiltro e linha congelada; também cobrem `parseArgs`, validação de datas, códigos de saída e a execução real de `node src/cli.js`. Funcionam igual no Windows, Linux e macOS.

```
ℹ tests 17
ℹ suites 4
ℹ pass 17
ℹ fail 0
```

## Estrutura de pastas

```
relatorios-excel-exceljs/
├── .github/workflows/ci.yml      # CI: Node 20 e 22
├── scripts/
│   └── seed.js                   # cria o banco com dados fictícios
├── src/
│   ├── cli.js                    # ponto de entrada (carrega .env, define o exit code)
│   ├── app.js                    # lógica da CLI (parseArgs, mensagens, códigos de saída)
│   ├── config.js                 # variáveis de ambiente
│   └── servicos/
│       ├── banco.js              # esquema, seed e consultas preparadas
│       ├── dadosFicticios.js     # PRNG e geração determinística de vendas
│       ├── periodo.js            # validação de datas e rótulos pt-BR
│       └── relatorio.js          # montagem da planilha (ExcelJS streaming)
├── tests/
│   ├── relatorio.test.js
│   └── unitarios.test.js
├── .env.example
└── LICENSE
```

## Observações

- O `exceljs@4.4.0` depende de uma versão antiga do `uuid`, que o `npm audit` aponta com severidade moderada (afeta `v3`/`v5`/`v6` quando recebem o parâmetro `buf`; o ExcelJS só chama `v4()` sem `buf`). A versão do ExcelJS foi mantida fixa de propósito.
- Gráficos não foram incluídos: o ExcelJS 4.4.0 não oferece API para criar gráficos.

## Referências

- [ExcelJS — documentação](https://github.com/exceljs/exceljs#readme) (Streaming I/O, Conditional Formatting, Formula Value)
- [better-sqlite3 — API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [Node.js — `util.parseArgs`](https://nodejs.org/api/util.html#utilparseargsconfig)
- [Microsoft — Códigos de formato de número no Excel](https://support.microsoft.com/pt-br/office/c%C3%B3digos-de-formato-de-n%C3%BAmero-5026bbd6-04bc-48cd-bf33-80f18b4eae68)
- [SQLite — Query Planning e índices](https://www.sqlite.org/queryplanner.html)

## Licença

[MIT](LICENSE) © 2026 sidsidoso
