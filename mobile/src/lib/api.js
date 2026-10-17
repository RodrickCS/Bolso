// Usa o fetch nativo do React Native: no FormData ele aceita arquivos no formato
// { uri, name, type }, o jeito mais testado de enviar arquivos no Android e no iOS.

// Endereço do back-end. Em desenvolvimento no celular, use o IP do computador na rede
// (ex: http://192.168.0.10:3000), não "localhost". Configure em mobile/.env.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

let token = null;
let aoExpirar = () => {};

export function configurarSessao(novoToken, callbackExpirou) {
  token = novoToken;
  if (callbackExpirou) aoExpirar = callbackExpirou;
}

async function requisicao(caminho, { metodo = "GET", corpo, formulario } = {}) {
  // Sem limite de tempo, um servidor inalcançável deixa o app carregando para sempre
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), formulario ? 60_000 : 15_000);
  let resposta;
  try {
    resposta = await fetch(API_URL + caminho, {
      method: metodo,
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(corpo && { "content-type": "application/json" }),
      },
      body: formulario ?? (corpo && JSON.stringify(corpo)),
      signal: controle.signal,
    });
  } catch (erro) {
    if (controle.signal.aborted) throw new Error("O servidor demorou demais para responder. Tente de novo.");
    throw new Error(
      `Não consegui falar com o servidor em ${API_URL} (${erro.message}). Confira o endereço e se o celular está no mesmo Wi-Fi do computador.`,
    );
  } finally {
    clearTimeout(limite);
  }

  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && token) aoExpirar();
  if (!resposta.ok) throw new Error(dados.erro ?? `Erro ${resposta.status}`);
  return dados;
}

const EXTENSOES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "application/x-ofx": "ofx",
};

// Nomes com acentos ou espaços ("Fatura Março.pdf") podem quebrar o envio; o servidor só usa a extensão
function nomeSeguro({ nome, mimeType }) {
  const extensao = nome?.includes(".") ? nome.split(".").pop().toLowerCase() : EXTENSOES[mimeType] ?? "bin";
  return `arquivo.${extensao.replace(/[^a-z0-9]/g, "")}`;
}

export const api = {
  entrar: (email, senha) => requisicao("/auth/entrar", { metodo: "POST", corpo: { email, senha } }),
  registrar: (nome, email, senha) =>
    requisicao("/auth/registrar", { metodo: "POST", corpo: { nome, email, senha } }),

  painel: (mes) => requisicao(`/painel?mes=${mes}`),
  usoIa: (mes) => requisicao(`/uso-ia?mes=${mes}`),
  categorias: () => requisicao("/categorias"),

  transacoes: (mes) => requisicao(`/transacoes?mes=${mes}`),
  editarTransacao: (id, dados) => requisicao(`/transacoes/${id}`, { metodo: "PATCH", corpo: dados }),
  apagarTransacao: (id) => requisicao(`/transacoes/${id}`, { metodo: "DELETE" }),

  documentos: () => requisicao("/documentos"),
  documento: (id) => requisicao(`/documentos/${id}`),
  enviarTexto: (texto) => requisicao("/documentos", { metodo: "POST", corpo: { texto } }),
  // arquivo: { uri, nome, mimeType } vindo da câmera, da galeria ou do seletor de documentos
  enviarArquivo: (arquivo, tipo) => {
    const formulario = new FormData();
    formulario.append("arquivo", { uri: arquivo.uri, name: nomeSeguro(arquivo), type: arquivo.mimeType });
    if (tipo) formulario.append("tipo", tipo);
    return requisicao("/documentos", { metodo: "POST", formulario });
  },
};

// Consulta o documento até a IA terminar de ler (ou desistir depois de ~2 minutos)
export async function aguardarDocumento(id, { intervaloMs = 2000, tentativas = 60 } = {}) {
  for (let i = 0; i < tentativas; i++) {
    const documento = await api.documento(id);
    if (documento.status === "PRONTO" || documento.status === "ERRO") return documento;
    await new Promise((resolver) => setTimeout(resolver, intervaloMs));
  }
  throw new Error("A leitura está demorando. Confira daqui a pouco na lista de envios.");
}
