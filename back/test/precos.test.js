import { test } from "node:test";
import assert from "node:assert/strict";
import { detalharProduto, fatosDePrecos, inflacaoPessoal, precoUnitario, resumirProdutos } from "../src/servicos/precos.js";

const compra = (produtoId, produto, data, estabelecimento, precoTotal, quantidade = 1) => ({
  produtoId,
  produto,
  data: new Date(`${data}T00:00:00Z`),
  estabelecimento,
  quantidade,
  precoTotal,
});

const compras = [
  compra(1, "Café Pilão 500g", "2026-06-10", "Supermercado Bom Preço", 18.9),
  compra(1, "Café Pilão 500g", "2026-08-02", "Atacadão Centro", 19.5),
  compra(1, "Café Pilão 500g", "2026-10-12", "Supermercado Bom Preço", 22.3),
  compra(2, "Leite Italac integral 1L", "2026-07-01", "Atacadão Centro", 18.36, 4),
  compra(2, "Leite Italac integral 1L", "2026-10-12", "Supermercado Bom Preço", 20.76, 4),
  compra(3, "Banana prata (kg)", "2026-09-01", "Feira", 8.4, 1.2),
  compra(3, "Banana prata (kg)", "2026-10-05", "Feira", 7.2, 1.2),
  compra(4, "Detergente Ypê 500ml", "2026-10-12", "Supermercado Bom Preço", 8.7, 3),
];

test("preço unitário divide pelo peso ou pela quantidade", () => {
  assert.equal(precoUnitario({ quantidade: 1.2, precoTotal: 8.4 }), 7);
  assert.equal(precoUnitario({ quantidade: 4, precoTotal: 20.76 }), 5.19);
  assert.equal(precoUnitario({ quantidade: 0, precoTotal: 5 }), null);
});

test("resume cada produto com variação e o mercado mais barato", () => {
  const [cafe, leite, banana, detergente] = resumirProdutos(compras);
  assert.deepEqual(
    [cafe.nome, cafe.compras, cafe.primeiroPreco, cafe.ultimoPreco, cafe.variacao],
    ["Café Pilão 500g", 3, 18.9, 22.3, 18],
  );
  assert.deepEqual(cafe.maisBarato, { estabelecimento: "Atacadão Centro", preco: 19.5, economia: 2.8 });

  assert.equal(leite.variacao, 13.1);
  assert.equal(banana.variacao, -14.3);
  assert.equal(banana.maisBarato, null, "só um mercado: nada para comparar");
  assert.equal(detergente.variacao, null, "uma compra só não tem variação");
});

test("inflação pessoal pesa cada produto pelo quanto você gasta nele", () => {
  const inflacao = inflacaoPessoal(resumirProdutos(compras));
  // (18 * 60,7 + 13,1 * 39,12 - 14,3 * 15,6) / 115,42
  assert.deepEqual(inflacao, { percentual: 12, produtos: 3, desde: "2026-06-10" });
  assert.equal(inflacaoPessoal(resumirProdutos(compras.filter((c) => c.produtoId !== 3))), null, "precisa de 3 produtos");
});

test("detalhe traz o histórico em ordem e o último preço em cada mercado", () => {
  const cafe = detalharProduto(compras.filter((c) => c.produtoId === 1).reverse());
  assert.deepEqual(cafe.historico.map((h) => [h.data, h.preco]), [
    ["2026-06-10", 18.9],
    ["2026-08-02", 19.5],
    ["2026-10-12", 22.3],
  ]);
  assert.deepEqual(cafe.porMercado, [
    { estabelecimento: "Atacadão Centro", ultimoPreco: 19.5, ultimaData: "2026-08-02", compras: 1 },
    { estabelecimento: "Supermercado Bom Preço", ultimoPreco: 22.3, ultimaData: "2026-10-12", compras: 2 },
  ]);
  assert.equal(detalharProduto([]), null);
});

test("fatos do mês: o produto que mais subiu e onde sairia mais barato", () => {
  const fatos = fatosDePrecos(resumirProdutos(compras), "2026-10");
  assert.deepEqual(fatos.map((f) => f.texto), [
    "Café Pilão 500g saiu R$ 22,30 em 12/10, 18% a mais que em junho (R$ 18,90).",
    "Café Pilão 500g sai R$ 2,80 mais barato em Atacadão Centro (R$ 19,50) do que em Supermercado Bom Preço (R$ 22,30).",
  ]);
  assert.deepEqual(fatosDePrecos(resumirProdutos(compras), "2026-09"), [], "nada comprado em setembro subiu");
});
