import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirConciliacao, ehReenvio } from "../src/servicos/conciliacao.js";

const transacao = (dados) => ({
  tipo: "DESPESA",
  conciliadaComId: null,
  documentoId: 1,
  descricao: "Mercado",
  ...dados,
  data: new Date(`${dados.data}T00:00:00Z`),
});

test("cupom chegando depois da fatura vira a duplicata", () => {
  const fatura = transacao({ id: 1, origem: "FATURA", valor: "87.40", data: "2026-10-10" });
  const cupom = transacao({ id: 2, origem: "CUPOM", valor: 87.4, data: "2026-10-09" });
  assert.deepEqual(decidirConciliacao(cupom, [fatura]), { duplicataId: 2, oficialId: 1 });
});

test("fatura chegando depois do cupom vira a oficial", () => {
  const cupom = transacao({ id: 1, origem: "CUPOM", valor: 87.4, data: "2026-10-09" });
  const fatura = transacao({ id: 2, origem: "FATURA", valor: 87.4, data: "2026-10-10" });
  assert.deepEqual(decidirConciliacao(fatura, [cupom]), { duplicataId: 1, oficialId: 2 });
});

test("escolhe a data mais próxima quando há mais de uma candidata", () => {
  const longe = transacao({ id: 1, origem: "TEXTO", valor: 20, data: "2026-10-07" });
  const perto = transacao({ id: 2, origem: "TEXTO", valor: 20, data: "2026-10-10" });
  const fatura = transacao({ id: 3, origem: "FATURA", valor: 20, data: "2026-10-10" });
  assert.deepEqual(decidirConciliacao(fatura, [longe, perto]), { duplicataId: 2, oficialId: 3 });
});

test("não junta valores diferentes, datas distantes, nem duas do mesmo lado", () => {
  const fatura = transacao({ id: 1, origem: "FATURA", valor: 50, data: "2026-10-10" });
  assert.equal(decidirConciliacao(transacao({ id: 2, origem: "CUPOM", valor: 50.01, data: "2026-10-10" }), [fatura]), null);
  assert.equal(decidirConciliacao(transacao({ id: 3, origem: "CUPOM", valor: 50, data: "2026-10-20" }), [fatura]), null);
  assert.equal(decidirConciliacao(transacao({ id: 4, origem: "EXTRATO", valor: 50, data: "2026-10-10" }), [fatura]), null);
  const jaConciliada = transacao({ id: 5, origem: "CUPOM", valor: 50, data: "2026-10-10", conciliadaComId: 9 });
  assert.equal(decidirConciliacao(fatura, [jaConciliada]), null);
});

test("detecta a mesma linha de fatura enviada de novo em outro arquivo", () => {
  const antiga = transacao({ id: 1, origem: "FATURA", valor: 44.9, data: "2026-10-10", descricao: "Netflix", documentoId: 1 });
  const nova = transacao({ origem: "FATURA", valor: 44.9, data: "2026-10-10", descricao: "NETFLIX", documentoId: 2 });
  assert.equal(ehReenvio(nova, [antiga]), true);
  assert.equal(ehReenvio({ ...nova, documentoId: 1 }, [antiga]), false);
});
