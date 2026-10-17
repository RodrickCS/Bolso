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
