import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { gerarLancamentosFixos, proximoVencimento } from "../servicos/recorrencias.js";
import { garantirDono } from "./cadastros.js";

// Gastos fixos que se repetem todo mês
export const rotasRecorrencias = Router();

const edicao = z.object({
  valor: z.number().positive("o valor precisa ser maior que zero").optional(),
  dia: z.number().int().min(1).max(31, "o dia vai de 1 a 31").optional(),
  descricao: z.string().trim().min(1).optional(),
  categoriaId: z.number().int().positive().nullable().optional(),
  contaId: z.number().int().positive().nullable().optional(),
  ativa: z.boolean().optional(),
});

const campos = {
  categoria: { select: { id: true, nome: true } },
  _count: { select: { transacoes: true } },
};

async function daUsuario(id, usuarioId) {
  const recorrencia = await prisma.recorrencia.findFirst({ where: { id: Number(id) || 0, usuarioId } });
  if (!recorrencia) throw new ErroHttp(404, "Gasto fixo não encontrado");
  return recorrencia;
}

rotasRecorrencias.get(
  "/",
  assincrono(async (req, res) => {
    await gerarLancamentosFixos(req.usuarioId);
    const lista = await prisma.recorrencia.findMany({
      where: { usuarioId: req.usuarioId },
      include: campos,
      orderBy: [{ ativa: "desc" }, { dia: "asc" }],
    });
    const totalMensal = lista.filter((r) => r.ativa).reduce((soma, r) => soma + Number(r.valor), 0);
    res.json({ recorrencias: lista, totalMensal: Math.round(totalMensal * 100) / 100 });
  }),
);

rotasRecorrencias.patch(
  "/:id",
  assincrono(async (req, res) => {
    const atual = await daUsuario(req.params.id, req.usuarioId);
    const dados = validar(edicao, req.body);
    await garantirDono("categoria", dados.categoriaId, req.usuarioId);
    await garantirDono("conta", dados.contaId, req.usuarioId);
    const dia = dados.dia ?? atual.dia;
    // Mudou o dia ou voltou a valer: o próximo vencimento é recalculado a partir de hoje
    const recalcular = dados.dia !== undefined || (dados.ativa && !atual.ativa);
    const salva = await prisma.recorrencia.update({
      where: { id: atual.id },
      data: { ...dados, ...(recalcular && { proximaData: proximoVencimento(dia) }) },
      include: campos,
    });
    res.json(salva);
  }),
);

// Apaga o gasto fixo; os lançamentos que ele já gerou continuam
rotasRecorrencias.delete(
  "/:id",
  assincrono(async (req, res) => {
    const atual = await daUsuario(req.params.id, req.usuarioId);
    await prisma.recorrencia.delete({ where: { id: atual.id } });
    res.status(204).end();
  }),
);
