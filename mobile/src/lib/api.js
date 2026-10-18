// Endereço do back-end. Em desenvolvimento no celular, use o IP do computador na rede
// (ex: http://192.168.0.10:3000), não "localhost". Configure em mobile/.env.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

let token = null;
let aoExpirar = () => {};

export function configurarSessao(novoToken, callbackExpirou) {
  token = novoToken;
  if (callbackExpirou) aoExpirar = callbackExpirou;
}

async function requisicao(caminho, { metodo = "GET", corpo, limiteMs = 75_000, comoTexto = false } = {}) {
  // Sem limite de tempo, um servidor inalcançável deixa o app carregando para sempre.
  // O limite é folgado porque no plano grátis do Render o servidor leva até ~1 minuto para acordar.
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
    if (controle.signal.aborted) {
      throw new Error("O servidor demorou demais para responder. Se ele estava dormindo, tente de novo em alguns segundos.");
    }
    throw new Error(
      `Não consegui falar com o servidor em ${API_URL} (${erro.message}). Confira o endereço e se o celular está no mesmo Wi-Fi do computador.`,
    );
  } finally {
    clearTimeout(limite);
  }

  if (resposta.status === 204) return null;
  if (comoTexto && resposta.ok) return resposta.text();
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
  assistente: (mes) => requisicao(`/assistente?mes=${mes}`),
  assinaturas: (mes) => requisicao(`/assinaturas?mes=${mes}`),
  orcamentos: (mes) => requisicao(`/orcamentos?mes=${mes}`),
  salvarOrcamento: (categoriaId, valorMensal) =>
    requisicao(`/orcamentos/${categoriaId}`, { metodo: "PUT", corpo: { valorMensal } }),
  apagarOrcamento: (categoriaId) => requisicao(`/orcamentos/${categoriaId}`, { metodo: "DELETE" }),

  contas: () => requisicao("/contas"),
  criarConta: (dados) => requisicao("/contas", { metodo: "POST", corpo: dados }),
  editarConta: (id, dados) => requisicao(`/contas/${id}`, { metodo: "PATCH", corpo: dados }),
  apagarConta: (id) => requisicao(`/contas/${id}`, { metodo: "DELETE" }),

  transacoes: (mes) => requisicao(`/transacoes?mes=${mes}`),
  transacao: (id) => requisicao(`/transacoes/${id}`),
  criarTransacao: (dados) => requisicao("/transacoes", { metodo: "POST", corpo: dados }),
  editarTransacao: (id, dados) => requisicao(`/transacoes/${id}`, { metodo: "PATCH", corpo: dados }),
  apagarTransacao: (id) => requisicao(`/transacoes/${id}`, { metodo: "DELETE" }),

  documentos: () => requisicao("/documentos"),
  documento: (id) => requisicao(`/documentos/${id}`),
  apagarDocumento: (id, comLancamentos) =>
    requisicao(`/documentos/${id}${comLancamentos ? "?transacoes=true" : ""}`, { metodo: "DELETE" }),
  enviarTexto: (texto, contaId) => requisicao("/documentos", { metodo: "POST", corpo: { texto, contaId } }),
  // arquivo: { base64, nome, mimeType }. Vai dentro de um JSON, o mesmo caminho das outras requisições.
  enviarArquivo: (arquivo, tipo, contaId) =>
    requisicao("/documentos", { metodo: "POST", corpo: { arquivo, tipo, contaId }, limiteMs: 120_000 }),

  // qrcode: o link lido do cupom; pagina: { base64, tipo } da página da SEFAZ aberta pelo celular (ou null)
  enviarNfce: (qrcode, pagina, contaId) =>
    requisicao("/documentos/nfce", { metodo: "POST", corpo: { qrcode, pagina: pagina ?? undefined, contaId }, limiteMs: 90_000 }),

  produtos: () => requisicao("/produtos"),
  produto: (id) => requisicao(`/produtos/${id}`),
  renomearProduto: (id, nome) => requisicao(`/produtos/${id}`, { metodo: "PATCH", corpo: { nome } }),
  juntarProduto: (id, produtoId) => requisicao(`/produtos/${id}/juntar`, { metodo: "POST", corpo: { produtoId } }),

  exportarCsv: () => requisicao("/exportar", { comoTexto: true }),
  excluirMinhaConta: (senha) => requisicao("/minha-conta", { metodo: "DELETE", corpo: { senha } }),
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
