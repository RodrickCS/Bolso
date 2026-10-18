// Formatos que a API do Claude lê direto, mais os arquivos de texto que os bancos exportam
export const IMAGENS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const TEXTOS = new Set(["text/csv", "text/plain", "application/x-ofx", "application/ofx", "text/x-ofx"]);

// O tipo que o celular informa não é confiável: no Android um CSV chega como "text/comma-separated-values",
// "application/vnd.ms-excel" ou sem tipo, e um OFX com qualquer nome. Vale o conteúdo, depois a extensão.
const POR_EXTENSAO = {
  ofx: "application/x-ofx",
  qfx: "application/x-ofx",
  csv: "text/csv",
  txt: "text/plain",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function detectarFormato(conteudo, mimeType, nome = "") {
  const inicio = conteudo.subarray(0, 4096);
  if (inicio.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (inicio[0] === 0xff && inicio[1] === 0xd8 && inicio[2] === 0xff) return "image/jpeg";
  if (inicio.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (inicio.subarray(0, 4).toString("latin1") === "RIFF" && inicio.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";

  const texto = inicio.toString("latin1");
  const ehTexto = !inicio.includes(0);
  if (ehTexto && /OFXHEADER|<OFX>/i.test(texto)) return "application/x-ofx";

  const extensao = nome.includes(".") ? nome.split(".").pop().toLowerCase() : "";
  const porExtensao = POR_EXTENSAO[extensao];
  if (porExtensao && (ehTexto || !TEXTOS.has(porExtensao))) return porExtensao;
  if (IMAGENS.has(mimeType) || mimeType === "application/pdf") return mimeType;
  // Arquivo de texto com cara de planilha (linhas com ; ou ,), mesmo sem extensão
  if (ehTexto && texto.split(/\r?\n/).filter((linha) => /[;,\t]/.test(linha)).length >= 2) return "text/csv";
  if (ehTexto && TEXTOS.has(mimeType)) return mimeType;
  return mimeType || "application/octet-stream";
}

// Muitos bancos (e sites da SEFAZ) ainda usam Latin-1 (Windows-1252): se não for UTF-8 válido, lê nessa codificação
export function textoDoArquivo(conteudo) {
  const bytes = Buffer.from(conteudo);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
