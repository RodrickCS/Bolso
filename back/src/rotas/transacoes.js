import { Router } from "express";
import { z } from "zod";
import { assincrono, validar } from "../lib/erros.js";
import { intervaloDoMes, parametroMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { dataDoDia } from "../servicos/importacao.js";
import {
  apagarLancamento,
  buscarLancamento,
  criarLancamento,
  definirRepeticao,
  detalhesLancamento,
  editarLancamento,
} from "../servicos/lancamentos.js";
import { gerarLancamentosFixos } from "../servicos/recorrencias.js";

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

rotasTransacoes.get(
  "/",
  assincrono(async (req, res) => {
    const { mes, categoriaId, contaId } = validar(filtro, req.query);
    const { inicio, fim } = intervaloDoMes(mes);
    await gerarLancamentosFixos(req.usuarioId);
    res.json(
      await prisma.transacao.findMany({
        where: { usuarioId: req.usuarioId, data: { gte: inicio, lt: fim }, categoriaId, contaId },
        include: detalhesLancamento,
        orderBy: [{ data: "desc" }, { id: "desc" }],
      }),
    );
  }),
);

rotasTransacoes.get(
  "/:id",
  assincrono(async (req, res) => {
    const transacao = await buscarLancamento(req.params.id, req.usuarioId);
    res.json(await prisma.transacao.findUnique({ where: { id: transacao.id }, include: detalhesLancamento }));
  }),
);

rotasTransacoes.post(
  "/",
  assincrono(async (req, res) => {
    res.status(201).json(await criarLancamento(req.usuarioId, validar(nova, req.body)));
  }),
);

rotasTransacoes.patch(
  "/:id",
  assincrono(async (req, res) => {
    await buscarLancamento(req.params.id, req.usuarioId);
    res.json(await editarLancamento(req.usuarioId, req.params.id, validar(edicao, req.body)));
  }),
);

// Liga ou desliga a repetição mensal de um lançamento ("Repetir todo mês" / "Não repetir")
rotasTransacoes.post(
  "/:id/repetir",
  assincrono(async (req, res) => {
    await buscarLancamento(req.params.id, req.usuarioId);
    const { repetir: ligar } = validar(repetir, req.body);
    res.json(await definirRepeticao(req.usuarioId, req.params.id, ligar));
  }),
);

rotasTransacoes.delete(
  "/:id",
  assincrono(async (req, res) => {
    await apagarLancamento(req.usuarioId, req.params.id);
    res.status(204).end();
  }),
);
