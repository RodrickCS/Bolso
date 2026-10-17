import { prisma } from "../lib/prisma.js";
import { normalizarEstabelecimento } from "./texto.js";

export const CATEGORIAS_PADRAO = [
  ["Mercado", "DESPESA"],
  ["Restaurantes e delivery", "DESPESA"],
  ["Transporte", "DESPESA"],
  ["Moradia", "DESPESA"],
  ["Contas da casa", "DESPESA"],
  ["Saúde", "DESPESA"],
  ["Educação", "DESPESA"],
  ["Lazer", "DESPESA"],
  ["Compras", "DESPESA"],
  ["Assinaturas", "DESPESA"],
  ["Cuidados pessoais", "DESPESA"],
  ["Pets", "DESPESA"],
  ["Impostos e taxas", "DESPESA"],
  ["Transferências", "DESPESA"],
  ["Outros", "DESPESA"],
  ["Salário", "RECEITA"],
  ["Renda extra", "RECEITA"],
  ["Outras receitas", "RECEITA"],
];

export function criarCategoriasPadrao(usuarioId, db = prisma) {
  return db.categoria.createMany({
    data: CATEGORIAS_PADRAO.map(([nome, tipo]) => ({ usuarioId, nome, tipo })),
  });
}

// Memória de categorias: devolve o id da categoria já usada para esse estabelecimento
export async function categoriaLembrada(usuarioId, estabelecimentoOuDescricao, db = prisma) {
  const padrao = normalizarEstabelecimento(estabelecimentoOuDescricao);
  if (!padrao) return null;
  const regra = await db.regraCategoria.findUnique({ where: { usuarioId_padrao: { usuarioId, padrao } } });
  return regra?.categoriaId ?? null;
}

// sobrescrever=true quando é o usuário corrigindo; a escolha dele vale mais que a da IA
export async function lembrarCategoria(usuarioId, estabelecimentoOuDescricao, categoriaId, { sobrescrever = false, db = prisma } = {}) {
  const padrao = normalizarEstabelecimento(estabelecimentoOuDescricao);
  if (!padrao || !categoriaId) return;
  await db.regraCategoria.upsert({
    where: { usuarioId_padrao: { usuarioId, padrao } },
    create: { usuarioId, padrao, categoriaId },
    update: sobrescrever ? { categoriaId } : {},
  });
}
