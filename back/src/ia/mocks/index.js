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

// Texto que fala de assinatura devolve um gasto fixo, para testar a repetição mensal
export function respostaMock(tipoDocumento, texto = "") {
  const arquivo = tipoDocumento === "TEXTO" && /netflix|assinatura/i.test(texto) ? "assinatura.json" : ARQUIVOS[tipoDocumento];
  const json = readFileSync(new URL(arquivo, import.meta.url), "utf8");
  return JSON.parse(json.replaceAll("{{HOJE}}", hojeISO()));
}
