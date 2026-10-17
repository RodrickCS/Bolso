import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";

// Direitos do titular (LGPD): levar os próprios dados e apagar tudo
export const rotasDados = Router();

// Planilha no formato do Excel brasileiro: ";" separa colunas e "," separa decimais
function celula(valor) {
  const texto = valor == null ? "" : String(valor);
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCsv(transacoes) {
  const cabecalho = ["Data", "Descrição", "Estabelecimento", "Categoria", "Conta", "Tipo", "Valor", "Parcela", "Origem", "Já contado em outra linha"];
  const linhas = transacoes.map((t) => [
    t.data.toISOString().slice(0, 10).split("-").reverse().join("/"),
    t.descricao,
    t.estabelecimento,
    t.categoria?.nome,
    t.conta?.nome,
    t.tipo === "RECEITA" ? "Entrada" : "Gasto",
    Number(t.valor).toFixed(2).replace(".", ","),
    t.parcelaTotal ? `${t.parcelaAtual}/${t.parcelaTotal}` : "",
    t.origem,
    t.conciliadaComId ? "Sim" : "",
  ]);
  // BOM no começo para o Excel abrir os acentos certo
  return "﻿" + [cabecalho, ...linhas].map((linha) => linha.map(celula).join(";")).join("\r\n") + "\r\n";
}

rotasDados.get(
  "/exportar",
  assincrono(async (req, res) => {
    const transacoes = await prisma.transacao.findMany({
      where: { usuarioId: req.usuarioId },
      include: { categoria: true, conta: true },
      orderBy: [{ data: "desc" }, { id: "desc" }],
    });
    res.set("content-type", "text/csv; charset=utf-8");
    res.set("content-disposition", 'attachment; filename="bolso-lancamentos.csv"');
    res.send(gerarCsv(transacoes));
  }),
);

const confirmacao = z.object({ senha: z.string().min(1, "digite sua senha para confirmar") });

// Exclui a conta e tudo o que pertence a ela (as tabelas apagam em cascata)
rotasDados.delete(
  "/minha-conta",
  assincrono(async (req, res) => {
    const { senha } = validar(confirmacao, req.body);
    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuarioId } });
    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) throw new ErroHttp(403, "Senha incorreta");
    await prisma.usuario.delete({ where: { id: usuario.id } });
    res.status(204).end();
  }),
);
