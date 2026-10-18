import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFatos, detectarAssinaturas, detectarDuplicadas, montarAlertas, reais } from "../src/servicos/analise.js";

const gasto = (data, valor, descricao, extra = {}) => ({
  tipo: "DESPESA",
  data: new Date(`${data}T00:00:00Z`),
  valor,
  descricao,
  estabelecimento: null,
  categoria: "Outros",
  parcelaTotal: null,
  ...extra,
});
const hoje = new Date("2026-10-17T12:00:00Z");

test("reais formata no padrão brasileiro", () => {
  assert.equal(reais(1234.5), "R$\u00a01.234,50");
  assert.equal(reais(89), "R$\u00a089,00");
});

test("detecta assinaturas e ignora gastos frequentes", () => {
  const transacoes = [
    gasto("2026-08-05", 44.9, "Netflix", { estabelecimento: "NETFLIX.COM" }),
    gasto("2026-09-05", 44.9, "Netflix", { estabelecimento: "NETFLIX.COM" }),
    gasto("2026-10-05", 44.9, "Netflix", { estabelecimento: "NETFLIX.COM" }),
    // Uber: várias vezes no mês, não é assinatura
    ...["2026-09-01", "2026-09-03", "2026-09-08", "2026-10-02", "2026-10-09"].map((d) =>
      gasto(d, 20, "Uber", { estabelecimento: "UBER *TRIP" }),
    ),
    // Academia: parou de cobrar em agosto
    gasto("2026-07-10", 99, "Academia", { estabelecimento: "SMART FIT" }),
    gasto("2026-08-10", 99, "Academia", { estabelecimento: "SMART FIT" }),
    // Valores muito diferentes: não é assinatura
    gasto("2026-09-12", 30, "Padaria"),
    gasto("2026-10-12", 150, "Padaria"),
    // Mercado uma vez por mês, mas com valor variando: não é assinatura
    gasto("2026-09-04", 488.9, "Supermercado"),
    gasto("2026-10-04", 612.4, "Supermercado"),
    // Duas idas ao mercado com valor parecido (7% de diferença) em só 2 meses: ainda não é assinatura
    gasto("2026-09-15", 81.37, "Compra no mercado", { estabelecimento: "Supermercado Bom Preço" }),
    gasto("2026-10-15", 87.4, "Compra no mercado", { estabelecimento: "Supermercado Bom Preço" }),
    // Parcela não conta como assinatura
    gasto("2026-09-20", 59.9, "Fone", { parcelaTotal: 5 }),
    gasto("2026-10-20", 59.9, "Fone", { parcelaTotal: 5 }),
  ];
  const assinaturas = detectarAssinaturas(transacoes, hoje);
  assert.deepEqual(
    assinaturas.map(({ nome, valorMensal, ativa, meses }) => ({ nome, valorMensal, ativa, meses })),
    [
      { nome: "Academia", valorMensal: 99, ativa: false, meses: 2 },
      { nome: "Netflix", valorMensal: 44.9, ativa: true, meses: 3 },
    ],
  );
});

test("compara com o mesmo período do mês anterior e prevê o fim do mês", () => {
  const atuais = [gasto("2026-10-03", 300, "Mercado", { categoria: "Mercado" }), gasto("2026-10-15", 100, "Bar", { categoria: "Lazer" })];
  const anteriores = [
    gasto("2026-09-10", 200, "Mercado", { categoria: "Mercado" }),
    gasto("2026-09-25", 1000, "Viagem", { categoria: "Lazer" }), // depois do dia 17: fora da comparação
  ];
  const fatos = calcularFatos({ mes: "2026-10", hoje, atuais, anteriores, historico: [] });
  const textos = fatos.map((f) => f.texto);
  assert.ok(textos.includes("Até agora você gastou R$\u00a0400,00, 100% a mais que no mesmo período de setembro."));
  // 400 em 17 dias -> ~729,41 em 31 dias
  assert.ok(textos.includes("No ritmo atual, você deve fechar o mês com cerca de R$\u00a0729,41 em gastos."));
  assert.ok(textos.includes("Você gastou R$\u00a0300,00 com Mercado, 50% a mais que no mesmo período de setembro."));
});

test("avisa sobre orçamento estourado ou perto do limite, com prioridade alta", () => {
  const fatos = calcularFatos({
    mes: "2026-10",
    hoje,
    atuais: [],
    anteriores: [],
    historico: [],
    orcamentos: [
      { categoria: "Delivery", gasto: 340, limite: 300, percentual: 113.3 },
      { categoria: "Lazer", gasto: 170, limite: 200, percentual: 85 },
      { categoria: "Mercado", gasto: 100, limite: 800, percentual: 12.5 },
    ],
  });
  assert.deepEqual(fatos.map((f) => f.texto), [
    "Você passou do orçamento de Delivery: R$\u00a0340,00 de R$\u00a0300,00.",
    "Você já usou 85% do orçamento de Lazer (R$\u00a0170,00 de R$\u00a0200,00).",
  ]);
});

test("aponta gasto fora do padrão só com histórico suficiente", () => {
  const historico = [40, 55, 60, 45, 50].map((v, i) => gasto(`2026-0${7 + (i % 2)}-1${i}`, v, "Ifood", { categoria: "Delivery" }));
  const atuais = [gasto("2026-10-11", 260, "Restaurante caro", { categoria: "Delivery" })];
  let fatos = calcularFatos({ mes: "2026-10", hoje, atuais, anteriores: [], historico });
  assert.ok(fatos.some((f) => f.tipo === "fora_do_padrao" && f.texto.includes("R$\u00a0260,00 em Restaurante caro")));

  fatos = calcularFatos({ mes: "2026-10", hoje, atuais, anteriores: [], historico: historico.slice(0, 3) });
  assert.ok(!fatos.some((f) => f.tipo === "fora_do_padrao"));
});

test("mês passado não tem previsão e compara com o mês inteiro anterior", () => {
  const fatos = calcularFatos({
    mes: "2026-09",
    hoje,
    atuais: [gasto("2026-09-28", 500, "Aluguel")],
    anteriores: [gasto("2026-08-30", 250, "Aluguel")],
    historico: [],
  });
  assert.ok(!fatos.some((f) => f.tipo === "previsao"));
  assert.ok(fatos.some((f) => f.texto === "Você gastou R$\u00a0500,00, 100% a mais que em agosto."));
});

test("reajuste de assinatura: dois patamares de valor viram aviso com o custo a mais por ano", () => {
  const netflix = (data, valor) => gasto(data, valor, "Netflix", { estabelecimento: "NETFLIX.COM" });
  const [assinatura] = detectarAssinaturas(
    [netflix("2026-06-05", 39.9), netflix("2026-07-05", 39.9), netflix("2026-08-05", 39.9), netflix("2026-09-05", 44.9), netflix("2026-10-05", 44.9)],
    hoje,
  );
  assert.deepEqual(
    [assinatura.valorMensal, assinatura.valorAnual, assinatura.reajuste],
    [44.9, 538.8, { de: 39.9, para: 44.9, desde: "2026-09-05" }],
  );
  // O aviso aparece no mês do reajuste, e some quando o usuário responde
  const [aviso] = montarAlertas({ mes: "2026-09", assinaturas: [assinatura] });
  assert.equal(aviso.texto, "Netflix ficou mais cara: de R$\u00a039,90 para R$\u00a044,90 (+13%), ou R$\u00a060,00 a mais por ano.");
  assert.deepEqual(montarAlertas({ mes: "2026-10", assinaturas: [assinatura] }), []);
  assert.deepEqual(montarAlertas({ mes: "2026-09", assinaturas: [assinatura], marcacoes: new Map([[aviso.chave, { tipo: "ok" }]]) }), []);

  // Só 2 cobranças diferentes não bastam para ser reajuste (podem ser duas compras quaisquer)
  assert.deepEqual(detectarAssinaturas([netflix("2026-09-05", 39.9), netflix("2026-10-05", 44.9)], hoje), []);
});

test("cobrança em dobro: mesma loja e valor em até um dia, a partir de R$ 20", () => {
  const compra = (id, data, valor, descricao, extra) => ({ ...gasto(data, valor, descricao, extra), id });
  const duplicadas = detectarDuplicadas([
    compra(1, "2026-10-10", 129.9, "Loja X", { estabelecimento: "LOJA X ONLINE" }),
    compra(2, "2026-10-11", 129.9, "Loja X", { estabelecimento: "LOJA X ONLINE" }),
    compra(3, "2026-10-12", 6, "Café", { estabelecimento: "PADARIA" }),
    compra(4, "2026-10-12", 6, "Café", { estabelecimento: "PADARIA" }),
    compra(5, "2026-10-01", 50, "Posto", { estabelecimento: "POSTO SHELL" }),
    compra(6, "2026-10-15", 50, "Posto", { estabelecimento: "POSTO SHELL" }),
    compra(7, "2026-10-03", 99, "Fone", { parcelaTotal: 3 }),
    compra(8, "2026-10-03", 99, "Fone", { parcelaTotal: 3 }),
  ]);
  assert.deepEqual(duplicadas.map((d) => d.ids), [[1, 2]]);
  const [aviso] = montarAlertas({ mes: "2026-10", duplicadas });
  assert.equal(aviso.texto, "Possível cobrança em dobro: LOJA X ONLINE, R$\u00a0129,90 duas vezes em 11/10. Confira na fatura e, se for engano, peça o estorno.");
});

test("assinatura marcada para cancelar que cobrou de novo vira aviso", () => {
  const assinatura = { chave: "SPOTIFY", nome: "Spotify", valorMensal: 21.9, ultimaCobranca: "2026-10-08", reajuste: null };
  const marcada = (dia) => new Map([["assinatura:SPOTIFY", { tipo: "cancelar", criadoEm: new Date(`2026-${dia}T12:00:00Z`) }]]);
  const [aviso] = montarAlertas({ mes: "2026-10", assinaturas: [assinatura], marcacoes: marcada("09-20") });
  assert.equal(aviso.tipo, "cobrou_apos_cancelar");
  assert.match(aviso.texto, /^Você marcou Spotify para cancelar, mas veio cobrança de R\$\u00a021,90 em 08\/10/);
  assert.deepEqual(montarAlertas({ mes: "2026-10", assinaturas: [assinatura], marcacoes: marcada("10-09") }), [], "cancelou depois da última cobrança");
});
