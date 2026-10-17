export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

// Express 4 não captura erros de handlers async sozinho
export const assincrono = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// Valida req.body/req.query com um schema Zod e devolve 400 com a mensagem do primeiro erro
export function validar(schema, dados) {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    const campo = problema.path.join(".");
    throw new ErroHttp(400, campo ? `${campo}: ${problema.message}` : problema.message);
  }
  return resultado.data;
}
