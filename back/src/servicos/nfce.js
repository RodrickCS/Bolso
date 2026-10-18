import { organizarCompra } from "../ia/nfce.js";
import { lerPaginaNfce, nomeLegivel, paginaSemNota, textoDaPagina } from "../lib/nfce.js";
import { prisma } from "../lib/prisma.js";
import { categoriaLembrada } from "./categorias.js";
import { hojeISO } from "./texto.js";

export const ehNfce = (documento) => documento.mimeType === "text/html";

const html = (documento) => Buffer.from(documento.conteudo).toString("utf8");

// Monta a extração a partir da página da SEFAZ, sem a IA ler nada.
// A IA só entra para dar nome aos itens que o usuário nunca comprou e para a categoria de uma loja nova.
// Devolve null se o layout da página for desconhecido (aí a IA lê o texto da página).
export async function extracaoNfce(documento) {
  const nota = lerPaginaNfce(html(documento));
  if (!nota) {
    if (paginaSemNota(textoDaPagina(html(documento)))) {
      throw new Error(
        "A SEFAZ ainda não mostra essa nota. Cupons emitidos sem internet podem levar até 24 horas para aparecer: tente de novo mais tarde ou tire uma foto do cupom.",
      );
    }
    return null;
  }

  const { usuarioId } = documento;
  const loja = nomeLegivel(nota.loja ?? "Compra");

  // Itens já comprados antes (mesmo texto no cupom) reaproveitam o nome do produto
  const descricoes = [...new Set(nota.itens.map((i) => i.descricao))];
  const anteriores = await prisma.item.findMany({
    where: { descricao: { in: descricoes }, produto: { usuarioId } },
    select: { descricao: true, produto: { select: { nomeCanonico: true } } },
    orderBy: { id: "desc" },
  });
  const nomes = new Map();
  for (const a of anteriores) if (!nomes.has(a.descricao)) nomes.set(a.descricao, a.produto.nomeCanonico);

  const novos = descricoes.filter((d) => !nomes.has(d));
  const lembrada = await categoriaLembrada(usuarioId, loja);
  let categoria = null;
  if (novos.length || !lembrada) {
    try {
      const [categorias, produtos] = await Promise.all([
        prisma.categoria.findMany({ where: { usuarioId, tipo: "DESPESA" } }),
        prisma.produto.findMany({ where: { usuarioId }, orderBy: { id: "desc" }, take: 150 }),
      ]);
      const organizado = await organizarCompra(
        usuarioId,
        { loja, itens: novos },
        categorias.map((c) => c.nome),
        produtos.map((p) => p.nomeCanonico),
      );
      categoria = organizado?.categoria ?? null;
      novos.forEach((descricao, i) => organizado?.nomes.has(i) && nomes.set(descricao, organizado.nomes.get(i)));
    } catch (erro) {
      // Os dados da nota são oficiais: sem a IA, a compra entra com os nomes do próprio cupom
      console.error(`NFC-e ${documento.id}: ${erro.message}`);
    }
  }

  return {
    transacoes: [
      {
        data: nota.data ?? hojeISO(),
        descricao: loja,
        estabelecimento: loja,
        valor: nota.total,
        tipo: "DESPESA",
        categoria,
        parcela_atual: null,
        parcela_total: null,
        itens: nota.itens.map((i) => ({
          descricao: i.descricao,
          nome_canonico: nomes.get(i.descricao) ?? nomeLegivel(i.descricao),
          quantidade: i.quantidade,
          preco_total: i.precoTotal,
        })),
      },
    ],
    observacao: null,
  };
}

// Para a IA, vai só o texto da página (sem HTML, scripts e estilos): bem menos tokens
export function documentoParaIa(documento) {
  if (!ehNfce(documento)) return documento;
  return { ...documento, mimeType: "text/plain", conteudo: Buffer.from(textoDaPagina(html(documento))) };
}
