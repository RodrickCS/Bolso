import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { parametroMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { assinaturasDetectadas, dicasDoMes, statusOrcamentos } from "../servicos/assistente.js";
import { garantirDono } from "./cadastros.js";

export const rotasAssistente = Router();

const filtro = z.object({ mes: parametroMes });
const orcamento = z.object({ valorMensal: z.number().positive("o orçamento precisa ser maior que zero") });

rotasAssistente.get(
  "/assistente",
  assincrono(async (req, res) => {
    const { mes } = validar(filtro, req.query);
    res.json(await dicasDoMes(req.usuarioId, mes));
  }),
);

rotasAssistente.get(
  "/assinaturas",
  assincrono(async (req, res) => {
    const { mes } = validar(filtro, req.query);
    const assinaturas = await assinaturasDetectadas(req.usuarioId, mes);
    const totalMensal = assinaturas.filter((a) => a.ativa).reduce((soma, a) => soma + a.valorMensal, 0);
    res.json({ assinaturas, totalMensal: Math.round(totalMensal * 100) / 100 });
  }),
);

rotasAssistente.get(
  "/orcamentos",
  assincrono(async (req, res) => {
    const { mes } = validar(filtro, req.query);
    res.json(await statusOrcamentos(req.usuarioId, mes));
  }),
);

// Cria ou altera o orçamento mensal de uma categoria
rotasAssistente.put(
  "/orcamentos/:categoriaId",
  assincrono(async (req, res) => {
    const categoriaId = Number(req.params.categoriaId) || 0;
    const { valorMensal } = validar(orcamento, req.body);
    await garantirDono("categoria", categoriaId, req.usuarioId);
    const salvo = await prisma.orcamento.upsert({
      where: { usuarioId_categoriaId: { usuarioId: req.usuarioId, categoriaId } },
      create: { usuarioId: req.usuarioId, categoriaId, valorMensal },
      update: { valorMensal },
    });
    res.json(salvo);
  }),
);

rotasAssistente.delete(
  "/orcamentos/:categoriaId",
  assincrono(async (req, res) => {
    const { count } = await prisma.orcamento.deleteMany({
      where: { usuarioId: req.usuarioId, categoriaId: Number(req.params.categoriaId) || 0 },
    });
    if (!count) throw new ErroHttp(404, "Orçamento não encontrado");
    res.status(204).end();
  }),
);
