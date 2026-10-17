import { createHash } from "node:crypto";
import { escreverDicas } from "../ia/assistente.js";
import { intervaloDoMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { calcularFatos, detectarAssinaturas } from "./analise.js";

const UM_DIA = 24 * 60 * 60 * 1000;

// Gasto do mês por categoria comparado com o orçamento
export async function statusOrcamentos(usuarioId, mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  const [orcamentos, gastos] = await Promise.all([
    prisma.orcamento.findMany({ where: { usuarioId }, include: { categoria: true } }),
    prisma.transacao.groupBy({
      by: ["categoriaId"],
      where: { usuarioId, tipo: "DESPESA", conciliadaComId: null, data: { gte: inicio, lt: fim } },
      _sum: { valor: true },
    }),
  ]);
  const gastoPorCategoria = new Map(gastos.map((g) => [g.categoriaId, Number(g._sum.valor)]));
  return orcamentos
    .map((o) => {
      const limite = Number(o.valorMensal);
      const gasto = gastoPorCategoria.get(o.categoriaId) ?? 0;
      const percentual = Math.round((gasto / limite) * 1000) / 10;
      return {
        categoriaId: o.categoriaId,
        categoria: o.categoria.nome,
        limite,
        gasto,
        percentual,
        situacao: percentual >= 100 ? "estourado" : percentual >= 80 ? "alerta" : "ok",
      };
    })
    .sort((a, b) => b.percentual - a.percentual);
}

// Despesas (sem as duplicatas conciliadas) num intervalo, no formato que as análises esperam
async function despesas(usuarioId, inicio, fim) {
  const lista = await prisma.transacao.findMany({
    where: { usuarioId, tipo: "DESPESA", conciliadaComId: null, data: { gte: inicio, lt: fim } },
    select: { data: true, valor: true, descricao: true, estabelecimento: true, parcelaTotal: true, tipo: true, categoria: { select: { nome: true } } },
  });
  return lista.map((t) => ({ ...t, valor: Number(t.valor), categoria: t.categoria?.nome ?? null }));
}

// Para o mês atual, "hoje" é hoje; para meses passados, o último dia do mês
function referencia(mes) {
  const { fim } = intervaloDoMes(mes);
  const agora = new Date();
  return agora < fim ? agora : new Date(fim.getTime() - UM_DIA);
}

export async function assinaturasDetectadas(usuarioId, mes) {
  const { fim } = intervaloDoMes(mes);
  const seisMesesAntes = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - 6, 1));
  return detectarAssinaturas(await despesas(usuarioId, seisMesesAntes, fim), referencia(mes));
}

export async function fatosDoMes(usuarioId, mes) {
  const { inicio, fim } = intervaloDoMes(mes);
  const inicioAnterior = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 1, 1));
  const inicioHistorico = new Date(inicio.getTime() - 90 * UM_DIA);

  const [atuais, anteriores, historico, orcamentos, assinaturas] = await Promise.all([
    despesas(usuarioId, inicio, fim),
    despesas(usuarioId, inicioAnterior, inicio),
    despesas(usuarioId, inicioHistorico, inicio),
    statusOrcamentos(usuarioId, mes),
    assinaturasDetectadas(usuarioId, mes),
  ]);
  return calcularFatos({ mes, hoje: referencia(mes), atuais, anteriores, historico, orcamentos, assinaturas });
}

// Dicas do assistente. A IA é chamada no máximo uma vez por dia por mês consultado,
// e só quando os fatos mudaram. Sem IA (mock, sem créditos, erro), usa os textos dos fatos.
export async function dicasDoMes(usuarioId, mes) {
  const fatos = await fatosDoMes(usuarioId, mes);
  if (fatos.length === 0) return { mes, dicas: [], geradoPorIa: false, geradoEm: null };

  const fatosHash = createHash("sha1").update(JSON.stringify(fatos.map((f) => f.texto))).digest("hex");
  const salvo = await prisma.resumoAssistente.findUnique({ where: { usuarioId_mes: { usuarioId, mes } } });
  const inicioDoDia = new Date(new Date().setHours(0, 0, 0, 0));
  if (salvo && (salvo.fatosHash === fatosHash || salvo.geradoEm >= inicioDoDia)) {
    return { mes, dicas: salvo.dicas, geradoPorIa: salvo.geradoPorIa, geradoEm: salvo.geradoEm };
  }

  let dicas = null;
  try {
    dicas = await escreverDicas(usuarioId, fatos);
  } catch (erro) {
    console.error("Assistente:", erro.message);
  }
  const geradoPorIa = Boolean(dicas?.length);
  if (!geradoPorIa) dicas = fatos.slice(0, 4).map((f) => f.texto);

  const dados = { fatosHash, dicas, geradoPorIa, geradoEm: new Date() };
  await prisma.resumoAssistente.upsert({
    where: { usuarioId_mes: { usuarioId, mes } },
    create: { usuarioId, mes, ...dados },
    update: dados,
  });
  return { mes, ...dados };
}
