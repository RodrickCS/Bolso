// "Pergunte ao Bolso": a IA só transforma a pergunta em filtros; as contas e o texto da resposta
// são feitos aqui, com os números do banco. A IA nunca vê os lançamentos e não tem como inventar valores.
import { interpretarPergunta } from "../ia/perguntas.js";
import { prisma } from "../lib/prisma.js";
import { reais } from "./analise.js";
import { dataDoDia } from "./importacao.js";
import { hojeISO, normalizarEstabelecimento } from "./texto.js";

const INTENCOES = new Set(["total", "por_categoria", "por_mes", "por_estabelecimento", "maiores", "lista"]);
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const UM_DIA = 24 * 60 * 60 * 1000;
const iso = (data) => data.toISOString().slice(0, 10);
const diaMes = (texto) => `${texto.slice(8, 10)}/${texto.slice(5, 7)}`;
const nomeDoMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}${chave.slice(0, 4) === hojeISO().slice(0, 4) ? "" : ` de ${chave.slice(0, 4)}`}`;
const somar = (lista) => Math.round(lista.reduce((soma, t) => soma + t.valor, 0) * 100) / 100;

// Período padrão: o mês atual (ou os últimos 6 meses, para comparar meses)
function periodo(filtros, hoje) {
  const fimHoje = dataDoDia(hoje);
  let inicio = filtros.inicio && dataDoDia(filtros.inicio);
  let fim = filtros.fim && dataDoDia(filtros.fim);
  if (!inicio) {
    const voltar = filtros.intencao === "por_mes" ? 5 : 0;
    inicio = new Date(Date.UTC(fimHoje.getUTCFullYear(), fimHoje.getUTCMonth() - voltar, 1));
  }
  if (!fim || fim > fimHoje) fim = fimHoje;
  if (fim < inicio) [inicio, fim] = [fim, inicio];
  return { inicio, fim };
}

// "em outubro", "em 17/10", "de 01/08 a 18/10", "este mês"
function descreverPeriodo(inicio, fim, hoje) {
  const [i, f] = [iso(inicio), iso(fim)];
  if (i === f) return `em ${diaMes(i)}`;
  const ultimoDiaDoMes = iso(new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() + 1, 0)));
  if (i.slice(0, 7) === f.slice(0, 7) && i.endsWith("-01")) {
    if (f === hoje && i.slice(0, 7) === hoje.slice(0, 7)) return "este mês";
    if (f === ultimoDiaDoMes) return `em ${nomeDoMes(i)}`;
  }
  return `de ${diaMes(i)} a ${diaMes(f)}${i.slice(0, 4) === f.slice(0, 4) ? "" : ` de ${f.slice(0, 4)}`}`;
}

function agrupar(lista, chaveDe, nomeDe) {
  const grupos = new Map();
  for (const t of lista) {
    const chave = chaveDe(t);
    const grupo = grupos.get(chave) ?? { nome: nomeDe(t), total: 0, vezes: 0 };
    grupo.total += t.valor;
    grupo.vezes += 1;
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()].map(([chave, g]) => ({ chave, ...g, total: Math.round(g.total * 100) / 100 }));
}

const linhaLancamento = (t) => ({ rotulo: t.descricao, detalhe: `${diaMes(iso(t.data))}${t.categoria ? ` · ${t.categoria}` : ""}`, valor: t.valor });

// Monta a resposta a partir dos filtros já normalizados e dos lançamentos encontrados
export function montarResposta(filtros, lancamentos, { inicio, fim, hoje }) {
  const quando = descreverPeriodo(inicio, fim, hoje);
  const receita = filtros.tipo === "RECEITA";
  const assunto = filtros.busca
    ? ` com "${filtros.busca}"`
    : filtros.categorias.length
      ? ` com ${filtros.categorias.join(" e ")}`
      : "";
  const total = somar(lancamentos);

  if (!lancamentos.length) {
    return { resposta: `Não achei ${receita ? "entradas" : "gastos"}${assunto} ${quando}.`, linhas: [] };
  }

  switch (filtros.intencao) {
    case "por_categoria": {
      const grupos = agrupar(lancamentos, (t) => t.categoria ?? "Sem categoria", (t) => t.categoria ?? "Sem categoria").sort((a, b) => b.total - a.total);
      const [maior] = grupos;
      return {
        resposta: `${quando[0].toUpperCase()}${quando.slice(1)}, o que mais pesou foi ${maior.nome}: ${reais(maior.total)}, ${Math.round((maior.total / total) * 100)}% dos ${reais(total)} ${receita ? "recebidos" : "gastos"}.`,
        linhas: grupos.map((g) => ({ rotulo: g.nome, detalhe: `${Math.round((g.total / total) * 100)}%`, valor: g.total })),
      };
    }
    case "por_mes": {
      const grupos = agrupar(lancamentos, (t) => iso(t.data).slice(0, 7), (t) => iso(t.data).slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave));
      const maior = grupos.reduce((a, b) => (b.total > a.total ? b : a));
      return {
        resposta: `O mês em que você mais ${receita ? "recebeu" : "gastou"}${assunto} foi ${nomeDoMes(maior.chave)}: ${reais(maior.total)}.`,
        linhas: grupos.map((g) => ({ rotulo: nomeDoMes(g.chave).replace(/^./, (l) => l.toUpperCase()), detalhe: `${g.vezes}x`, valor: g.total })),
      };
    }
    case "por_estabelecimento": {
      const grupos = agrupar(
        lancamentos,
        (t) => normalizarEstabelecimento(t.estabelecimento ?? t.descricao) ?? t.descricao,
        (t) => t.estabelecimento ?? t.descricao,
      ).sort((a, b) => b.total - a.total);
      const [maior] = grupos;
      return {
        resposta: `${quando[0].toUpperCase()}${quando.slice(1)}, onde você mais gastou${assunto} foi ${maior.nome}: ${reais(maior.total)} em ${maior.vezes === 1 ? "1 compra" : `${maior.vezes} compras`}.`,
        linhas: grupos.slice(0, 10).map((g) => ({ rotulo: g.nome, detalhe: `${g.vezes}x`, valor: g.total })),
      };
    }
    case "maiores": {
      const maiores = [...lancamentos].sort((a, b) => b.valor - a.valor).slice(0, 5);
      return {
        resposta: `${receita ? "Suas maiores entradas" : "Seus maiores gastos"}${assunto} ${quando}:`,
        linhas: maiores.map(linhaLancamento),
      };
    }
    case "lista": {
      const recentes = [...lancamentos].sort((a, b) => b.data - a.data);
      return {
        resposta: `Achei ${lancamentos.length === 1 ? "1 lançamento" : `${lancamentos.length} lançamentos`}${assunto} ${quando}, somando ${reais(total)}.${recentes.length > 15 ? " Estes são os 15 mais recentes:" : ""}`,
        linhas: recentes.slice(0, 15).map(linhaLancamento),
      };
    }
    default: {
      const dias = Math.round((fim - inicio) / UM_DIA) + 1;
      const media = dias >= 14 && !receita ? ` Dá uma média de ${reais(total / dias)} por dia.` : "";
      return {
        resposta: `Você ${receita ? "recebeu" : "gastou"} ${reais(total)}${assunto} ${quando}, em ${lancamentos.length === 1 ? "1 lançamento" : `${lancamentos.length} lançamentos`}.${media}`,
        linhas: [...lancamentos].sort((a, b) => b.valor - a.valor).slice(0, 3).map(linhaLancamento),
      };
    }
  }
}

export async function responderPergunta(usuarioId, pergunta) {
  const hoje = hojeISO();
  const categorias = await prisma.categoria.findMany({ where: { usuarioId } });
  const bruto = await interpretarPergunta(usuarioId, pergunta, { hoje, nomesCategorias: categorias.map((c) => c.nome) });

  const intencao = INTENCOES.has(bruto.intencao) ? bruto.intencao : null;
  if (!intencao) {
    return {
      resposta: 'Ainda não sei responder isso. Pergunte sobre quanto gastou, em quê, onde ou quando. Por exemplo: "quanto gastei com mercado em setembro?"',
      linhas: [],
    };
  }

  const filtros = {
    intencao,
    tipo: bruto.tipo === "RECEITA" ? "RECEITA" : "DESPESA",
    categorias: (bruto.categorias ?? []).filter((nome) => categorias.some((c) => c.nome === nome)),
    busca: bruto.busca?.trim().slice(0, 60) || null,
    inicio: bruto.inicio,
    fim: bruto.fim,
  };
  const { inicio, fim } = periodo(filtros, hoje);
  const idsCategorias = categorias.filter((c) => filtros.categorias.includes(c.nome)).map((c) => c.id);

  const encontrados = await prisma.transacao.findMany({
    where: {
      usuarioId,
      tipo: filtros.tipo,
      conciliadaComId: null,
      data: { gte: inicio, lte: fim },
      ...(idsCategorias.length && { categoriaId: { in: idsCategorias } }),
      ...(filtros.busca && {
        OR: [
          { descricao: { contains: filtros.busca, mode: "insensitive" } },
          { estabelecimento: { contains: filtros.busca, mode: "insensitive" } },
        ],
      }),
    },
    select: { data: true, valor: true, descricao: true, estabelecimento: true, categoria: { select: { nome: true } } },
    take: 5000,
  });
  const lancamentos = encontrados.map((t) => ({ ...t, valor: Number(t.valor), categoria: t.categoria?.nome ?? null }));
  return { ...montarResposta(filtros, lancamentos, { inicio, fim, hoje }), filtros: { ...filtros, inicio: iso(inicio), fim: iso(fim) } };
}
