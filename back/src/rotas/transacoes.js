import { Router } from "express";
import { z } from "zod";
import { sugerirCategoria } from "../ia/extrair.js";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { intervaloDoMes, parametroMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { categoriaLembrada, lembrarCategoria } from "../servicos/categorias.js";
import { dataDoDia, inserirTransacao } from "../servicos/importacao.js";
import { garantirDono } from "./cadastros.js";

export const rotasTransacoes = Router();

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
  .transform((texto, ctx) => dataDoDia(texto) ?? (ctx.addIssue({ code: "custom", message: "data inválida" }), z.NEVER));

const filtro = z.object({
  mes: parametroMes,
  categoriaId: z.coerce.number().int().positive().optional(),
});

const nova = z.object({
  valor: z.number().positive("o valor precisa ser maior que zero"),
  data: dataISO,
  descricao: z.string().trim().min(1, "informe uma descrição"),
  tipo: z.enum(["DESPESA", "RECEITA"]).default("DESPESA"),
  categoriaId: z.number().int().positive().optional(),
  contaId: z.number().int().positive().optional(),
});

const edicao = z.object({
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
};

async function buscarDoUsuario(id, usuarioId) {
  const transacao = await prisma.transacao.findFirst({ where: { id: Number(id) || 0, usuarioId } });
  if (!transacao) throw new ErroHttp(404, "Transação não encontrada");
  return transacao;
}

// Categoria para um lançamento manual: memória primeiro, IA só se for novidade
async function escolherCategoria(usuarioId, descricao) {
  const lembrada = await categoriaLembrada(usuarioId, descricao);
  if (lembrada) return lembrada;
  try {
    const categorias = await prisma.categoria.findMany({ where: { usuarioId } });
    const nome = await sugerirCategoria(usuarioId, descricao, categorias.map((c) => c.nome));
    return categorias.find((c) => c.nome === nome)?.id ?? null;
  } catch (erro) {
    // Sem créditos ou API fora do ar não impede de salvar o gasto
    console.error("Categorização:", erro.message);
    return null;
  }
}

rotasTransacoes.get(
  "/",
  assincrono(async (req, res) => {
    const { mes, categoriaId } = validar(filtro, req.query);
    const { inicio, fim } = intervaloDoMes(mes);
    res.json(
      await prisma.transacao.findMany({
        where: { usuarioId: req.usuarioId, data: { gte: inicio, lt: fim }, categoriaId },
        include: detalhes,
        orderBy: [{ data: "desc" }, { id: "desc" }],
      }),
    );
  }),
);

rotasTransacoes.post(
  "/",
  assincrono(async (req, res) => {
    const dados = validar(nova, req.body);
    await garantirDono("categoria", dados.categoriaId, req.usuarioId);
    await garantirDono("conta", dados.contaId, req.usuarioId);

    const categoriaId = dados.categoriaId ?? (await escolherCategoria(req.usuarioId, dados.descricao));
    const criada = await prisma.$transaction((tx) =>
      inserirTransacao(tx, { ...dados, categoriaId, usuarioId: req.usuarioId, origem: "MANUAL" }),
    );
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

rotasTransacoes.delete(
  "/:id",
  assincrono(async (req, res) => {
    const atual = await buscarDoUsuario(req.params.id, req.usuarioId);
    await prisma.transacao.delete({ where: { id: atual.id } });
    res.status(204).end();
  }),
);
