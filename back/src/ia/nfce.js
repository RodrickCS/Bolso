import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.js";
import { FALLBACK, clienteIa, registrarUso, verificarResposta } from "./cliente.js";

const INSTRUCOES = `Você organiza compras do Bolso, um app brasileiro de controle de gastos.
Recebe a loja e os itens de um cupom fiscal eletrônico (NFC-e), já lidos do site da SEFAZ.

Regras:
- Para cada item, dê um nome limpo e padronizado, com marca e tamanho quando houver.
  Ex: "CAFE PILAO TRAD 500G" -> "Café Pilão 500g"; "BANANA PRATA KG" -> "Banana prata (kg)".
- Se o item for um dos produtos que o usuário já comprou, use exatamente o mesmo nome.
- Escolha a categoria da compra inteira.`;

const esquema = (nomesCategorias) =>
  z.object({
    categoria: z.string().describe(`Exatamente uma destas: ${nomesCategorias.join(", ")}`),
    itens: z
      .array(z.object({ indice: z.number().int(), nome_canonico: z.string() }))
      .describe("Um por item, com o mesmo índice da lista recebida"),
  });

// Devolve { categoria, nomes: Map(indice -> nome) }, ou null no modo mock (quem chama usa nomes do próprio cupom).
// Só os itens nunca vistos vêm para cá, então uma compra repetida quase não gasta nada.
export async function organizarCompra(usuarioId, { loja, itens }, nomesCategorias, produtosConhecidos = []) {
  if (config.ia.mock) return null;

  const lista = itens.map((descricao, i) => `${i}. ${descricao}`).join("\n");
  const conhecidos = produtosConhecidos.length
    ? `\n\nProdutos que o usuário já comprou:\n${produtosConhecidos.join("\n")}`
    : "";
  const resposta = await clienteIa().beta.messages.parse({
    model: config.ia.modeloRapido,
    max_tokens: 8000,
    ...FALLBACK,
    system: INSTRUCOES,
    output_config: { effort: "low", format: betaZodOutputFormat(esquema(nomesCategorias)) },
    messages: [{ role: "user", content: `Loja: ${loja}\n\nItens:\n${lista || "(nenhum item novo)"}${conhecidos}` }],
  });
  await registrarUso(usuarioId, "nfce", resposta);
  const { categoria, itens: nomeados } = verificarResposta(resposta);
  return {
    categoria,
    nomes: new Map(nomeados.filter((i) => i.nome_canonico?.trim()).map((i) => [i.indice, i.nome_canonico.trim()])),
  };
}
