// Uma mensagem do chat: monta as ferramentas do usuário, chama a IA (ou o modo mock) e devolve o texto,
// os cartões de ação e as referências que o app manda de volta na próxima mensagem.
import { conversarComIa, contextoDoUsuario } from "../ia/agente.js";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { cartaoDaAcao } from "./acoes.js";
import { criarFerramentas, rodarFerramenta } from "./ferramentas.js";
import { responderPergunta } from "./perguntas.js";
import { hojeISO, interpretarTextoLocal } from "./texto.js";

const MAX_HISTORICO = 12;
const MAX_REFERENCIAS = 25;

// O app manda o histórico em texto; a API quer começar pelo usuário e alternar papéis
export function montarHistorico(historico = []) {
  const mensagens = historico
    .slice(-MAX_HISTORICO)
    .map((m) => ({ role: m.papel === "bolso" ? "assistant" : "user", content: String(m.texto ?? "").slice(0, 2000) }))
    .filter((m) => m.content.trim());
  while (mensagens.length && mensagens[0].role !== "user") mensagens.shift();
  // Duas mensagens seguidas do mesmo lado viram uma só
  return mensagens.reduce((lista, m) => {
    const ultima = lista.at(-1);
    if (ultima?.role === m.role) ultima.content += `\n\n${m.content}`;
    else lista.push({ ...m });
    return lista;
  }, []);
}

// Junta as referências antigas com as novas ("#123 Uber · 17/10 · R$ 23,15"), sem repetir e sem crescer demais
export function juntarReferencias(anteriores, citados) {
  const porId = new Map();
  for (const linha of String(anteriores ?? "").split("\n")) {
    const id = linha.match(/^#(\d+) /)?.[1];
    if (id) porId.set(Number(id), linha.slice(0, 200));
  }
  for (const [id, linha] of citados) {
    porId.delete(id);
    porId.set(id, linha);
  }
  return [...porId.values()].slice(-MAX_REFERENCIAS).join("\n");
}

// Sem IA (IA_MOCK=true): entende "apaga ..." e gastos simples, e responde perguntas com os filtros locais.
// Usa as mesmas ferramentas da IA, então o resto do caminho (propostas, cartões) é testado de verdade.
async function conversarLocal(ctx, mensagem) {
  const ferramenta = (nome) => ctx.ferramentas.find((f) => f.nome === nome);
  const apagar = mensagem.match(/^(?:apag|exclu|remov)\w*\s+(?:(?:o|a|os|as|do|da)\s+)?(?:gastos?\s+)?(?:d[oa]s?\s+|com\s+)?(.+?)\.?$/i);
  if (apagar) {
    const { texto } = await rodarFerramenta(ferramenta("consultar_lancamentos"), {
      inicio: "", fim: "", tipo: "AMBOS", categorias: [], busca: apagar[1], conta: "", agrupar: "nenhum", ordenar: "recentes",
    });
    const achados = JSON.parse(texto).lancamentos ?? [];
    if (!achados.length) return { resposta: `Não achei lançamentos com "${apagar[1]}" este mês.` };
    await rodarFerramenta(ferramenta("apagar_lancamentos"), { ids: achados.map((t) => t.id) });
    return { resposta: `Achei ${achados.length === 1 ? "1 lançamento" : `${achados.length} lançamentos`}. Confirme no cartão para apagar.` };
  }

  const gasto = interpretarTextoLocal(mensagem);
  if (gasto) {
    const { texto, erro } = await rodarFerramenta(ferramenta("criar_lancamento"), {
      tipo: gasto.tipo, valor: gasto.valor, descricao: gasto.descricao, data: gasto.data,
      categoria: "", conta: "", repetir_todo_mes: "automatico",
    });
    return { resposta: erro ? texto : `Anotado: ${gasto.descricao}, R$ ${gasto.valor.toFixed(2).replace(".", ",")}.` };
  }

  return responderPergunta(ctx.usuarioId, mensagem);
}

// { mensagem, historico: [{ papel: "usuario" | "bolso", texto }], referencias }
export async function conversar(usuarioId, { mensagem, historico, referencias }) {
  const ctx = { usuarioId, acoes: [], citados: new Map() };
  ctx.ferramentas = criarFerramentas(ctx);

  let resultado;
  if (config.ia.mock) {
    resultado = await conversarLocal(ctx, mensagem);
  } else {
    const [contas, categorias] = await Promise.all([
      prisma.conta.findMany({ where: { usuarioId }, orderBy: { nome: "asc" } }),
      prisma.categoria.findMany({ where: { usuarioId }, orderBy: { nome: "asc" } }),
    ]);
    const resposta = await conversarComIa(usuarioId, {
      ferramentas: ctx.ferramentas,
      contexto: contextoDoUsuario({ hoje: hojeISO(), contas, categorias }),
      historico: montarHistorico(historico),
      mensagem,
      referencias: referencias?.trim() || null,
    });
    resultado = { resposta };
  }

  return {
    resposta: resultado.resposta,
    linhas: resultado.linhas ?? [],
    acoes: ctx.acoes.map(cartaoDaAcao),
    referencias: juntarReferencias(referencias, ctx.citados),
  };
}
