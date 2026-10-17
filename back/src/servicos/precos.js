// Inflação pessoal: histórico de preços dos produtos que vêm nos cupons, comparação
// entre mercados e um índice do quanto os seus produtos subiram. Só código, sem IA.
import { reais } from "./analise.js";
import { normalizarEstabelecimento } from "./texto.js";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const arredondar = (valor, casas = 2) => Math.round(valor * 10 ** casas) / 10 ** casas;
const dataISO = (data) => data.toISOString().slice(0, 10);
const diaMes = (data) => `${dataISO(data).slice(8, 10)}/${dataISO(data).slice(5, 7)}`;

// Preço de uma unidade (ou de 1 kg, quando o cupom traz o peso na quantidade)
export function precoUnitario(compra) {
  const quantidade = Number(compra.quantidade);
  return quantidade > 0 ? arredondar(Number(compra.precoTotal) / quantidade) : null;
}

function agruparPorProduto(compras) {
  const grupos = new Map();
  for (const compra of compras) {
    const preco = precoUnitario(compra);
    if (!preco || preco <= 0) continue;
    if (!grupos.has(compra.produtoId)) grupos.set(compra.produtoId, { nome: compra.produto, compras: [] });
    grupos.get(compra.produtoId).compras.push({ ...compra, preco });
  }
  for (const grupo of grupos.values()) grupo.compras.sort((a, b) => a.data - b.data);
  return grupos;
}

const nomeMercado = (compra) => compra.estabelecimento?.trim() || "Sem nome";
const chaveMercado = (compra) => normalizarEstabelecimento(nomeMercado(compra)) || nomeMercado(compra);

// Último preço pago em cada mercado, do mais barato para o mais caro
function precosPorMercado(compras) {
  const mercados = new Map();
  for (const c of compras) {
    const chave = chaveMercado(c);
    const anterior = mercados.get(chave);
    mercados.set(chave, {
      chave,
      estabelecimento: nomeMercado(c),
      ultimoPreco: c.preco,
      ultimaData: dataISO(c.data),
      compras: (anterior?.compras ?? 0) + 1,
    });
  }
  return [...mercados.values()].sort((a, b) => a.ultimoPreco - b.ultimoPreco);
}

function resumir(produtoId, { nome, compras }) {
  const primeira = compras[0];
  const ultima = compras.at(-1);
  // Variação só faz sentido entre compras de dias diferentes
  const variacao =
    compras.length >= 2 && dataISO(primeira.data) !== dataISO(ultima.data)
      ? arredondar(((ultima.preco - primeira.preco) / primeira.preco) * 100, 1)
      : null;

  // Mais barato em outro lugar: o último preço de outro mercado é menor que o que você pagou por último
  const mercados = precosPorMercado(compras);
  const outro = mercados[0];
  const maisBarato =
    mercados.length >= 2 && outro.chave !== chaveMercado(ultima) && outro.ultimoPreco < ultima.preco
      ? { estabelecimento: outro.estabelecimento, preco: outro.ultimoPreco, economia: arredondar(ultima.preco - outro.ultimoPreco) }
      : null;

  return {
    id: produtoId,
    nome,
    compras: compras.length,
    totalGasto: arredondar(compras.reduce((soma, c) => soma + Number(c.precoTotal), 0)),
    primeiroPreco: primeira.preco,
    primeiraData: dataISO(primeira.data),
    ultimoPreco: ultima.preco,
    ultimaData: dataISO(ultima.data),
    ultimoEstabelecimento: ultima.estabelecimento ?? null,
    variacao,
    maisBarato,
  };
}

// compras: [{ produtoId, produto, data, estabelecimento, quantidade, precoTotal }]
// Devolve um resumo por produto, dos que mais pesam no bolso para os que menos pesam
export function resumirProdutos(compras) {
  return [...agruparPorProduto(compras)]
    .map(([id, grupo]) => resumir(id, grupo))
    .sort((a, b) => b.totalGasto - a.totalGasto || a.nome.localeCompare(b.nome));
}

// Histórico completo de um produto: todas as compras e o último preço em cada mercado
export function detalharProduto(compras) {
  const [[id, grupo] = []] = agruparPorProduto(compras);
  if (!grupo) return null;
  return {
    ...resumir(id, grupo),
    historico: grupo.compras.map((c) => ({
      data: dataISO(c.data),
      preco: c.preco,
      quantidade: Number(c.quantidade),
      precoTotal: Number(c.precoTotal),
      estabelecimento: c.estabelecimento ?? null,
    })),
    porMercado: precosPorMercado(grupo.compras).map(({ chave, ...mercado }) => mercado),
  };
}

// Média da variação dos produtos comprados mais de uma vez, com peso pelo quanto você gasta em cada um.
// Com menos de 3 produtos o número diria mais sobre um item do que sobre o seu bolso.
export function inflacaoPessoal(resumos) {
  const comVariacao = resumos.filter((r) => r.variacao !== null);
  if (comVariacao.length < 3) return null;
  const pesoTotal = comVariacao.reduce((soma, r) => soma + r.totalGasto, 0);
  const media = comVariacao.reduce((soma, r) => soma + r.variacao * r.totalGasto, 0) / pesoTotal;
  return {
    percentual: arredondar(media, 1),
    produtos: comVariacao.length,
    desde: comVariacao.map((r) => r.primeiraData).sort()[0],
  };
}

function quando(dataTexto, mes) {
  const data = new Date(`${dataTexto}T00:00:00Z`);
  if (dataTexto.slice(0, 7) === mes) return `em ${diaMes(data)}`;
  const nome = `em ${MESES[data.getUTCMonth()]}`;
  return dataTexto.slice(0, 4) === mes.slice(0, 4) ? nome : `${nome} de ${data.getUTCFullYear()}`;
}

// Fatos para o assistente sobre os produtos comprados no mês: o que mais subiu e onde sairia mais barato
export function fatosDePrecos(resumos, mes) {
  const doMes = resumos.filter((r) => r.ultimaData.startsWith(mes));
  const fatos = [];

  const subiu = doMes
    .filter((r) => r.variacao >= 10 && r.ultimoPreco - r.primeiroPreco >= 0.5)
    .sort((a, b) => b.variacao - a.variacao)[0];
  if (subiu) {
    fatos.push({
      tipo: "preco_subiu",
      prioridade: 45,
      texto: `${subiu.nome} saiu ${reais(subiu.ultimoPreco)} em ${diaMes(new Date(`${subiu.ultimaData}T00:00:00Z`))}, ${Math.round(subiu.variacao)}% a mais que ${quando(subiu.primeiraData, mes)} (${reais(subiu.primeiroPreco)}).`,
    });
  }

  const economia = doMes
    .filter((r) => r.maisBarato && r.maisBarato.economia >= 1 && r.maisBarato.economia / r.ultimoPreco >= 0.1)
    .sort((a, b) => b.maisBarato.economia - a.maisBarato.economia)[0];
  if (economia) {
    fatos.push({
      tipo: "mais_barato",
      prioridade: 35,
      texto: `${economia.nome} sai ${reais(economia.maisBarato.economia)} mais barato em ${economia.maisBarato.estabelecimento} (${reais(economia.maisBarato.preco)}) do que em ${economia.ultimoEstabelecimento ?? "onde você comprou"} (${reais(economia.ultimoPreco)}).`,
    });
  }
  return fatos;
}
