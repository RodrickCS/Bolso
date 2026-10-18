import { test } from "node:test";
import assert from "node:assert/strict";
import { montarResposta } from "../src/servicos/perguntas.js";

const d = (texto) => new Date(`${texto}T00:00:00Z`);
const lanc = (data, valor, descricao, categoria, estabelecimento = null) => ({ data: d(data), valor, descricao, categoria, estabelecimento });
const lista = [
  lanc("2026-08-03", 23.15, "Uber", "Transporte", "UBER *TRIP"),
  lanc("2026-09-10", 31.4, "Uber", "Transporte", "UBER *TRIP"),
  lanc("2026-09-12", 412.3, "Atacadão", "Mercado", "ATACADAO CENTRO"),
  lanc("2026-10-02", 87.4, "Supermercado Bom Preço", "Mercado", "SUPERMERCADO BOM PRECO"),
  lanc("2026-10-05", 18.9, "Uber", "Transporte", "UBER *TRIP"),
];
const filtros = (extra) => ({ intencao: "total", tipo: "DESPESA", categorias: [], busca: null, ...extra });
const hoje = "2026-10-18";
const resposta = (extra, itens, inicio, fim) => montarResposta(filtros(extra), itens, { inicio: d(inicio), fim: d(fim), hoje });

test("total com busca e média por dia", () => {
  const uber = lista.filter((t) => t.descricao === "Uber");
  const r = resposta({ busca: "uber" }, uber, "2026-08-01", "2026-10-18");
  assert.equal(r.resposta, 'Você gastou R$ 73,45 com "uber" de 01/08 a 18/10, em 3 lançamentos. Dá uma média de R$ 0,93 por dia.');
  assert.deepEqual(r.linhas.map((l) => l.valor), [31.4, 23.15, 18.9]);
});

test("mês com mais gasto numa categoria", () => {
  const mercado = lista.filter((t) => t.categoria === "Mercado");
  const r = resposta({ intencao: "por_mes", categorias: ["Mercado"] }, mercado, "2026-05-01", "2026-10-18");
  assert.equal(r.resposta, "O mês em que você mais gastou com Mercado foi setembro: R$ 412,30.");
  assert.deepEqual(r.linhas.map((l) => [l.rotulo, l.valor]), [["Setembro", 412.3], ["Outubro", 87.4]]);
});

test("por categoria e por estabelecimento, com o período escrito do jeito certo", () => {
  const outubro = lista.filter((t) => t.data >= d("2026-10-01"));
  assert.equal(
    resposta({ intencao: "por_categoria" }, outubro, "2026-10-01", "2026-10-18").resposta,
    "Este mês, o que mais pesou foi Mercado: R$ 87,40, 82% dos R$ 106,30 gastos.",
  );
  const setembro = lista.filter((t) => t.data.getUTCMonth() === 8);
  assert.equal(
    resposta({ intencao: "por_estabelecimento" }, setembro, "2026-09-01", "2026-09-30").resposta,
    "Em setembro, onde você mais gastou foi ATACADAO CENTRO: R$ 412,30 em 1 compra.",
  );
});

test("sem lançamentos e entradas", () => {
  assert.equal(resposta({ categorias: ["Pets"] }, [], "2026-10-18", "2026-10-18").resposta, "Não achei gastos com Pets em 18/10.");
  const salario = [lanc("2026-10-05", 4500, "Salário", "Salário")];
  assert.equal(
    resposta({ tipo: "RECEITA" }, salario, "2026-10-01", "2026-10-18").resposta,
    "Você recebeu R$ 4.500,00 este mês, em 1 lançamento.",
  );
});
