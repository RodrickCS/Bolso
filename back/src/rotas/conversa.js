import { Router } from "express";
import { z } from "zod";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { cancelarAcao, cartaoDaAcao, confirmarAcao, desfazerAcao } from "../servicos/acoes.js";
import { conversar } from "../servicos/conversa.js";

// Chat do assistente: conversa e os botões dos cartões (confirmar, cancelar, desfazer)
export const rotasConversa = Router();

const LIMITE_POR_DIA = 40;

const mensagem = z.object({
  mensagem: z.string().trim().min(1, "escreva uma mensagem").max(500, "mensagem longa demais"),
  historico: z
    .array(z.object({ papel: z.enum(["usuario", "bolso"]), texto: z.string().max(4000) }))
    .max(40)
    .default([]),
  referencias: z.string().max(6000).optional(),
});

rotasConversa.post(
  "/",
  assincrono(async (req, res) => {
    const dados = validar(mensagem, req.body);
    // Cada mensagem custa algumas chamadas à IA; o limite protege os créditos de um uso descontrolado
    const inicioDoDia = new Date(new Date().setHours(0, 0, 0, 0));
    const hoje = await prisma.usoIa.count({ where: { usuarioId: req.usuarioId, tarefa: "conversa", criadoEm: { gte: inicioDoDia } } });
    if (hoje >= LIMITE_POR_DIA) throw new ErroHttp(429, `Você chegou ao limite de ${LIMITE_POR_DIA} mensagens por dia. Amanhã tem mais!`);

    try {
      res.json(await conversar(req.usuarioId, dados));
    } catch (erro) {
      if (erro instanceof ErroHttp) throw erro;
      // Status e mensagem completos no log do servidor (no Render: aba Logs), para achar a causa sem expor ao usuário
      console.error("Conversa:", erro.status ?? "", erro.message);
      throw new ErroHttp(503, "Não consegui responder agora. Tente de novo em instantes.");
    }
  }),
);

rotasConversa.post(
  "/acoes/:id/confirmar",
  assincrono(async (req, res) => {
    res.json(cartaoDaAcao(await confirmarAcao(req.usuarioId, req.params.id)));
  }),
);

rotasConversa.post(
  "/acoes/:id/cancelar",
  assincrono(async (req, res) => {
    res.json(cartaoDaAcao(await cancelarAcao(req.usuarioId, req.params.id)));
  }),
);

rotasConversa.post(
  "/acoes/:id/desfazer",
  assincrono(async (req, res) => {
    res.json(cartaoDaAcao(await desfazerAcao(req.usuarioId, req.params.id)));
  }),
);
