import { readFileSync } from "node:fs";
import { hojeISO } from "../../servicos/texto.js";

// Com IA_MOCK=true o back-end devolve estas respostas prontas em vez de chamar a API.
// Assim dá para desenvolver as telas sem gastar créditos.
const ARQUIVOS = {
  CUPOM: "cupom.json",
  FATURA: "fatura.json",
  EXTRATO: "fatura.json",
  COMPROVANTE: "texto.json",
  CONTA_CONSUMO: "texto.json",
  TEXTO: "texto.json",
};

export function respostaMock(tipoDocumento) {
  const json = readFileSync(new URL(ARQUIVOS[tipoDocumento], import.meta.url), "utf8");
  return JSON.parse(json.replaceAll("{{HOJE}}", hojeISO()));
}
