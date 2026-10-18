// Gastos fixos (assinaturas, aluguel, mensalidades): todo mês, no dia certo, viram um lançamento sozinhos.
// O lançamento automático é provisório: quando a cobrança de verdade aparece (fatura, extrato ou
// lançamento à mão), ela vale e o automático deixa de ser somado, mesmo que o valor tenha mudado um pouco.
import { prisma } from "../lib/prisma.js";
import { inserirTransacao } from "./importacao.js";
import { normalizarEstabelecimento, semAcentos } from "./texto.js";

const UM_DIA = 24 * 60 * 60 * 1000;
const JANELA_DIAS = 5;
const TOLERANCIA_VALOR = 0.3;

// Dia do mês, sem passar do último dia (dia 31 em fevereiro vira 28 ou 29)
export function dataNoMes(ano, mesIndice, dia) {
  const ultimo = new Date(Date.UTC(ano, mesIndice + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mesIndice, Math.min(dia, ultimo)));
}

export const proximaOcorrencia = (data, dia) => dataNoMes(data.getUTCFullYear(), data.getUTCMonth() + 1, dia);

// Próximo vencimento depois de hoje
export function proximoVencimento(dia, hoje = new Date()) {
  const desteMes = dataNoMes(hoje.getFullYear(), hoje.getMonth(), dia);
  const hojeUtc = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  return desteMes > hojeUtc ? desteMes : proximaOcorrencia(desteMes, dia);
}

const palavras = (t) => (normalizarEstabelecimento(t.estabelecimento ?? t.descricao) ?? "").split(" ").filter(Boolean);

// "Netflix" e "NETFLIX.COM" são a mesma loja: as palavras de um são o começo do outro
export function mesmaLoja(a, b) {
  const [curta, longa] = [palavras(a), palavras(b)].sort((x, y) => x.length - y.length);
  if (!curta.length || curta[0].length < 3) return false;
  return curta.every((p, i) => longa[i] === p);
}

// A cobrança de verdade substitui o lançamento automático: mesma loja, até 5 dias e até 30% de diferença no valor
export function substituiAutomatico(automatico, outra) {
  const dias = Math.abs(new Date(automatico.data) - new Date(outra.data)) / UM_DIA;
  const valor = Number(automatico.valor);
  return (
    automatico.tipo === outra.tipo &&
    dias <= JANELA_DIAS &&
    Math.abs(Number(outra.valor) - valor) <= valor * TOLERANCIA_VALOR &&
    mesmaLoja(automatico, outra)
  );
}

// Assinatura pela categoria, quando não há a opinião da IA (memória de categorias, frase simples)
export const categoriaDeAssinatura = (nome) => semAcentos(nome ?? "").toLowerCase() === "assinaturas";

const janela = (data) => ({ gte: new Date(data.getTime() - JANELA_DIAS * UM_DIA), lte: new Date(data.getTime() + JANELA_DIAS * UM_DIA) });

// Chamado depois de criar um lançamento que não é automático: se havia um automático da mesma cobrança, ele sai da soma
export async function absorverAutomatico(tx, criada) {
  if (criada.origem === "RECORRENTE") return;
  const automaticos = await tx.transacao.findMany({
    where: { usuarioId: criada.usuarioId, origem: "RECORRENTE", conciliadaComId: null, data: janela(criada.data) },
  });
  const automatico = automaticos.find((a) => substituiAutomatico(a, criada));
  if (!automatico) return;
  await tx.transacao.update({ where: { id: automatico.id }, data: { conciliadaComId: criada.id } });
  if (!criada.recorrenciaId && automatico.recorrenciaId) {
    await tx.transacao.update({ where: { id: criada.id }, data: { recorrenciaId: automatico.recorrenciaId } });
  }
}

// Transforma um lançamento em gasto fixo (ou liga ao que já existe para a mesma loja)
export async function repetirTodoMes(tx, transacao, { criadaPorIa = false } = {}) {
  if (transacao.tipo !== "DESPESA") return null;
  if (transacao.recorrenciaId) {
    // Já é um gasto fixo; se estava parado, volta a valer a partir do próximo vencimento
    const existente = await tx.recorrencia.findUnique({ where: { id: transacao.recorrenciaId } });
    if (existente && !existente.ativa) {
      return tx.recorrencia.update({ where: { id: existente.id }, data: { ativa: true, proximaData: proximoVencimento(existente.dia) } });
    }
    return existente;
  }
  const ativas = await tx.recorrencia.findMany({ where: { usuarioId: transacao.usuarioId, ativa: true } });
  let recorrencia = ativas.find((r) => mesmaLoja(r, transacao));
  if (!recorrencia) {
    const dia = transacao.data.getUTCDate();
    recorrencia = await tx.recorrencia.create({
      data: {
        usuarioId: transacao.usuarioId,
        descricao: transacao.descricao,
        estabelecimento: transacao.estabelecimento,
        valor: transacao.valor,
        dia,
        proximaData: proximaOcorrencia(transacao.data, dia),
        categoriaId: transacao.categoriaId,
        contaId: transacao.contaId,
        criadaPorIa,
      },
    });
  }
  await tx.transacao.update({ where: { id: transacao.id }, data: { recorrenciaId: recorrencia.id } });
  return recorrencia;
}

// "Não repetir": se o gasto fixo só tem este lançamento (a IA acabou de marcar errado), some de vez;
// se já tem histórico, só para de gerar os próximos
export async function pararDeRepetir(tx, transacao) {
  if (!transacao.recorrenciaId) return;
  const total = await tx.transacao.count({ where: { recorrenciaId: transacao.recorrenciaId } });
  if (total <= 1) await tx.recorrencia.delete({ where: { id: transacao.recorrenciaId } });
  else await tx.recorrencia.update({ where: { id: transacao.recorrenciaId }, data: { ativa: false } });
}

// Cria os lançamentos dos gastos fixos que já venceram (inclusive meses atrasados, se o servidor ficou parado).
// Cada vencimento avança proximaData com uma condição, então duas execuções ao mesmo tempo não duplicam.
export async function gerarLancamentosFixos(usuarioId, hoje = new Date()) {
  const limite = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const vencidas = await prisma.recorrencia.findMany({
    where: { ativa: true, proximaData: { lte: limite }, ...(usuarioId && { usuarioId }) },
  });
  let criados = 0;
  for (const r of vencidas) {
    let data = r.proximaData;
    while (data <= limite) {
      const proxima = proximaOcorrencia(data, r.dia);
      const criou = await prisma.$transaction(async (tx) => {
        const { count } = await tx.recorrencia.updateMany({ where: { id: r.id, proximaData: data }, data: { proximaData: proxima } });
        if (!count) return false;
        // Se a cobrança de verdade já foi lançada (fatura antes do vencimento, lançamento à mão), não cria outra
        const existentes = await tx.transacao.findMany({
          where: { usuarioId: r.usuarioId, tipo: "DESPESA", conciliadaComId: null, data: janela(data) },
        });
        const automatico = { tipo: "DESPESA", data, valor: r.valor, descricao: r.descricao, estabelecimento: r.estabelecimento };
        if (existentes.some((t) => t.recorrenciaId === r.id || substituiAutomatico(automatico, t))) return false;
        await inserirTransacao(tx, {
          usuarioId: r.usuarioId,
          contaId: r.contaId,
          categoriaId: r.categoriaId,
          recorrenciaId: r.id,
          origem: "RECORRENTE",
          tipo: "DESPESA",
          valor: Number(r.valor),
          data,
          descricao: r.descricao,
          estabelecimento: r.estabelecimento,
        });
        return true;
      });
      if (criou) criados++;
      data = proxima;
    }
  }
  return criados;
}
