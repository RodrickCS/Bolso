import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { ErroHttp, assincrono, validar } from "../lib/erros.js";
import { IMAGENS, TEXTOS, detectarFormato } from "../lib/formatos.js";
import { decodificarPagina, enderecoDaSefaz, lerQrCode } from "../lib/nfce.js";
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

// O mesmo arquivo de novo é recusado antes de ir para a IA, sem gastar créditos.
// Envio que deu erro não conta (dá para tentar de novo), e apagar o envio libera o arquivo.
async function recusarRepetido(usuarioId, hashConteudo, oQue = "esse arquivo") {
  const anterior = await prisma.documento.findFirst({
    where: { usuarioId, hashConteudo, status: { not: "ERRO" } },
    orderBy: { criadoEm: "desc" },
  });
  if (!anterior) return;
  const quando = anterior.criadoEm.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  throw new ErroHttp(
    409,
    `Você já enviou ${oQue} em ${quando.replace(", ", " às ")}. Ele não foi lido de novo, para não gastar créditos da IA. Se quiser ler outra vez, apague o envio anterior no histórico.`,
  );
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
      const hashConteudo = createHash("sha256").update(conteudo).digest("hex");
      await recusarRepetido(req.usuarioId, hashConteudo);
      documento = { tipo: dados.tipo ?? tipoPadrao(mimeType), mimeType, conteudo, hashConteudo };
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

const envioNfce = z.object({
  qrcode: z.string().trim().min(1, "leia o QR Code do cupom"),
  contaId: z.coerce.number().int().positive().optional(),
  // O app abre a página da SEFAZ pelo celular (que está no Brasil; alguns sites recusam servidores de fora)
  // e manda os bytes para cá. Sem a página, o servidor tenta abrir sozinho.
  pagina: z.object({ base64: z.string().min(1), tipo: z.string().optional() }).optional(),
});

const LIMITE_PAGINA = 5 * 1024 * 1024;

async function baixarPagina(url) {
  if (!enderecoDaSefaz(url)) throw new ErroHttp(400, "Esse QR Code não aponta para um site da SEFAZ");
  try {
    // Redirecionamentos seguidos à mão, para conferir que cada endereço continua sendo do governo
    let endereco = url;
    let resposta;
    for (let saltos = 0; ; saltos++) {
      resposta = await fetch(endereco, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36" },
      });
      const destino = resposta.headers.get("location");
      if (resposta.status < 300 || resposta.status >= 400 || !destino) break;
      endereco = new URL(destino, endereco).toString();
      if (saltos >= 3 || !enderecoDaSefaz(endereco)) throw new Error(`redirecionamento para ${endereco}`);
    }
    if (!resposta.ok) throw new Error(`status ${resposta.status}`);
    const bytes = Buffer.from(await resposta.arrayBuffer());
    if (bytes.length > LIMITE_PAGINA) throw new Error("página grande demais");
    return decodificarPagina(bytes, resposta.headers.get("content-type") ?? "");
  } catch (erro) {
    console.error(`SEFAZ ${new URL(url).hostname}: ${erro.message}`);
    throw new ErroHttp(502, "Não consegui abrir a nota no site da SEFAZ agora. Tente de novo em alguns minutos ou tire uma foto do cupom.");
  }
}

// Cupom fiscal pelo QR Code (NFC-e): os itens vêm da SEFAZ, sem a IA ler foto
rotasDocumentos.post(
  "/nfce",
  assincrono(async (req, res) => {
    const dados = validar(envioNfce, req.body ?? {});
    await garantirDono("conta", dados.contaId, req.usuarioId);
    const qr = lerQrCode(dados.qrcode);
    if (!qr) throw new ErroHttp(400, "Esse QR Code não é de um cupom fiscal eletrônico (NFC-e)");

    // A mesma nota lida duas vezes é recusada, mesmo que a página venha um pouco diferente
    const hashConteudo = createHash("sha256").update(`nfce:${qr.chave}`).digest("hex");
    await recusarRepetido(req.usuarioId, hashConteudo, "esse cupom");

    let html;
    if (dados.pagina) {
      const bytes = Buffer.from(dados.pagina.base64, "base64");
      if (bytes.length > LIMITE_PAGINA) throw new ErroHttp(413, "Página da nota grande demais");
      html = decodificarPagina(bytes, dados.pagina.tipo ?? "");
    } else {
      html = await baixarPagina(qr.url);
    }

    const criado = await prisma.documento.create({
      data: {
        usuarioId: req.usuarioId,
        contaId: dados.contaId,
        tipo: "CUPOM",
        mimeType: "text/html",
        conteudo: Buffer.from(html, "utf8"),
        hashConteudo,
      },
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
        transacoes: {
          include: { categoria: true, itens: true, recorrencia: { select: { id: true, ativa: true, dia: true } } },
          orderBy: { data: "desc" },
        },
      },
    });
    if (!documento) throw new ErroHttp(404, "Documento não encontrado");
    res.json(documento);
  }),
);
