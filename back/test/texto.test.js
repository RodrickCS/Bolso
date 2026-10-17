import { test } from "node:test";
import assert from "node:assert/strict";
import { converterValorBR, interpretarTextoLocal, normalizarEstabelecimento } from "../src/servicos/texto.js";

test("converterValorBR entende os formatos brasileiros", () => {
  assert.equal(converterValorBR("35"), 35);
  assert.equal(converterValorBR("35,90"), 35.9);
  assert.equal(converterValorBR("35.90"), 35.9);
  assert.equal(converterValorBR("1.500"), 1500);
  assert.equal(converterValorBR("1.500,50"), 1500.5);
  assert.equal(converterValorBR("R$ 12,00"), 12);
});

test("normalizarEstabelecimento junta jeitos diferentes de escrever o mesmo lugar", () => {
  assert.equal(normalizarEstabelecimento("UBER *TRIP 0412"), "UBER TRIP");
  assert.equal(normalizarEstabelecimento("Uber Trip"), "UBER TRIP");
  assert.equal(normalizarEstabelecimento("Padaria São João Ltda"), "PADARIA SAO");
  assert.equal(normalizarEstabelecimento("1234 *"), null);
  assert.equal(normalizarEstabelecimento(null), null);
});

test("interpretarTextoLocal entende frases simples", () => {
  assert.deepEqual(interpretarTextoLocal("gastei 35 no uber", "2026-10-17"), {
    valor: 35, descricao: "Uber", tipo: "DESPESA", data: "2026-10-17",
  });
  assert.deepEqual(interpretarTextoLocal("Paguei R$ 12,50 na padaria ontem", "2026-10-17"), {
    valor: 12.5, descricao: "Padaria", tipo: "DESPESA", data: "2026-10-16",
  });
  assert.deepEqual(interpretarTextoLocal("recebi 1.500 de salário", "2026-10-17"), {
    valor: 1500, descricao: "Salário", tipo: "RECEITA", data: "2026-10-17",
  });
});

test("interpretarTextoLocal devolve null quando a frase precisa da IA", () => {
  assert.equal(interpretarTextoLocal("comprei uma tv em 10x de 200", "2026-10-17"), null);
  assert.equal(interpretarTextoLocal("gastei 20 no mercado e 15 na farmácia", "2026-10-17"), null);
  assert.equal(interpretarTextoLocal("uber 35", "2026-10-17"), null);
  assert.equal(interpretarTextoLocal("gastei 50 semana passada no bar", "2026-10-17"), null);
});
