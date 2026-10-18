// NFC-e (cupom fiscal eletrônico): o QR Code do cupom leva à página de consulta da SEFAZ,
// que mostra a loja, a data, o total e todos os itens. São dados oficiais e não custam nada.
import * as cheerio from "cheerio";
import { textoDoArquivo } from "./formatos.js";

// Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda)
export function chaveValida(chave) {
  if (!/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(chave[i]) * peso;
  const resto = soma % 11;
  const digito = resto < 2 ? 0 : 11 - resto;
  return digito === Number(chave[43]);
}

// "http://www.fazenda.sp.gov.br/nfce/qrcode?p=3526...|2|1|1|ABC" -> { url, chave }.
// Também aceita o formato antigo (?chNFe=...&nVersao=100...). Devolve null se não for NFC-e.
export function lerQrCode(conteudo) {
  const texto = String(conteudo ?? "").trim();
  let url;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const chave = decodeURIComponent(url.search).match(/\d{44}/)?.[0];
  // Modelo 65 (posições 21 e 22 da chave) é NFC-e; 55 é a NF-e de empresas
  if (!chave || !chaveValida(chave) || chave.slice(20, 22) !== "65") return null;
  return { url: url.toString(), chave };
}

// Só deixamos o servidor abrir páginas de governo (evita usar a API para acessar qualquer endereço)
export const enderecoDaSefaz = (url) => {
  try {
    const { protocol, hostname } = new URL(url);
    return ["http:", "https:"].includes(protocol) && hostname.toLowerCase().endsWith(".gov.br");
  } catch {
    return false;
  }
};

// Bytes da página -> texto, respeitando o charset que o site declarar
export function decodificarPagina(bytes, tipo = "") {
  const declarado =
    /charset=([\w-]+)/i.exec(tipo)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(Buffer.from(bytes).subarray(0, 2048).toString("latin1"))?.[1];
  if (declarado && /^(iso-8859-1|latin1|windows-1252)$/i.test(declarado)) {
    return new TextDecoder("windows-1252").decode(Buffer.from(bytes));
  }
  return textoDoArquivo(bytes);
}

// "1.234,56" -> 1234.56 | "1,2340" -> 1.234 | "21.9" -> 21.9
function numeroBR(texto) {
  const limpo = String(texto ?? "").replace(/[^\d,.-]/g, "");
  if (!limpo) return null;
  const valor = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(valor) ? valor : null;
}

const espacos = (texto) => texto.replace(/\s+/g, " ").trim();
const depoisDoRotulo = (texto) => espacos(texto.replace(/^[^:]*:/, ""));

// Página no layout usado pela maioria dos estados (SP, RS, PR, BA e outros):
// tabela #tabResult com um item por linha e o resumo em #totalNota.
// Devolve null quando o layout não é esse; aí quem lê é a IA.
export function lerPaginaNfce(html) {
  const $ = cheerio.load(html);
  const itens = $("#tabResult tr")
    .toArray()
    .map((linha) => {
      const $l = $(linha);
      const descricao = espacos($l.find("span.txtTit").first().text());
      const quantidade = numeroBR(depoisDoRotulo($l.find(".Rqtd").text()));
      const unidade = depoisDoRotulo($l.find(".RUN").text()) || null;
      const precoTotal = numeroBR($l.find(".valor").first().text());
      return descricao && precoTotal > 0 ? { descricao, quantidade: quantidade > 0 ? quantidade : 1, unidade, precoTotal } : null;
    })
    .filter(Boolean);
  if (!itens.length) return null;

  // Resumo: "Valor a pagar R$" já desconta os descontos; se não existir, vale o "Valor total R$"
  const resumo = new Map();
  $("#totalNota #linhaTotal, #totalNota .linhaShade").each((_, linha) => {
    const rotulo = espacos($(linha).find("label").first().text()).toLowerCase();
    if (rotulo) resumo.set(rotulo, numeroBR($(linha).find(".totalNumb").last().text()));
  });
  const procurar = (inicio) => [...resumo].find(([rotulo]) => rotulo.startsWith(inicio))?.[1] ?? null;
  const somaItens = Math.round(itens.reduce((soma, i) => soma + i.precoTotal, 0) * 100) / 100;
  const total = procurar("valor a pagar") ?? procurar("valor total") ?? somaItens;

  const textoPagina = espacos($.root().text());
  const emissao = /Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(textoPagina);
  const loja = espacos($("#u20").first().text() || $(".txtTopo").first().text());
  const cnpj = /CNPJ:\s*([\d./-]{14,18})/i.exec(textoPagina)?.[1] ?? null;

  return {
    loja: loja || null,
    cnpj,
    data: emissao ? `${emissao[3]}-${emissao[2]}-${emissao[1]}` : null,
    total,
    itens,
  };
}

// Texto limpo da página (sem scripts e estilos), para a IA ler quando o layout é outro
export function textoDaPagina(html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, head").remove();
  // Espaço depois de cada elemento, para "<td>Arroz</td><td>27,90</td>" não virar "Arroz27,90"
  $("body *").append(" ");
  return espacos($.root().text()).slice(0, 30_000);
}

// A SEFAZ ainda não tem a nota (cupom emitido sem internet) ou pediu captcha
export const paginaSemNota = (texto) =>
  texto.length < 200 || /n[ãa]o (foi )?encontrad|inexistente|n[ãa]o autorizad|captcha|tente novamente/i.test(texto);

// "SUPERMERCADO BOM PRECO LTDA" -> "Supermercado Bom Preco"
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
export function nomeLegivel(texto) {
  return espacos(
    texto
      .replace(/\b(LTDA|EIRELI|EPP|ME|S\/A|S\.A\.?|SA)\b\.?/gi, " ")
      .replace(/[-–,]+\s*$/, ""),
  )
    .toLowerCase()
    .split(" ")
    .map((palavra, i) => (i > 0 && MINUSCULAS.has(palavra) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)))
    .join(" ");
}
