// Criar, editar e apagar lançamentos. Usado pelas telas (rotas/transacoes.js) e pelo assistente do chat,
// para os dois seguirem exatamente as mesmas regras.
import { sugerirCategoria } from "../ia/extrair.js";
import { ErroHttp } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { garantirDono } from "../rotas/cadastros.js";
import { categoriaLembrada, lembrarCategoria } from "./categorias.js";
import { inserirTransacao } from "./importacao.js";
import { categoriaDeAssinatura, pararDeRepetir, repetirTodoMes } from "./recorrencias.js";

export const detalhesLancamento = {
  categoria: { select: { id: true, nome: true } },
  conta: { select: { id: true, nome: true } },
  itens: { include: { produto: true } },
  recorrencia: { select: { id: true, ativa: true, dia: true, criadaPorIa: true } },
};

export async function buscarLancamento(id, usuarioId) {
  const transacao = await prisma.transacao.findFirst({ where: { id: Number(id) || 0, usuarioId } });
  if (!transacao) throw new ErroHttp(404, "Transação não encontrada");
  return transacao;
}

// Categoria para um lançamento manual: memória primeiro, IA só se for novidade.
// A mesma chamada à IA diz se é um gasto fixo mensal. Devolve { categoriaId, repete } (repete null = sem opinião).
async function escolherCategoria(usuarioId, descricao) {
  const lembrada = await categoriaLembrada(usuarioId, descricao);
  if (lembrada) return { categoriaId: lembrada, repete: null };
  try {
    const categorias = await prisma.categoria.findMany({ where: { usuarioId } });
    const { categoria, repete } = await sugerirCategoria(usuarioId, descricao, categorias.map((c) => c.nome));
    return { categoriaId: categorias.find((c) => c.nome === categoria)?.id ?? null, repete };
  } catch (erro) {
    // Sem créditos ou API fora do ar não impede de salvar o gasto
    console.error("Categorização:", erro.message);
    return { categoriaId: null, repete: null };
  }
}

// dados: { valor, data (Date), descricao, tipo?, categoriaId?, contaId?, repetir? }
export async function criarLancamento(usuarioId, dados) {
  await garantirDono("categoria", dados.categoriaId, usuarioId);
  await garantirDono("conta", dados.contaId, usuarioId);

  const { repetir: pedido, ...campos } = dados;
  const escolha = dados.categoriaId ? { categoriaId: dados.categoriaId, repete: null } : await escolherCategoria(usuarioId, dados.descricao);
  const { categoriaId } = escolha;
  const categoria = categoriaId && (await prisma.categoria.findUnique({ where: { id: categoriaId } }));
  const tipo = dados.tipo ?? categoria?.tipo ?? "DESPESA";
  // O pedido do usuário vale; senão a opinião da IA; senão a categoria Assinaturas
  const repete = pedido ?? escolha.repete ?? categoriaDeAssinatura(categoria?.nome);
  const criada = await prisma.$transaction(async (tx) => {
    const nova = await inserirTransacao(tx, { ...campos, tipo, categoriaId, usuarioId, origem: "MANUAL" });
    if (nova && repete) await repetirTodoMes(tx, nova, { criadaPorIa: pedido === undefined });
    return nova;
  });
  if (dados.categoriaId) await lembrarCategoria(usuarioId, dados.descricao, categoriaId);
  return prisma.transacao.findUnique({ where: { id: criada.id }, include: detalhesLancamento });
}

// mudancas: { tipo?, valor?, data?, descricao?, categoriaId?, contaId? }
export async function editarLancamento(usuarioId, id, mudancas) {
  const atual = await buscarLancamento(id, usuarioId);
  await garantirDono("categoria", mudancas.categoriaId, usuarioId);
  await garantirDono("conta", mudancas.contaId, usuarioId);

  const atualizada = await prisma.transacao.update({ where: { id: atual.id }, data: mudancas, include: detalhesLancamento });
  // Correção do usuário vira regra: da próxima vez esse estabelecimento já vem na categoria certa
  if (mudancas.categoriaId) {
    await lembrarCategoria(usuarioId, atual.estabelecimento ?? atual.descricao, mudancas.categoriaId, { sobrescrever: true });
  }
  return atualizada;
}

// Liga ou desliga a repetição mensal ("Repetir todo mês" / "Não repetir")
export async function definirRepeticao(usuarioId, id, ligar) {
  const atual = await buscarLancamento(id, usuarioId);
  if (ligar && atual.tipo !== "DESPESA") throw new ErroHttp(400, "Só gastos podem se repetir todo mês");
  await prisma.$transaction((tx) => (ligar ? repetirTodoMes(tx, atual) : pararDeRepetir(tx, atual)));
  return prisma.transacao.findUnique({ where: { id: atual.id }, include: detalhesLancamento });
}

export async function apagarLancamento(usuarioId, id) {
  const atual = await buscarLancamento(id, usuarioId);
  await prisma.transacao.delete({ where: { id: atual.id } });
}
