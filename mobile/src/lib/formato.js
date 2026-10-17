const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const reais = (valor) =>
  Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dolares = (valor) => `US$ ${Number(valor ?? 0).toFixed(2).replace(".", ",")}`;

export function mesAtual() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

// "2026-10" + 1 -> "2026-11"
export function somarMes(mes, quantidade) {
  const [ano, numero] = mes.split("-").map(Number);
  const data = new Date(ano, numero - 1 + quantidade, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function nomeDoMes(mes) {
  const [ano, numero] = mes.split("-").map(Number);
  return `${MESES[numero - 1]} de ${ano}`;
}

// "2026-10-17T00:00:00.000Z" -> "17/10"
export const diaMes = (dataISO) => `${dataISO.slice(8, 10)}/${dataISO.slice(5, 7)}`;

// "2026-10-17" (ou ISO completo) -> "17/10/2026"
export const dataBR = (iso) => iso.slice(0, 10).split("-").reverse().join("/");

// "17/10/2026" -> "2026-10-17"; null se a data não existe
export function lerDataBR(texto) {
  const partes = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return null;
  const [, dia, mes, ano] = partes.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  return data.toISOString().slice(0, 10);
}

// "1.250,50" -> 1250.5 | "35,90" e "35.90" -> 35.9 | "1.500" -> 1500 | "" -> null | inválido -> NaN
export function lerValorBR(texto) {
  let limpo = texto.replace(/r\$\s*/i, "").trim();
  if (!limpo) return null;
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) limpo = limpo.replace(/\./g, "");
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor > 0 ? valor : NaN;
}

// 95.5 -> "95,50"
export const valorParaCampo = (valor) => (valor ? Number(valor).toFixed(2).replace(".", ",") : "");

export function hojeISO() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// 12 -> "+12,0%" | -3.25 -> "−3,3%" (sinal de menos de verdade, que não some ao lado do número)
export function variacao(percentual) {
  const texto = Math.abs(percentual).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${percentual > 0 ? "+" : percentual < 0 ? "−" : ""}${texto}%`;
}

// "Café" -> "Cafe", para a busca achar com ou sem acento
export const semAcentos = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
