import { Prisma } from "@prisma/client";
import cors from "cors";
import express from "express";
import { autenticar } from "./middlewares/autenticar.js";
import { tratarErros } from "./middlewares/erros.js";
import { rotasAssistente } from "./rotas/assistente.js";
import { rotasAuth } from "./rotas/auth.js";
import { rotasCadastros } from "./rotas/cadastros.js";
import { rotasDados } from "./rotas/dados.js";
import { rotasDocumentos } from "./rotas/documentos.js";
import { rotasPainel } from "./rotas/painel.js";
import { rotasPerguntas } from "./rotas/perguntas.js";
import { rotasProdutos } from "./rotas/produtos.js";
import { rotasRecorrencias } from "./rotas/recorrencias.js";
import { rotasTransacoes } from "./rotas/transacoes.js";

export const app = express();

// Valores Decimal do Prisma saem como número no JSON, não como string
app.set("json replacer", function (chave, valor) {
  return this[chave] instanceof Prisma.Decimal ? this[chave].toNumber() : valor;
});

// Uma linha por requisição no terminal: ajuda a ver se o celular está chegando na API
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on("finish", () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - inicio}ms`));
  next();
});
app.use(cors());
// Arquivos chegam em base64 no JSON (10 MB viram ~13,4 MB); nas outras rotas o limite é pequeno
app.use("/documentos", express.json({ limit: "15mb" }));
app.use(express.json({ limit: "100kb" }));

app.get("/saude", (_req, res) => res.json({ ok: true }));
app.use("/auth", rotasAuth);

app.use(autenticar);
app.use("/", rotasCadastros);
app.use("/", rotasPainel);
app.use("/", rotasAssistente);
app.use("/", rotasDados);
app.use("/documentos", rotasDocumentos);
app.use("/transacoes", rotasTransacoes);
app.use("/produtos", rotasProdutos);
app.use("/perguntas", rotasPerguntas);
app.use("/recorrencias", rotasRecorrencias);

app.use((_req, res) => res.status(404).json({ erro: "Rota não encontrada" }));
app.use(tratarErros);
