import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/prisma.js";
import { iniciarProcessador } from "./servicos/processador.js";

// Testa o banco antes de abrir a porta, para um erro de conexão aparecer claro no terminal
try {
  await prisma.$queryRaw`SELECT 1`;
} catch (erro) {
  console.error("\nNão consegui conectar ao banco de dados. Confira DATABASE_URL e DIRECT_URL no back/.env.");
  console.error(`Detalhe: ${erro.message.trim().split("\n").pop()}\n`);
  process.exit(1);
}

app.listen(config.porta, () => {
  console.log(`Bolso API em http://localhost:${config.porta}${config.ia.mock ? " (IA em modo mock)" : ""}`);
});
iniciarProcessador();
