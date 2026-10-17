import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { gerarToken } from "../middlewares/autenticar.js";
import { criarCategoriasPadrao } from "../servicos/categorias.js";

export const rotasAuth = Router();

const cadastro = z.object({
  nome: z.string().trim().min(1, "informe seu nome"),
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  senha: z.string().min(8, "a senha precisa ter pelo menos 8 caracteres"),
});

const login = z.object({
  email: z.string().trim().toLowerCase(),
  senha: z.string(),
});

const publico = (usuario) => ({ id: usuario.id, nome: usuario.nome, email: usuario.email });

rotasAuth.post(
  "/registrar",
  assincrono(async (req, res) => {
    const { nome, email, senha } = validar(cadastro, req.body);
    if (await prisma.usuario.findUnique({ where: { email } })) throw new ErroHttp(409, "Este e-mail já tem conta");

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({ data: { nome, email, senhaHash } });
      await criarCategoriasPadrao(criado.id, tx);
      return criado;
    });
    res.status(201).json({ token: gerarToken(usuario), usuario: publico(usuario) });
  }),
);

rotasAuth.post(
  "/entrar",
  assincrono(async (req, res) => {
    const { email, senha } = validar(login, req.body);
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new ErroHttp(401, "E-mail ou senha incorretos");
    }
    res.json({ token: gerarToken(usuario), usuario: publico(usuario) });
  }),
);
