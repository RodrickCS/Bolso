import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { categoriaLembrada, lembrarCategoria } from "./categorias.js";
import { decidirConciliacao, ehReenvio } from "./conciliacao.js";
import { absorverAutomatico, categoriaDeAssinatura, repetirTodoMes } from "./recorrencias.js";

const ORIGEM_POR_DOCUMENTO = {
  TEXTO: "TEXTO",
  CUPOM: "CUPOM",
  FATURA: "FATURA",
  EXTRATO: "EXTRATO",
  COMPROVANTE: "COMPROVANTE",
  CONTA_CONSUMO: "CONTA_CONSUMO",
};
const UM_DIA = 24 * 60 * 60 * 1000;
// Gastos fixos só nascem de documentos avulsos; faturas e extratos já trazem a cobrança todo mês
const PODE_REPETIR = new Set(["TEXTO", "COMPROVANTE", "CONTA_CONSUMO"]);

const arredondar = (valor) => Math.round(Number(valor) * 100) / 100;

// "2026-10-17" -> Date em UTC. Recusa datas que o JS "corrigiria" sozinho, como 2026-02-31.
export function dataDoDia(textoISO) {
  const data = new Date(`${textoISO}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === textoISO ? data : null;
}

// Cria a transação, a menos que seja a mesma linha de fatura reenviada, e faz a conciliação.
// Devolve a transação criada ou null.
export async function inserirTransacao(tx, dados, itens = []) {
  const candidatas = await tx.transacao.findMany({
    where: {
      usuarioId: dados.usuarioId,
      tipo: dados.tipo,
      // Comparar com number não acha 87.40 no Postgres (ponto flutuante); Decimal compara exato
      valor: new Prisma.Decimal(dados.valor),
      data: { gte: new Date(dados.data.getTime() - 3 * UM_DIA), lte: new Date(dados.data.getTime() + 3 * UM_DIA) },
    },
  });
  if (ehReenvio(dados, candidatas)) return null;

  const criada = await tx.transacao.create({
    data: {
      ...dados,
      itens: {
        create: itens.map((item) => ({
          descricao: item.descricao,
          quantidade: item.quantidade,
          precoTotal: arredondar(item.preco_total),
          produto: {
            connectOrCreate: {
              where: { usuarioId_nomeCanonico: { usuarioId: dados.usuarioId, nomeCanonico: item.nome_canonico } },
              create: { usuarioId: dados.usuarioId, nomeCanonico: item.nome_canonico },
            },
          },
        })),
      },
    },
  });

  const conciliacao = decidirConciliacao(criada, candidatas);
  if (conciliacao) {
    await tx.transacao.update({
      where: { id: conciliacao.duplicataId },
      data: { conciliadaComId: conciliacao.oficialId },
    });
  }
  // Um gasto fixo lançado automaticamente sai da soma quando a cobrança de verdade chega
  await absorverAutomatico(tx, criada);
  return criada;
}

// Grava no banco o que a IA (ou o parser local) extraiu de um documento
export async function salvarExtracao(documento, extracao) {
  const { usuarioId } = documento;
  const categorias = await prisma.categoria.findMany({ where: { usuarioId } });
  const idPorNome = new Map(categorias.map((c) => [c.nome, c.id]));
  const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));

  return prisma.$transaction(
    async (tx) => {
      const criadas = [];
      for (const t of extracao.transacoes) {
        const data = dataDoDia(t.data);
        if (!data || !(t.valor > 0)) continue;

        // A memória de categorias vale mais que a sugestão da IA: ela guarda as correções do usuário
        const referencia = t.estabelecimento ?? t.descricao;
        const lembrada = await categoriaLembrada(usuarioId, referencia, tx);
        const categoriaId = lembrada ?? idPorNome.get(t.categoria) ?? idPorNome.get("Outros") ?? null;
        const inteiro = (n) => (Number.isFinite(n) ? Math.round(n) : null);

        const criada = await inserirTransacao(
          tx,
          {
            usuarioId,
            contaId: documento.contaId,
            documentoId: documento.id,
            origem: ORIGEM_POR_DOCUMENTO[documento.tipo],
            tipo: t.tipo === "RECEITA" ? "RECEITA" : "DESPESA",
            valor: arredondar(t.valor),
            data,
            descricao: t.descricao,
            estabelecimento: t.estabelecimento,
            parcelaAtual: inteiro(t.parcela_atual),
            parcelaTotal: inteiro(t.parcela_total),
            categoriaId,
          },
          t.itens,
        );
        if (!criada) continue;
        if (!lembrada) await lembrarCategoria(usuarioId, referencia, categoriaId, { db: tx });
        // A IA diz se o gasto se repete todo mês com o mesmo valor; sem a opinião dela, vale a categoria Assinaturas
        const repete = t.repete_todo_mes ?? categoriaDeAssinatura(nomePorId.get(categoriaId));
        if (repete && PODE_REPETIR.has(documento.tipo)) await repetirTodoMes(tx, criada, { criadaPorIa: true });
        criadas.push(criada.id);
      }
      return criadas;
    },
    { timeout: 60_000 },
  );
}
