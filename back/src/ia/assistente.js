import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.js";
import { FALLBACK, clienteIa, registrarUso, verificarResposta } from "./cliente.js";

const INSTRUCOES = `Você é o assistente financeiro do Bolso, um app brasileiro de controle de gastos.
Recebe fatos já calculados sobre os gastos do usuário e escreve de 2 a 4 dicas curtas.

Regras:
- Use só os números dos fatos. Nunca invente valores, datas ou estabelecimentos.
- Cada dica com no máximo 2 frases, em português do Brasil, tom amigável e direto, sem julgar.
- Comece pelo que é mais urgente (orçamento estourado, gasto fora do padrão).
- Quando fizer sentido, sugira uma ação prática e simples.`;

const esquema = z.object({ dicas: z.array(z.string()) });

// Transforma os fatos em dicas. Devolve null no modo mock: quem chama usa os textos dos fatos.
export async function escreverDicas(usuarioId, fatos) {
  if (config.ia.mock) return null;

  const resposta = await clienteIa().beta.messages.parse({
    model: config.ia.modeloRapido,
    max_tokens: 4000,
    ...FALLBACK,
    system: INSTRUCOES,
    output_config: { effort: "low", format: betaZodOutputFormat(esquema) },
    messages: [{ role: "user", content: fatos.map((f) => `- ${f.texto}`).join("\n") }],
  });
  await registrarUso(usuarioId, "assistente", resposta);
  return verificarResposta(resposta)
    .dicas.map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 4);
}
