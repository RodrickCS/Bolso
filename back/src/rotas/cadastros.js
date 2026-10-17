import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";

// Contas (Nubank crédito, Itaú corrente, dinheiro...) e categorias
export const rotasCadastros = Router();

const novaConta = z.object({
  nome: z.string().trim().min(1, "informe o nome da conta"),
  tipo: z.enum(["CORRENTE", "CREDITO", "POUPANCA", "DINHEIRO"]),
});

const novaCategoria = z.object({
  nome: z.string().trim().min(1, "informe o nome da categoria"),
  tipo: z.enum(["DESPESA", "RECEITA"]).default("DESPESA"),
});

rotasCadastros.get(
  "/contas",
  assincrono(async (req, res) => {
    res.json(await prisma.conta.findMany({ where: { usuarioId: req.usuarioId }, orderBy: { nome: "asc" } }));
  }),
);

rotasCadastros.post(
  "/contas",
  assincrono(async (req, res) => {
    const dados = validar(novaConta, req.body);
    res.status(201).json(await prisma.conta.create({ data: { ...dados, usuarioId: req.usuarioId } }));
  }),
);

rotasCadastros.get(
  "/categorias",
  assincrono(async (req, res) => {
    res.json(
      await prisma.categoria.findMany({ where: { usuarioId: req.usuarioId }, orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
    );
  }),
);

rotasCadastros.post(
  "/categorias",
  assincrono(async (req, res) => {
    const dados = validar(novaCategoria, req.body);
    const existente = await prisma.categoria.findUnique({
      where: { usuarioId_nome: { usuarioId: req.usuarioId, nome: dados.nome } },
    });
    if (existente) throw new ErroHttp(409, "Já existe uma categoria com esse nome");
    res.status(201).json(await prisma.categoria.create({ data: { ...dados, usuarioId: req.usuarioId } }));
  }),
);

// Confere se a conta/categoria informada pertence ao usuário logado
export async function garantirDono(modelo, id, usuarioId) {
  if (id == null) return;
  const registro = await prisma[modelo].findFirst({ where: { id, usuarioId } });
  if (!registro) throw new ErroHttp(404, `${modelo === "conta" ? "Conta" : "Categoria"} não encontrada`);
}
