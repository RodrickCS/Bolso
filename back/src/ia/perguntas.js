import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.js";
import { semAcentos } from "../servicos/texto.js";
import { CACHE, FALLBACK, clienteIa, registrarUso, verificarResposta } from "./cliente.js";

const INSTRUCOES = `Você traduz perguntas sobre gastos pessoais em filtros de busca para o Bolso, um app brasileiro de controle de gastos.
Você NÃO responde a pergunta nem vê os lançamentos: só preenche os filtros. O app faz as contas.

Tipos de resposta (intencao):
- "total": quanto gastou ou recebeu ("quanto gastei com uber?")
- "por_categoria": divisão por categoria ("com o que mais gastei?")
- "por_mes": comparação entre meses ("qual mês gastei mais com mercado?")
- "por_estabelecimento": onde gastou ("onde mais gastei?", "em qual loja?")
- "maiores": maiores gastos individuais
- "lista": quais lançamentos ("quais foram meus gastos com farmácia?")
- "outra": qualquer coisa que não dá para responder só com os lançamentos (investimentos, conselhos, outros assuntos)

Datas: use a data de hoje informada. "Este mês" vai do dia 1 até hoje; "em setembro" é o mês inteiro mais recente
com esse nome que já começou; "desde agosto" vai de 1º de agosto até hoje; "este ano" de 1º de janeiro até hoje.
Sem período na pergunta, deixe inicio e fim nulos.
Categoria só quando a pergunta fala de uma das categorias da lista (ou de algo claramente dentro dela, como "comida fora" ->
"Restaurantes e delivery"). Loja, app ou palavra específica ("uber", "ifood", "netflix") vai em "busca", não em categoria.`;

const esquema = (nomesCategorias) =>
  z.object({
    intencao: z.string().describe("total, por_categoria, por_mes, por_estabelecimento, maiores, lista ou outra"),
    tipo: z.string().describe('"DESPESA" (padrão) ou "RECEITA" quando a pergunta é sobre o que recebeu ou entrou'),
    inicio: z.string().nullable().describe("AAAA-MM-DD ou null"),
    fim: z.string().nullable().describe("AAAA-MM-DD, inclusive, ou null"),
    categorias: z.array(z.string()).describe(`Nomes exatos, só destes: ${nomesCategorias.join(", ")}. Lista vazia se nenhuma.`),
    busca: z.string().nullable().describe("Loja ou palavra para procurar na descrição dos lançamentos, ou null"),
  });

// Modo mock: entende o básico sem IA, para desenvolver e testar sem gastar créditos
function interpretarLocal(pergunta, nomesCategorias) {
  const texto = semAcentos(pergunta.toLowerCase());
  const intencao = /qual mes|que mes|por mes|cada mes/.test(texto)
    ? "por_mes"
    : /\bonde\b|qual loja|em que loja/.test(texto)
      ? "por_estabelecimento"
      : /maiores|mais caro/.test(texto)
        ? "maiores"
        : /categoria|com o que/.test(texto)
          ? "por_categoria"
          : "total";
  return {
    intencao,
    tipo: /receb|entrou|ganhei/.test(texto) ? "RECEITA" : "DESPESA",
    inicio: null,
    fim: null,
    categorias: nomesCategorias.filter((nome) => texto.includes(semAcentos(nome.toLowerCase()))),
    busca: null,
  };
}

export async function interpretarPergunta(usuarioId, pergunta, { hoje, nomesCategorias }) {
  if (config.ia.mock) return interpretarLocal(pergunta, nomesCategorias);

  const resposta = await clienteIa().beta.messages.parse({
    model: config.ia.modeloRapido,
    max_tokens: 2000,
    ...FALLBACK,
    // Numa conversa as perguntas vêm em seguida: as instruções ficam no cache e só a pergunta é nova
    system: [{ type: "text", text: INSTRUCOES, ...CACHE }],
    output_config: { effort: "low", format: betaZodOutputFormat(esquema(nomesCategorias)) },
    messages: [{ role: "user", content: `Hoje é ${hoje}.\n\nPergunta: ${pergunta}` }],
  });
  await registrarUso(usuarioId, "pergunta", resposta);
  return verificarResposta(resposta);
}
