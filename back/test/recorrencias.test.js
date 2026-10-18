import { test } from "node:test";
import assert from "node:assert/strict";
import { dataNoMes, mesmaLoja, proximaOcorrencia, proximoVencimento, substituiAutomatico } from "../src/servicos/recorrencias.js";

const d = (texto) => new Date(`${texto}T00:00:00Z`);
const iso = (data) => data.toISOString().slice(0, 10);

test("vencimento no dia certo, sem passar do fim do mês", () => {
  assert.equal(iso(dataNoMes(2026, 1, 31)), "2026-02-28");
  assert.equal(iso(proximaOcorrencia(d("2026-01-31"), 31)), "2026-02-28");
  assert.equal(iso(proximaOcorrencia(d("2026-02-28"), 31)), "2026-03-31", "volta ao dia 31 no mês seguinte");
  assert.equal(iso(proximaOcorrencia(d("2026-12-05"), 5)), "2027-01-05");
  assert.equal(iso(proximoVencimento(5, new Date(2026, 9, 18))), "2026-11-05");
  assert.equal(iso(proximoVencimento(25, new Date(2026, 9, 18))), "2026-10-25");
});

test("mesma loja: um nome é o começo do outro", () => {
  const t = (descricao, estabelecimento = null) => ({ descricao, estabelecimento });
  assert.equal(mesmaLoja(t("Netflix"), t("Netflix", "NETFLIX.COM")), true);
  assert.equal(mesmaLoja(t("Spotify"), t("SPOTIFY BRASIL")), true);
  assert.equal(mesmaLoja(t("Netflix"), t("Spotify")), false);
  assert.equal(mesmaLoja(t("Smart Fit"), t("Smart Burger")), false);
});

test("a cobrança de verdade substitui o automático, mesmo com reajuste", () => {
  const automatico = { tipo: "DESPESA", data: d("2026-10-05"), valor: 44.9, descricao: "Netflix", estabelecimento: null };
  const linha = (data, valor, descricao = "NETFLIX.COM") => ({ tipo: "DESPESA", data: d(data), valor, descricao, estabelecimento: descricao });
  assert.equal(substituiAutomatico(automatico, linha("2026-10-05", 44.9)), true);
  assert.equal(substituiAutomatico(automatico, linha("2026-10-08", 49.9)), true, "reajuste de 11% e 3 dias depois");
  assert.equal(substituiAutomatico(automatico, linha("2026-10-15", 44.9)), false, "longe demais na data");
  assert.equal(substituiAutomatico(automatico, linha("2026-10-05", 89.8)), false, "valor muito diferente");
  assert.equal(substituiAutomatico(automatico, linha("2026-10-05", 44.9, "SPOTIFY")), false, "outra loja");
});
