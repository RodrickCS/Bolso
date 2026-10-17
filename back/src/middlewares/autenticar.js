import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { ErroHttp } from "../lib/erros.js";

export function gerarToken(usuario) {
  return jwt.sign({ sub: usuario.id }, config.jwtSecret, { expiresIn: "30d" });
}

export function autenticar(req, _res, next) {
  const [esquema, token] = (req.headers.authorization ?? "").split(" ");
  if (esquema !== "Bearer" || !token) return next(new ErroHttp(401, "Faça login para continuar"));
  try {
    req.usuarioId = Number(jwt.verify(token, config.jwtSecret).sub);
    next();
  } catch {
    next(new ErroHttp(401, "Sessão expirada, faça login de novo"));
  }
}
