import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { responderPergunta } from "../servicos/perguntas.js";

// "Pergunte ao Bolso": perguntas em português sobre os próprios gastos
export const rotasPerguntas = Router();

const LIMITE_POR_DIA = 40;
const pergunta = z.object({ pergunta: z.string().trim().min(2, "escreva sua pergunta").max(300, "pergunta longa demais") });

rotasPerguntas.post(
  "/",
  assincrono(async (req, res) => {
    const dados = validar(pergunta, req.body);
    // Cada pergunta custa uma chamada pequena à IA; o limite protege os créditos de um uso descontrolado
    const inicioDoDia = new Date(new Date().setHours(0, 0, 0, 0));
    const hoje = await prisma.usoIa.count({ where: { usuarioId: req.usuarioId, tarefa: "pergunta", criadoEm: { gte: inicioDoDia } } });
    if (hoje >= LIMITE_POR_DIA) throw new ErroHttp(429, `Você chegou ao limite de ${LIMITE_POR_DIA} perguntas por dia. Amanhã tem mais!`);

    try {
      res.json(await responderPergunta(req.usuarioId, dados.pergunta));
    } catch (erro) {
      if (erro instanceof ErroHttp) throw erro;
      console.error("Pergunta:", erro.message);
      throw new ErroHttp(503, "Não consegui entender a pergunta agora. Tente de novo em instantes.");
    }
  }),
);
