import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { IMAGENS, TEXTOS, detectarFormato } from "../lib/formatos.js";
import { prisma } from "../lib/prisma.js";
import { acordarProcessador } from "../servicos/processador.js";
import { garantirDono } from "./cadastros.js";

export const rotasDocumentos = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxBytes } });

function tipoPadrao(mimeType) {
  if (IMAGENS.has(mimeType)) return "CUPOM";
  if (mimeType === "application/pdf") return "FATURA";
  return "EXTRATO";
}

function conteudoBase64(arquivo) {
  const conteudo = Buffer.from(arquivo.base64, "base64");
  return { conteudo, mimeType: detectarFormato(conteudo, arquivo.mimeType, arquivo.nome) };
}

const envio = z.object({
  tipo: z.enum(["CUPOM", "FATURA", "EXTRATO", "COMPROVANTE", "CONTA_CONSUMO"]).optional(),
  contaId: z.coerce.number().int().positive().optional(),
  texto: z.string().trim().min(1).max(500).optional(),
  // Formato usado pelo app: o arquivo vai em base64 dentro do JSON
  arquivo: z
    .object({ base64: z.string().min(1), nome: z.string().optional(), mimeType: z.string().optional() })
    .optional(),
});

const camposDocumento = {
  id: true, tipo: true, status: true, mimeType: true, texto: true, observacao: true,
  erro: true, contaId: true, criadoEm: true, processadoEm: true,
};

// Envia um arquivo (multipart no campo "arquivo", ou JSON { arquivo: { base64, nome, mimeType } })
// ou um texto ({ "texto": "gastei 35 no uber" })
rotasDocumentos.post(
  "/",
  upload.single("arquivo"),
  assincrono(async (req, res) => {
    const dados = validar(envio, req.body ?? {});
    await garantirDono("conta", dados.contaId, req.usuarioId);

    let documento;
    const arquivo = req.file
      ? { conteudo: req.file.buffer, mimeType: detectarFormato(req.file.buffer, req.file.mimetype, req.file.originalname) }
      : dados.arquivo && conteudoBase64(dados.arquivo);

    if (arquivo) {
      const { conteudo, mimeType } = arquivo;
      if (!conteudo.length) throw new ErroHttp(400, "O arquivo chegou vazio");
      if (conteudo.length > config.uploadMaxBytes) throw new ErroHttp(413, "Arquivo maior que 10 MB");
      if (!IMAGENS.has(mimeType) && !TEXTOS.has(mimeType) && mimeType !== "application/pdf") {
        throw new ErroHttp(415, "Formato não suportado. Envie foto (JPG/PNG), PDF, CSV ou OFX.");
      }
      documento = { tipo: dados.tipo ?? tipoPadrao(mimeType), mimeType, conteudo };
    } else if (dados.texto) {
      documento = { tipo: "TEXTO", texto: dados.texto };
    } else {
      throw new ErroHttp(400, 'Envie um arquivo no campo "arquivo" ou um "texto"');
    }

    const criado = await prisma.documento.create({
      data: { ...documento, usuarioId: req.usuarioId, contaId: dados.contaId },
      select: camposDocumento,
    });
    acordarProcessador();
    res.status(202).json(criado);
  }),
);

// Histórico de envios, com quantos lançamentos cada um gerou
rotasDocumentos.get(
  "/",
  assincrono(async (req, res) => {
    res.json(
      await prisma.documento.findMany({
        where: { usuarioId: req.usuarioId },
        select: { ...camposDocumento, _count: { select: { transacoes: true } } },
        orderBy: { criadoEm: "desc" },
        take: 30,
      }),
    );
  }),
);

// Apaga um envio. Com ?transacoes=true apaga também os lançamentos que ele gerou
// (útil quando a IA leu um documento errado). Cópias conciliadas com eles voltam a contar.
rotasDocumentos.delete(
  "/:id",
  assincrono(async (req, res) => {
    const documento = await prisma.documento.findFirst({
      where: { id: Number(req.params.id) || 0, usuarioId: req.usuarioId },
    });
    if (!documento) throw new ErroHttp(404, "Documento não encontrado");
    if (documento.status === "PROCESSANDO") throw new ErroHttp(409, "Esse documento está sendo lido agora. Tente daqui a pouco.");

    await prisma.$transaction(async (tx) => {
      if (req.query.transacoes === "true") await tx.transacao.deleteMany({ where: { documentoId: documento.id } });
      await tx.documento.delete({ where: { id: documento.id } });
    });
    res.status(204).end();
  }),
);

// O app consulta esta rota até o status virar PRONTO ou ERRO
rotasDocumentos.get(
  "/:id",
  assincrono(async (req, res) => {
    const documento = await prisma.documento.findFirst({
      where: { id: Number(req.params.id) || 0, usuarioId: req.usuarioId },
      select: {
        ...camposDocumento,
        transacoes: { include: { categoria: true, itens: true }, orderBy: { data: "desc" } },
      },
    });
    if (!documento) throw new ErroHttp(404, "Documento não encontrado");
    res.json(documento);
  }),
);
