import { z } from "zod";

// A API garante a estrutura (campos, tipos, obrigatórios). Já a lista de categorias vai só
// como orientação: o SDK não envia "enum" como restrição, e uma categoria fora da lista
// faria o documento inteiro falhar na validação. Quem garante a lista é o back-end,
// que troca valores desconhecidos por "Outros".
const listaCategorias = (nomes) => `Exatamente uma destas: ${nomes.join(", ")}`;

export function esquemaExtracao(nomesCategorias) {
  const item = z.object({
    descricao: z.string().describe("Texto do item como aparece no cupom"),
    nome_canonico: z
      .string()
      .describe('Nome limpo e padronizado do produto, ex: "CAFE PILAO TRAD 500G" -> "Café Pilão 500g"'),
    quantidade: z.number(),
    preco_total: z.number().describe("Preço total do item em reais"),
  });

  const transacao = z.object({
    data: z.string().describe("Data no formato AAAA-MM-DD"),
    descricao: z.string().describe("Descrição curta e legível do gasto"),
    estabelecimento: z.string().nullable().describe("Nome do estabelecimento ou pessoa, se houver"),
    valor: z.number().describe("Valor positivo em reais"),
    tipo: z.string().describe("DESPESA ou RECEITA"),
    categoria: z.string().describe(listaCategorias(nomesCategorias)),
    parcela_atual: z.number().nullable().describe("Número da parcela, ex: 3 em 3/10"),
    parcela_total: z.number().nullable().describe("Total de parcelas, ex: 10 em 3/10"),
    itens: z.array(item).describe("Itens do cupom fiscal; lista vazia para outros documentos"),
  });

  return z.object({
    transacoes: z.array(transacao),
    observacao: z
      .string()
      .nullable()
      .describe("Problema na leitura (imagem borrada, documento cortado...), ou null"),
  });
}

export const esquemaCategoria = (nomesCategorias) =>
  z.object({ categoria: z.string().describe(listaCategorias(nomesCategorias)) });
