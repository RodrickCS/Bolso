import multer from "multer";
import { ErroHttp } from "../lib/erros.js";

export function tratarErros(erro, _req, res, _next) {
  if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message });
  if (erro instanceof multer.MulterError) {
    const mensagem = erro.code === "LIMIT_FILE_SIZE" ? "Arquivo maior que 10 MB" : erro.message;
    return res.status(400).json({ erro: mensagem });
  }
  if (erro.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido" });
  console.error(erro);
  res.status(500).json({ erro: "Erro interno" });
}
