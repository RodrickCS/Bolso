// Funções puras de texto, sem banco e sem IA, fáceis de testar.

// "1.500,50" -> 1500.5 | "35,90" -> 35.9 | "35.90" -> 35.9 | "1.500" -> 1500
export function converterValorBR(texto) {
  let limpo = texto.replace(/r\$\s*/i, "").trim();
  if (limpo.includes(",")) {
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    limpo = limpo.replace(/\./g, "");
  }
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

export function semAcentos(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Chave usada na memória de categorias. Os bancos escrevem o mesmo lugar de jeitos
// diferentes ("UBER *TRIP 0412", "Uber Trip"), então ficamos só com as duas
// primeiras palavras sem números.
export function normalizarEstabelecimento(texto) {
  if (!texto) return null;
  const palavras = semAcentos(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length >= 2 && !/\d/.test(p));
  return palavras.length ? palavras.slice(0, 2).join(" ") : null;
}

export function hojeISO(agora = new Date()) {
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function somarDias(dataISO, dias) {
  const data = new Date(`${dataISO}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

const VALOR = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|conto|pila))?/gi;
const RECEITA = /\b(recebi|ganhei|entrou|caiu|salario|pagamento recebido)\b/;
const DESPESA = /\b(gastei|paguei|comprei|torrei|foi|deu)\b/;
const COMPLICADO = /\b(parcela|parcelad|vezes|anteontem|semana|mes passado|dia \d)\b|\d+\s*x\b|\//;

// Tenta entender frases simples como "gastei 35 no uber" ou "recebi 1500 de salário"
// sem gastar créditos. Devolve null quando a frase é ambígua; aí quem decide é a IA.
export function interpretarTextoLocal(frase, hoje = hojeISO()) {
  const original = frase.normalize("NFC").trim();
  // Mesmo comprimento do original, então os índices servem para recortar a descrição com acentos
  const texto = semAcentos(original.toLowerCase());
  if (texto.length !== original.length) return null;
  if (COMPLICADO.test(texto)) return null;

  const valores = [...texto.matchAll(VALOR)];
  if (valores.length !== 1) return null;
  const valor = converterValorBR(valores[0][1]);
  if (!valor || valor <= 0) return null;

  const ehReceita = RECEITA.test(texto);
  if (!ehReceita && !DESPESA.test(texto)) return null;

  const inicioResto = valores[0].index + valores[0][0].length;
  const lugar = texto
    .slice(inicioResto)
    .match(/\b(?:no|na|nos|nas|em|com|de|do|da|pro|pra|para|pelo|pela)\s+(.+?)\s*(?:\b(?:ontem|hoje)\b)?\s*$/d);
  if (!lugar) return null;
  const [inicio, fim] = lugar.indices[1].map((i) => i + inicioResto);
  const descricao = original.slice(inicio, fim).replace(/\b(ontem|hoje)\b/gi, "").trim();
  if (!descricao) return null;

  return {
    valor,
    descricao: descricao.charAt(0).toUpperCase() + descricao.slice(1),
    tipo: ehReceita ? "RECEITA" : "DESPESA",
    data: /\bontem\b/.test(texto) ? somarDias(hoje, -1) : hoje,
  };
}
