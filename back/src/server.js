import { app } from "./app.js";
import { config } from "./config.js";
import { iniciarProcessador } from "./servicos/processador.js";

app.listen(config.porta, () => {
  console.log(`Bolso API em http://localhost:${config.porta}${config.ia.mock ? " (IA em modo mock)" : ""}`);
});
iniciarProcessador();
