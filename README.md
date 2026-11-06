# Spreadsheet

Planilha no navegador com grade de células endereçadas em A1, barra de fórmulas e um motor de fórmulas próprio: tokenizador, parser (com precedência de operadores no estilo Excel), avaliador, grafo de dependências com detecção de ciclos e recálculo incremental em ordem topológica. Funções: `SUM`, `AVERAGE`/`AVG`, `MIN`, `MAX`, `COUNT`, `IF`, `ROUND`, `ABS`, `SQRT`, `AND`, `OR`, `NOT`, `CONCAT`.

Sem bibliotecas e sem build. O motor é independente do DOM e tem mais de cem testes.

## Por que este projeto

Planilhas são o exemplo clássico de um problema que parece simples e esconde ciência da computação de verdade: compiladores (análise léxica e sintática), grafos (ordenação topológica, ciclos) e invalidação de cache. É um tema recorrente em entrevistas de engenharia sênior e em produtos como Google Sheets, Airtable e Notion. O projeto mostra:

- um tokenizador e um parser descendente recursivo com precedência bem definida, de ponta a ponta, sem geradores de parser;
- avaliação de AST com propagação de erros (`#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`, `#NUM!`, `#CYCLE!`, `#ERROR!`);
- recálculo incremental: só as células afetadas são recalculadas, na ordem certa;
- detecção de ciclos com o algoritmo de Kahn e extração do caminho do ciclo por busca em profundidade iterativa;
- engenharia de testes: casos de borda de gramática, ordem de avaliação, recuperação após quebrar um ciclo e carga com milhares de dependências.

## Recursos

- Grade de 26 colunas × 100 linhas com cabeçalhos fixos e rolagem.
- Referências A1, absolutas (`$A$1`) e intervalos (`A1:C10`); referências fora da grade geram `#REF!`.
- Operadores: `+ - * / ^ & %`, comparações (`= <> < > <= >=`), parênteses e menos unário.
- Recálculo automático de toda a cadeia de dependências a cada edição.
- Detecção de referência circular, inclusive indireta: as células envolvidas (e as que dependem delas) mostram `#CYCLE!`, e voltam ao normal quando o ciclo é desfeito.
- Barra de fórmulas, caixa de nome (clique para ir a uma célula) e painel "Reads / Used by / Cycle" para a célula selecionada.
- Teclado: setas, digitar para editar, `Enter`, `Tab`, `Esc`, `F2`, `Delete`, `PageUp`/`PageDown`.
- Persistência em `localStorage`, exportação em CSV e uma planilha de exemplo (nota de compra com subtotal, imposto e total).

## Como executar

Abra o `index.html` no navegador ou use um servidor local:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

Se o navegador bloquear ES modules em `file://`, use o servidor local. Para ver um ciclo, digite `=F2` em F3 e `=F3` em F2.

## Como testar

Dentro desta pasta, com Node 18 ou superior:

```bash
node --test
```

São 110 testes distribuídos em seis arquivos:

- `refs.test.js`: conversão entre letras e índices de coluna (ida e volta até a coluna 2000), referências válidas e inválidas, expansão de intervalos.
- `tokenizer.test.js`: números, strings com aspas duplicadas, referências versus funções (`LOG10(` é função, `LOG10` é referência), operadores de dois caracteres, erros.
- `parser.test.js`: precedência e associatividade verificadas por representação em S-expression, menos unário, porcentagem, intervalos, chamadas aninhadas, erros de sintaxe, coleta de referências.
- `evaluator.test.js`: aritmética, coerção de tipos, propagação de erros, funções, `IF` com avaliação preguiçosa, comparação entre tipos.
- `graph.test.js`: arestas nos dois sentidos, conjunto afetado, ordem topológica, ciclos próprios, indiretos e cadeias de 50 mil nós (sem recursão).
- `sheet.test.js`: integração do modelo (recálculo em cadeia e em losango, ciclos, recuperação, `#REF!`, CSV, serialização, desempenho).

## Decisões de projeto

- **Parser descendente recursivo por precedência.** Cada nível de operador é uma função que chama o nível acima, o que deixa a gramática legível e fácil de estender. Segue o Excel em dois pontos que surpreendem: `-2^2` vale 4 (menos unário liga mais forte que `^`) e `2^3^2` vale 64 (associatividade à esquerda).
- **Erros como valores.** Erros de sintaxe, referência e avaliação viram `CellError` armazenados na célula, e propagam por quem depende dela. Nenhuma edição do usuário lança exceção.
- **Grafo bidirecional.** Guardar tanto `dependências` quanto `dependentes` permite achar o que recalcular (dependentes transitivos, busca em largura) e a ordem de cálculo (dependências) sem varrer a planilha.
- **Recálculo incremental.** Ao editar uma célula, só ela e seus dependentes transitivos são ordenados topologicamente (algoritmo de Kahn, O(V + E) no subgrafo afetado) e reavaliados uma vez cada. Células independentes não são tocadas.
- **Ciclos.** O que sobra no algoritmo de Kahn está em um ciclo ou depende de um, e recebe `#CYCLE!`. Para explicar o ciclo ao usuário, `findCycle` usa busca em profundidade iterativa (uma recursão estouraria a pilha em cadeias longas).
- **Intervalos expandidos nas dependências.** `SUM(A1:A100)` registra 100 arestas. É simples e correto; o custo é memória proporcional à área dos intervalos, por isso há um teto de tamanho por intervalo. Uma versão maior usaria nós de intervalo no grafo.
- **Arredondamento decimal.** `ROUND(1.005, 2)` vale 1,01 porque o arredondamento usa a representação decimal e não a multiplicação binária. A exibição usa 10 dígitos significativos para esconder ruído como `0.30000000000000004`.
- **Avaliação preguiçosa do `IF`.** Só o ramo escolhido é avaliado, então `=IF(A1=0, 0, 1/A1)` não produz `#DIV/0!`.
- **Células vazias valem 0 em contas** e `""` em texto; intervalos em agregados ignoram texto, booleanos e vazios, como no Excel.

## Estrutura de pastas

```
Spreadsheet/
├── index.html
├── style.css
├── src/
│   ├── errors.js      # códigos de erro, CellError e FormulaError
│   ├── refs.js        # A1 <-> índices, intervalos
│   ├── tokenizer.js   # análise léxica
│   ├── parser.js      # AST e coleta de referências
│   ├── evaluator.js   # avaliação e funções
│   ├── graph.js       # dependências, ordem topológica, ciclos
│   ├── sheet.js       # modelo da planilha e recálculo
│   ├── format.js      # exibição e leitura de literais
│   ├── demo.js        # planilha de exemplo
│   └── app.js         # interface
├── tests/
├── package.json
├── LICENSE
└── README.md
```

## Limitações conhecidas

- Não há copiar/colar com ajuste de referências relativas, preenchimento arrastando, formatação de células nem múltiplas abas.
- Referências absolutas (`$A$1`) são aceitas, mas se comportam como relativas, já que não existe copiar fórmulas.
- Sem funções de data, texto (`LEFT`, `MID`...) ou busca (`VLOOKUP`).
- A grade tem tamanho fixo (26 × 100) e usa um elemento por célula, sem virtualização.
- Intervalos muito grandes geram muitas arestas; o motor limita o tamanho de cada intervalo à área da grade.
- A interface (`app.js`) não tem testes automatizados; o motor, sim.

## Licença

MIT. Veja o arquivo [LICENSE](LICENSE).
