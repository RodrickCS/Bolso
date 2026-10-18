import { Router } from "express";
import { z } from "zod";
import { sugerirCategoria } from "../ia/extrair.js";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { intervaloDoMes, parametroMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { categoriaLembrada, lembrarCategoria } from "../servicos/categorias.js";
import { dataDoDia, inserirTransacao } from "../servicos/importacao.js";
import { categoriaDeAssinatura, gerarLancamentosFixos, pararDeRepetir, repetirTodoMes } from "../servicos/recorrencias.js";
import { garantirDono } from "./cadastros.js";

export const rotasTransacoes = Router();

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .transform((texto, ctx) => dataDoDia(texto) ?? (ctx.addIssue({ code: "custom", message: "data inválida" }), z.NEVER));

const filtro = z.object({
  mes: parametroMes,
  categoriaId: z.coerce.number().int().positive().optional(),
  contaId: z.coerce.number().int().positive().optional(),
});

const nova = z.object({
  valor: z.number().positive("o valor precisa ser maior que zero"),
  data: dataISO,
  descricao: z.string().trim().min(1, "informe uma descrição"),
  // Sem tipo, vale o da categoria (Salário é RECEITA); sem categoria, DESPESA
  tipo: z.enum(["DESPESA", "RECEITA"]).optional(),
  categoriaId: z.number().int().positive().optional(),
  contaId: z.number().int().positive().optional(),
  // Repetir todo mês. Sem o campo, decide sozinho: IA (estabelecimento novo) ou categoria Assinaturas
  repetir: z.boolean().optional(),
});

const repetir = z.object({ repetir: z.boolean() });

const edicao = z.object({
  tipo: z.enum(["DESPESA", "RECEITA"]).optional(),
  valor: z.number().positive().optional(),
  data: dataISO.optional(),
  descricao: z.string().trim().min(1).optional(),
  categoriaId: z.number().int().positive().nullable().optional(),
  contaId: z.number().int().positive().nullable().optional(),
});

const detalhes = {
  categoria: { select: { id: true, nome: true } },
  conta: { select: { id: true, nome: true } },
  itens: { include: { produto: true } },
  recorrencia: { select: { id: true, ativa: true, dia: true, criadaPorIa: true } },
};

async function buscarDoUsuario(id, usuarioId) {
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

rotasTransacoes.get(
  "/",
  assincrono(async (req, res) => {
    const { mes, categoriaId, contaId } = validar(filtro, req.query);
    const { inicio, fim } = intervaloDoMes(mes);
    await gerarLancamentosFixos(req.usuarioId);
    res.json(
      await prisma.transacao.findMany({
        where: { usuarioId: req.usuarioId, data: { gte: inicio, lt: fim }, categoriaId, contaId },
        include: detalhes,
        orderBy: [{ data: "desc" }, { id: "desc" }],
      }),
    );
  }),
);

rotasTransacoes.get(
  "/:id",
  assincrono(async (req, res) => {
    const transacao = await buscarDoUsuario(req.params.id, req.usuarioId);
    res.json(await prisma.transacao.findUnique({ where: { id: transacao.id }, include: detalhes }));
  }),
);

rotasTransacoes.post(
  "/",
  assincrono(async (req, res) => {
    const dados = validar(nova, req.body);
    await garantirDono("categoria", dados.categoriaId, req.usuarioId);
    await garantirDono("conta", dados.contaId, req.usuarioId);

    const { repetir: pedido, ...campos } = dados;
    const escolha = dados.categoriaId ? { categoriaId: dados.categoriaId, repete: null } : await escolherCategoria(req.usuarioId, dados.descricao);
    const { categoriaId } = escolha;
    const categoria = categoriaId && (await prisma.categoria.findUnique({ where: { id: categoriaId } }));
    const tipo = dados.tipo ?? categoria?.tipo ?? "DESPESA";
    // O pedido do usuário vale; senão a opinião da IA; senão a categoria Assinaturas
    const repete = pedido ?? escolha.repete ?? categoriaDeAssinatura(categoria?.nome);
    const criada = await prisma.$transaction(async (tx) => {
      const nova = await inserirTransacao(tx, { ...campos, tipo, categoriaId, usuarioId: req.usuarioId, origem: "MANUAL" });
      if (nova && repete) await repetirTodoMes(tx, nova, { criadaPorIa: pedido === undefined });
      return nova;
    });
    if (dados.categoriaId) await lembrarCategoria(req.usuarioId, dados.descricao, categoriaId);
    res.status(201).json(await prisma.transacao.findUnique({ where: { id: criada.id }, include: detalhes }));
  }),
);

rotasTransacoes.patch(
  "/:id",
  assincrono(async (req, res) => {
    const atual = await buscarDoUsuario(req.params.id, req.usuarioId);
    const dados = validar(edicao, req.body);
    await garantirDono("categoria", dados.categoriaId, req.usuarioId);
    await garantirDono("conta", dados.contaId, req.usuarioId);

    const atualizada = await prisma.transacao.update({ where: { id: atual.id }, data: dados, include: detalhes });
    // Correção do usuário vira regra: da próxima vez esse estabelecimento já vem na categoria certa
    if (dados.categoriaId) {
      await lembrarCategoria(req.usuarioId, atual.estabelecimento ?? atual.descricao, dados.categoriaId, {
        sobrescrever: true,
      });
    }
    res.json(atualizada);
  }),
);

// Liga ou desliga a repetição mensal de um lançamento ("Repetir todo mês" / "Não repetir")
rotasTransacoes.post(
  "/:id/repetir",
  assincrono(async (req, res) => {
    const atual = await buscarDoUsuario(req.params.id, req.usuarioId);
    const { repetir: ligar } = validar(repetir, req.body);
    if (ligar && atual.tipo !== "DESPESA") throw new ErroHttp(400, "Só gastos podem se repetir todo mês");
    await prisma.$transaction((tx) => (ligar ? repetirTodoMes(tx, atual) : pararDeRepetir(tx, atual)));
    res.json(await prisma.transacao.findUnique({ where: { id: atual.id }, include: detalhes }));
  }),
);

rotasTransacoes.delete(
  "/:id",
  assincrono(async (req, res) => {
    const atual = await buscarDoUsuario(req.params.id, req.usuarioId);
    await prisma.transacao.delete({ where: { id: atual.id } });
    res.status(204).end();
  }),
);
