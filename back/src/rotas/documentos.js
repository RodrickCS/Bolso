import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { acordarProcessador } from "../servicos/processador.js";
import { garantirDono } from "./cadastros.js";

export const rotasDocumentos = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxBytes } });

// Formatos que a API do Claude lê direto, mais os arquivos de texto que os bancos exportam
const IMAGENS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXTOS = new Set(["text/csv", "text/plain", "application/x-ofx", "application/ofx", "text/x-ofx"]);

function tipoPadrao(mimeType) {
  if (IMAGENS.has(mimeType)) return "CUPOM";
  if (mimeType === "application/pdf") return "FATURA";
  return "EXTRATO";
}

function mimeDoArquivo(arquivo) {
  // Muitos celulares mandam .ofx/.csv como application/octet-stream
  if (arquivo.mimetype === "application/octet-stream") {
    if (/\.ofx$/i.test(arquivo.originalname)) return "application/x-ofx";
    if (/\.csv$/i.test(arquivo.originalname)) return "text/csv";
  }
  return arquivo.mimetype;
}

const envio = z.object({
  tipo: z.enum(["CUPOM", "FATURA", "EXTRATO", "COMPROVANTE", "CONTA_CONSUMO"]).optional(),
  contaId: z.coerce.number().int().positive().optional(),
  texto: z.string().trim().min(1).max(500).optional(),
});

const camposDocumento = {
  id: true, tipo: true, status: true, mimeType: true, texto: true, observacao: true,
  erro: true, contaId: true, criadoEm: true, processadoEm: true,
};

// Envia um arquivo (multipart, campo "arquivo") ou um texto ({ "texto": "gastei 35 no uber" })
rotasDocumentos.post(
  "/",
  upload.single("arquivo"),
  assincrono(async (req, res) => {
    const dados = validar(envio, req.body ?? {});
    await garantirDono("conta", dados.contaId, req.usuarioId);

    let documento;
    if (req.file) {
      const mimeType = mimeDoArquivo(req.file);
      if (!IMAGENS.has(mimeType) && !TEXTOS.has(mimeType) && mimeType !== "application/pdf") {
        throw new ErroHttp(415, "Formato não suportado. Envie foto (JPG/PNG), PDF, CSV ou OFX.");
      }
      documento = {
        tipo: dados.tipo ?? tipoPadrao(mimeType),
        mimeType,
        conteudo: req.file.buffer,
      };
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

rotasDocumentos.get(
  "/",
  assincrono(async (req, res) => {
    res.json(
      await prisma.documento.findMany({
        where: { usuarioId: req.usuarioId },
        select: camposDocumento,
        orderBy: { criadoEm: "desc" },
        take: 30,
      }),
    );
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
