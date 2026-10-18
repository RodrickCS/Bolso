import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../lib/prisma.js";

// Lê ANTHROPIC_API_KEY do ambiente. Só é criado se a IA não estiver em modo mock.
let cliente;
export function clienteIa() {
  cliente ??= new Anthropic();
  return cliente;
}

// US$ por milhão de tokens: entrada, saída e leitura do cache. Atualize se os preços mudarem.
// Gravar no cache (5 minutos) custa 1,25x a entrada; ler custa bem menos que a entrada normal.
const PRECOS = {
  "claude-opus-5-5": { entrada: 4, saida: 20, leituraCache: 0.2 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, leituraCache: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, leituraCache: 0.01 },
};

export function calcularCustoUsd(modelo, usage) {
  const preco = PRECOS[modelo] ?? { entrada: 0, saida: 0, leituraCache: 0 };
  const gravados = usage.cache_creation_input_tokens ?? 0;
  const lidos = usage.cache_read_input_tokens ?? 0;
  return {
    tokensEntrada: usage.input_tokens + gravados + lidos,
    tokensSaida: usage.output_tokens,
    custoUsd:
      (usage.input_tokens * preco.entrada +
        gravados * preco.entrada * 1.25 +
        lidos * preco.leituraCache +
        usage.output_tokens * preco.saida) /
      1_000_000,
  };
}

// Marca o fim de um bloco que se repete entre chamadas: por 5 minutos, a próxima chamada com o
// mesmo começo lê esse trecho do cache, bem mais barato. Abaixo do tamanho mínimo, a API só ignora.
export const CACHE = { cache_control: { type: "ephemeral" } };

export async function registrarUso(usuarioId, tarefa, resposta) {
  const custo = resposta.usage
    ? calcularCustoUsd(resposta.model, resposta.usage)
    : { tokensEntrada: 0, tokensSaida: 0, custoUsd: 0 };
  await prisma.usoIa.create({ data: { usuarioId, tarefa, modelo: resposta.model, ...custo } });
}

export class ErroIa extends Error {
  constructor(mensagem, { podeTentarDeNovo = false } = {}) {
    super(mensagem);
    this.podeTentarDeNovo = podeTentarDeNovo;
  }
}

// Erros temporários (limite de requisições, instabilidade, rede) valem nova tentativa
export function ehErroTemporario(erro) {
  if (erro instanceof ErroIa) return erro.podeTentarDeNovo;
  if (erro instanceof Anthropic.APIConnectionError) return true;
  if (erro instanceof Anthropic.APIError) return erro.status === 429 || erro.status >= 500;
  return false;
}

export function verificarResposta(resposta) {
  if (resposta.stop_reason === "refusal") throw new ErroIa("A IA não processou este conteúdo");
  if (resposta.stop_reason === "max_tokens") throw new ErroIa("Documento grande demais para ler de uma vez");
  if (!resposta.parsed_output) throw new ErroIa("Não foi possível entender a resposta da IA", { podeTentarDeNovo: true });
  return resposta.parsed_output;
}

// Se o modelo recusar uma requisição, a API tenta de novo em outro modelo automaticamente
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
