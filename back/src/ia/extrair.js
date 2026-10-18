import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { config } from "../config.js";
import { textoDoArquivo } from "../lib/formatos.js";
import { hojeISO } from "../servicos/texto.js";
import { CACHE, FALLBACK, clienteIa, registrarUso, verificarResposta } from "./cliente.js";
import { esquemaCategoria, esquemaExtracao } from "./esquemas.js";
import { respostaMock } from "./mocks/index.js";

const INSTRUCOES = `Você é o leitor de documentos financeiros do Bolso, um app brasileiro de controle de gastos.
Extraia as transações do conteúdo enviado pelo usuário.

Regras:
- Valores sempre positivos, em reais. Use "tipo" para dizer se é DESPESA ou RECEITA.
- Cupom fiscal: uma única transação com o total pago, a data da compra e todos os itens.
- Fatura de cartão: uma transação por linha de compra. Ignore pagamentos da fatura, saldo anterior,
  totais e limites. Em compras parceladas ("3/10"), use o valor da parcela e preencha parcela_atual e parcela_total.
- Extrato bancário: uma transação por movimentação. Ignore linhas de saldo.
- Comprovante de Pix ou transferência: uma transação, com o destinatário em "estabelecimento".
- Conta de consumo (luz, água, internet, boleto): uma transação com o valor e a data de vencimento.
- Texto livre do usuário ("gastei 35 no uber ontem"): resolva datas relativas a partir da data de hoje.
- Escolha a categoria mais adequada entre as permitidas. Na dúvida, use "Outros".
- Se não houver nenhuma transação legível, devolva a lista vazia e explique em "observacao".`;

const ROTULOS = {
  CUPOM: "cupom fiscal",
  FATURA: "fatura de cartão de crédito",
  EXTRATO: "extrato bancário",
  COMPROVANTE: "comprovante de pagamento",
  CONTA_CONSUMO: "conta de consumo ou boleto",
  TEXTO: "texto digitado pelo usuário",
};

function blocoConteudo(documento) {
  if (documento.tipo === "TEXTO") return { type: "text", text: `<texto>${documento.texto}</texto>` };

  const base64 = Buffer.from(documento.conteudo).toString("base64");
  if (documento.mimeType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };
  }
  if (documento.mimeType.startsWith("image/")) {
    return { type: "image", source: { type: "base64", media_type: documento.mimeType, data: base64 } };
  }
  // CSV, OFX e outros arquivos de texto exportados pelo banco
  return { type: "text", text: `<arquivo>${textoDoArquivo(documento.conteudo)}</arquivo>` };
}

// Lê um documento e devolve { transacoes, observacao } já validado pelo schema
export async function extrairTransacoes(documento, nomesCategorias, produtosConhecidos = []) {
  if (config.ia.mock) return respostaMock(documento.tipo, documento.texto ?? "");

  const modelo = documento.tipo === "TEXTO" ? config.ia.modeloRapido : config.ia.modeloDocumentos;
  const stream = clienteIa().beta.messages.stream({
    model: modelo,
    max_tokens: 64000,
    ...FALLBACK,
    // O que se repete entre documentos (instruções e produtos já vistos) vem antes e fica no cache;
    // o documento, que muda sempre, vem depois. Ajuda quando vários cupons ou faturas são enviados em seguida.
    system: [
      { type: "text", text: INSTRUCOES, ...CACHE },
      ...(produtosConhecidos.length
        ? [
            {
              type: "text",
              text: `Produtos que este usuário já comprou. Se um item do cupom for um deles, use exatamente o mesmo nome_canonico:\n${produtosConhecidos.join("\n")}`,
              ...CACHE,
            },
          ]
        : []),
    ],
    output_config: {
      effort: documento.tipo === "TEXTO" ? "low" : "medium",
      format: betaZodOutputFormat(esquemaExtracao(nomesCategorias)),
    },
    messages: [
      {
        role: "user",
        content: [
          blocoConteudo(documento),
          {
            type: "text",
            text: `Tipo informado pelo usuário: ${ROTULOS[documento.tipo]}. Data de hoje: ${hojeISO()}.`,
          },
        ],
      },
    ],
  });
  const resposta = await stream.finalMessage();
  await registrarUso(documento.usuarioId, `extrair:${documento.tipo}`, resposta);
  return verificarResposta(resposta);
}

const PALAVRAS_DE_ASSINATURA = /netflix|spotify|disney|prime video|hbo|max|deezer|youtube premium|academia|smart ?fit|aluguel|condom[ií]nio|mensalidade|assinatura/i;

// Usado quando a memória de categorias não conhece o estabelecimento.
// Devolve { categoria, repete } (repete = gasto fixo mensal, como uma assinatura)
export async function sugerirCategoria(usuarioId, descricao, nomesCategorias) {
  if (config.ia.mock) {
    const repete = PALAVRAS_DE_ASSINATURA.test(descricao);
    const padrao = nomesCategorias.includes("Outros") ? "Outros" : nomesCategorias[0];
    return { categoria: repete && nomesCategorias.includes("Assinaturas") ? "Assinaturas" : padrao, repete };
  }

  const resposta = await clienteIa().beta.messages.parse({
    model: config.ia.modeloRapido,
    max_tokens: 2000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(esquemaCategoria(nomesCategorias)) },
    messages: [
      {
        role: "user",
        content: `Em qual categoria de um app brasileiro de controle de gastos entra este lançamento, e ele se repete todo mês? "${descricao}"`,
      },
    ],
  });
  await registrarUso(usuarioId, "categorizar", resposta);
  const { categoria, repete_todo_mes } = verificarResposta(resposta);
  return { categoria: nomesCategorias.includes(categoria) ? categoria : "Outros", repete: Boolean(repete_todo_mes) };
}
