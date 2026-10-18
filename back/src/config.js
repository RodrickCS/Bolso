import "dotenv/config";

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida (veja .env.example)`);
  return valor;
}

export const config = {
  porta: Number(process.env.PORT ?? 3000),
  jwtSecret: obrigatoria("JWT_SECRET"),
  ia: {
    mock: process.env.IA_MOCK === "true",
    // Leitura de cupons, faturas, extratos e comprovantes
    modeloDocumentos: process.env.IA_MODELO_DOCUMENTOS ?? "claude-opus-5-5",
    // Gastos por texto e categorização (para economizar: claude-haiku-5-5)
    modeloRapido: process.env.IA_MODELO_RAPIDO ?? "claude-opus-5-5",
    // Assistente do chat, que consulta e age nos dados com ferramentas (roda com esforço baixo)
    modeloAssistente: process.env.IA_MODELO_ASSISTENTE ?? "claude-sonnet-5-5",
  },
  processador: {
    intervaloMs: Number(process.env.PROCESSADOR_INTERVALO_MS ?? 5000),
    maxTentativas: 3,
  },
  uploadMaxBytes: 10 * 1024 * 1024,
};
