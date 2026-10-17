// Endereço do back-end. Em desenvolvimento no celular, use o IP do computador na rede
// (ex: http://192.168.0.10:3000), não "localhost". Configure em mobile/.env.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

let token = null;
let aoExpirar = () => {};

export function configurarSessao(novoToken, callbackExpirou) {
  token = novoToken;
  if (callbackExpirou) aoExpirar = callbackExpirou;
}

async function requisicao(caminho, { metodo = "GET", corpo, limiteMs = 15_000 } = {}) {
  // Sem limite de tempo, um servidor inalcançável deixa o app carregando para sempre
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), limiteMs);
  let resposta;
  try {
    resposta = await fetch(API_URL + caminho, {
      method: metodo,
      headers: {
        ...(token && { authorization: `Bearer ${token}` }),
        ...(corpo && { "content-type": "application/json" }),
      },
      body: corpo && JSON.stringify(corpo),
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
  // arquivo: { base64, nome, mimeType }. Vai dentro de um JSON, o mesmo caminho das outras requisições.
  enviarArquivo: (arquivo, tipo) =>
    requisicao("/documentos", { metodo: "POST", corpo: { arquivo, tipo }, limiteMs: 90_000 }),
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
