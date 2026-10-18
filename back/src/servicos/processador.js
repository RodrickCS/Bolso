import { config } from "../config.js";
import { ehErroTemporario } from "../ia/cliente.js";
import { extrairTransacoes } from "../ia/extrair.js";
import { prisma } from "../lib/prisma.js";
import { categoriaLembrada } from "./categorias.js";
import { salvarExtracao } from "./importacao.js";
import { documentoParaIa, ehNfce, extracaoNfce } from "./nfce.js";
import { gerarLancamentosFixos } from "./recorrencias.js";
import { interpretarTextoLocal } from "./texto.js";

// Fila simples usando a própria tabela Documento: sem Redis, cabe no plano grátis.
// Ler uma fatura pode levar alguns segundos, então o upload responde na hora
// e o processamento acontece aqui, em segundo plano.

async function reivindicarProximo() {
  // FOR UPDATE SKIP LOCKED: se um dia houver mais de uma instância, cada documento é pego por uma só
  const [linha] = await prisma.$queryRaw`
    UPDATE "Documento"
    SET status = 'PROCESSANDO', tentativas = tentativas + 1
    WHERE id = (
      SELECT id FROM "Documento"
      WHERE status = 'PENDENTE' AND ("tentarApos" IS NULL OR "tentarApos" <= NOW())
      ORDER BY "criadoEm"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return linha ? prisma.documento.findUnique({ where: { id: linha.id } }) : null;
}

// Frases simples de estabelecimentos conhecidos não precisam da IA
async function extracaoSemIa(documento) {
  if (documento.tipo !== "TEXTO") return null;
  const local = interpretarTextoLocal(documento.texto);
  if (!local || !(await categoriaLembrada(documento.usuarioId, local.descricao))) return null;
  return {
    transacoes: [
      { ...local, estabelecimento: null, categoria: null, parcela_atual: null, parcela_total: null, itens: [] },
    ],
    observacao: null,
  };
}

export async function processarDocumento(documento) {
  try {
    let extracao = ehNfce(documento) ? await extracaoNfce(documento) : await extracaoSemIa(documento);
    if (!extracao) {
      const categorias = await prisma.categoria.findMany({ where: { usuarioId: documento.usuarioId } });
      // Em cupons, a IA reaproveita os nomes de produtos já vistos, para o histórico de preços juntar as compras
      const produtos =
        documento.tipo === "CUPOM"
          ? await prisma.produto.findMany({ where: { usuarioId: documento.usuarioId }, orderBy: { id: "desc" }, take: 150 })
          : [];
      // Mais antigos primeiro: produto novo entra no fim da lista, e o começo do bloco no cache não muda
      const nomesProdutos = produtos.map((p) => p.nomeCanonico).reverse();
      extracao = await extrairTransacoes(documentoParaIa(documento), categorias.map((c) => c.nome), nomesProdutos);
    }
    await salvarExtracao(documento, extracao);
    await prisma.documento.update({
      where: { id: documento.id },
      // O arquivo original é apagado assim que é lido
      data: { status: "PRONTO", conteudo: null, observacao: extracao.observacao, processadoEm: new Date() },
    });
  } catch (erro) {
    const tentarDeNovo = ehErroTemporario(erro) && documento.tentativas < config.processador.maxTentativas;
    console.error(`Documento ${documento.id}: ${erro.message}${tentarDeNovo ? " (vai tentar de novo)" : ""}`);
    await prisma.documento.update({
      where: { id: documento.id },
      data: tentarDeNovo
        ? { status: "PENDENTE", tentarApos: new Date(Date.now() + 30_000 * documento.tentativas) }
        : { status: "ERRO", erro: erro.message, conteudo: null, processadoEm: new Date() },
    });
  }
}

let execucao = null;
let chamadoDeNovo = false;

// Se já estiver rodando, devolve a execução atual e garante mais uma volta no final,
// para não perder um documento que chegou no meio do caminho
export function processarPendentes() {
  if (execucao) {
    chamadoDeNovo = true;
    return execucao;
  }
  execucao = (async () => {
    try {
      do {
        chamadoDeNovo = false;
        let documento;
        while ((documento = await reivindicarProximo())) await processarDocumento(documento);
      } while (chamadoDeNovo);
    } catch (erro) {
      console.error("Processador:", erro);
    } finally {
      execucao = null;
    }
  })();
  return execucao;
}

export function acordarProcessador() {
  processarPendentes();
}

export async function iniciarProcessador() {
  // Documentos que estavam no meio do processamento quando o servidor caiu voltam para a fila
  await prisma.documento.updateMany({ where: { status: "PROCESSANDO" }, data: { status: "PENDENTE" } });
  setInterval(processarPendentes, config.processador.intervaloMs);
  // Gastos fixos que vencem hoje: uma volta por hora (e o painel também gera os do usuário ao abrir)
  const gerarFixos = () => gerarLancamentosFixos().catch((erro) => console.error("Gastos fixos:", erro.message));
  setInterval(gerarFixos, 60 * 60 * 1000);
  gerarFixos();
  processarPendentes();
}
