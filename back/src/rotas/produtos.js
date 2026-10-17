import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { comprasDeProdutos } from "../servicos/assistente.js";
import { detalharProduto, inflacaoPessoal, resumirProdutos } from "../servicos/precos.js";

// Produtos dos cupons: preço ao longo do tempo, comparação entre mercados e inflação pessoal
export const rotasProdutos = Router();

const renomear = z.object({ nome: z.string().trim().min(1, "informe o nome do produto") });
const juntar = z.object({ produtoId: z.number().int().positive("escolha o produto") });

async function produtoDoUsuario(id, usuarioId) {
  const produto = await prisma.produto.findFirst({ where: { id, usuarioId } });
  if (!produto) throw new ErroHttp(404, "Produto não encontrado");
  return produto;
}

async function detalhe(id, usuarioId) {
  const produto = await produtoDoUsuario(id, usuarioId);
  return detalharProduto(await comprasDeProdutos(usuarioId, id)) ?? { id, nome: produto.nomeCanonico, compras: 0, historico: [], porMercado: [] };
}

rotasProdutos.get(
  "/",
  assincrono(async (req, res) => {
    const produtos = resumirProdutos(await comprasDeProdutos(req.usuarioId));
    res.json({ inflacao: inflacaoPessoal(produtos), produtos });
  }),
);

rotasProdutos.get(
  "/:id",
  assincrono(async (req, res) => {
    res.json(await detalhe(Number(req.params.id) || 0, req.usuarioId));
  }),
);

// Corrige o nome que a IA deu ao produto
rotasProdutos.patch(
  "/:id",
  assincrono(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const { nome } = validar(renomear, req.body);
    await produtoDoUsuario(id, req.usuarioId);
    const mesmoNome = await prisma.produto.findFirst({ where: { usuarioId: req.usuarioId, nomeCanonico: nome, id: { not: id } } });
    if (mesmoNome) throw new ErroHttp(409, "Já existe um produto com esse nome. Use \"Juntar com outro produto\".");
    await prisma.produto.update({ where: { id }, data: { nomeCanonico: nome } });
    res.json(await detalhe(id, req.usuarioId));
  }),
);

// A IA às vezes dá nomes diferentes ao mesmo produto ("Café Pilão 500g" e "Café Pilão Tradicional 500g"):
// move as compras deste produto para o outro e apaga este
rotasProdutos.post(
  "/:id/juntar",
  assincrono(async (req, res) => {
    const id = Number(req.params.id) || 0;
    const { produtoId: destino } = validar(juntar, req.body);
    if (destino === id) throw new ErroHttp(400, "Escolha um produto diferente");
    await produtoDoUsuario(id, req.usuarioId);
    await produtoDoUsuario(destino, req.usuarioId);
    await prisma.$transaction([
      prisma.item.updateMany({ where: { produtoId: id }, data: { produtoId: destino } }),
      prisma.produto.delete({ where: { id } }),
    ]);
    res.json(await detalhe(destino, req.usuarioId));
  }),
);
