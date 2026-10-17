// Testes de ponta a ponta da API com a IA em modo mock.
// Precisam de um Postgres de teste: TEST_DATABASE_URL=postgresql://... npm test
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

const urlTeste = process.env.TEST_DATABASE_URL;
const opcoes = { skip: urlTeste ? false : "defina TEST_DATABASE_URL para rodar os testes de integração" };

let base, servidor, prisma, processarPendentes;

before(async () => {
  if (!urlTeste) return;
  Object.assign(process.env, { DATABASE_URL: urlTeste, DIRECT_URL: urlTeste, IA_MOCK: "true", JWT_SECRET: "teste" });
  ({ prisma } = await import("../src/lib/prisma.js"));
  ({ processarPendentes } = await import("../src/servicos/processador.js"));
  const { app } = await import("../src/app.js");
  await prisma.$executeRawUnsafe('TRUNCATE "Usuario" RESTART IDENTITY CASCADE');
  servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}`;
});

after(async () => {
  servidor?.close();
  await prisma?.$disconnect();
});

async function chamar(token, metodo, caminho, corpo) {
  const ehForm = corpo instanceof FormData;
  const resposta = await fetch(base + caminho, {
    method: metodo,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(corpo && !ehForm && { "content-type": "application/json" }),
    },
    body: ehForm ? corpo : corpo && JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: resposta.status === 204 ? null : await resposta.json() };
}

async function cadastrar(email) {
  const { corpo } = await chamar(null, "POST", "/auth/registrar", { nome: "Teste", email, senha: "12345678" });
  return corpo.token;
}

function arquivo(conteudo, tipo, nome) {
  const form = new FormData();
  form.append("arquivo", new Blob([conteudo], { type: tipo }), nome);
  return form;
}

test("fluxo completo: texto, cupom, fatura, conciliação e painel", opcoes, async () => {
  const token = await cadastrar("fluxo@teste.com");

  assert.equal((await chamar(token, "POST", "/documentos", { texto: "almocei por 32 reais" })).status, 202);
  await chamar(token, "POST", "/documentos", arquivo("\xff\xd8\xff", "image/jpeg", "cupom.jpg"));
  await processarPendentes();
  await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4", "application/pdf", "fatura.pdf"));
  await processarPendentes();

  const documentos = (await chamar(token, "GET", "/documentos")).corpo;
  assert.deepEqual(documentos.map((d) => d.status), ["PRONTO", "PRONTO", "PRONTO"]);

  const transacoes = (await chamar(token, "GET", "/transacoes")).corpo;
  const cupom = transacoes.find((t) => t.origem === "CUPOM");
  const mercadoNaFatura = transacoes.find((t) => t.origem === "FATURA" && t.valor === 87.4);
  assert.equal(cupom.itens.length, 5);
  assert.equal(cupom.conciliadaComId, mercadoNaFatura.id, "cupom deve apontar para a linha da fatura");

  // 32 (texto) + 87,40 (mercado, uma vez só) + 23,15 + 44,90 + 59,90
  const painel = (await chamar(token, "GET", "/painel")).corpo;
  assert.equal(painel.despesas, 247.35);
  assert.equal(painel.porCategoria.find((c) => c.categoria === "Mercado").total, 87.4);

  // A mesma fatura enviada de novo não duplica nada
  await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4", "application/pdf", "fatura-de-novo.pdf"));
  await processarPendentes();
  assert.equal((await chamar(token, "GET", "/transacoes")).corpo.length, transacoes.length);
});

test("aceita arquivo em base64 no JSON, como o app envia", opcoes, async () => {
  const token = await cadastrar("base64@teste.com");
  const enviar = (arquivo, tipo) => chamar(token, "POST", "/documentos", { arquivo, tipo });

  const pdf = await enviar({ base64: Buffer.from("%PDF-1.4").toString("base64"), nome: "Fatura Março.pdf", mimeType: "application/pdf" }, "FATURA");
  assert.equal(pdf.status, 202);
  assert.equal(pdf.corpo.mimeType, "application/pdf");

  // Sem tipo MIME, vale a extensão
  const foto = await enviar({ base64: Buffer.from("\xff\xd8\xff").toString("base64"), nome: "foto.jpg" });
  assert.equal(foto.corpo.tipo, "CUPOM");
  assert.equal(foto.corpo.mimeType, "image/jpeg");

  await processarPendentes();
  const documentos = (await chamar(token, "GET", "/documentos")).corpo;
  assert.deepEqual(documentos.map((d) => d.status), ["PRONTO", "PRONTO"]);

  assert.equal((await enviar({ base64: Buffer.from("oi").toString("base64"), nome: "a.zip", mimeType: "application/zip" })).status, 415);
  const grande = Buffer.alloc(11 * 1024 * 1024).toString("base64");
  assert.equal((await enviar({ base64: grande, nome: "grande.pdf", mimeType: "application/pdf" })).status, 413);
});

test("correção de categoria vira memória e frase simples dispensa a IA", opcoes, async () => {
  const token = await cadastrar("memoria@teste.com");
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const transporte = categorias.find((c) => c.nome === "Transporte");

  // Sem memória: vai para a "IA" (mock responde Almoço / Restaurantes)
  await chamar(token, "POST", "/documentos", { texto: "gastei 35 no uber" });
  await processarPendentes();
  let [transacao] = (await chamar(token, "GET", "/transacoes")).corpo;
  assert.equal(transacao.categoria.nome, "Restaurantes e delivery");

  // Usuário corrige um lançamento do Uber
  const manual = await chamar(token, "POST", "/transacoes", {
    valor: 20, data: "2026-10-01", descricao: "Uber", categoriaId: transporte.id,
  });
  assert.equal(manual.status, 201);

  // Agora a frase é resolvida localmente, com a categoria lembrada
  await chamar(token, "POST", "/documentos", { texto: "gastei 18,50 no Uber" });
  await processarPendentes();
  [transacao] = (await chamar(token, "GET", "/transacoes")).corpo;
  assert.equal(transacao.descricao, "Uber");
  assert.equal(transacao.valor, 18.5);
  assert.equal(transacao.categoria.nome, "Transporte");
});

test("um usuário não enxerga nem altera dados de outro", opcoes, async () => {
  const dono = await cadastrar("dono@teste.com");
  const intruso = await cadastrar("intruso@teste.com");
  const { corpo: doc } = await chamar(dono, "POST", "/documentos", { texto: "paguei 10 na padaria" });
  const { corpo: transacao } = await chamar(dono, "POST", "/transacoes", { valor: 5, data: "2026-10-02", descricao: "Café" });

  assert.equal((await chamar(intruso, "GET", `/documentos/${doc.id}`)).status, 404);
  assert.equal((await chamar(intruso, "PATCH", `/transacoes/${transacao.id}`, { valor: 1 })).status, 404);
  assert.equal((await chamar(intruso, "DELETE", `/transacoes/${transacao.id}`)).status, 404);
  assert.equal((await chamar(null, "GET", "/transacoes")).status, 401);
});

test("validações devolvem mensagens claras", opcoes, async () => {
  const token = await cadastrar("validacao@teste.com");
  const semValor = await chamar(token, "POST", "/transacoes", { data: "2026-10-02", descricao: "x" });
  assert.equal(semValor.status, 400);
  const dataRuim = await chamar(token, "POST", "/transacoes", { valor: 5, data: "2026-02-31", descricao: "x" });
  assert.equal(dataRuim.status, 400);
  const formato = await chamar(token, "POST", "/documentos", arquivo("oi", "application/zip", "a.zip"));
  assert.equal(formato.status, 415);
  const duplicado = await chamar(null, "POST", "/auth/registrar", { nome: "x", email: "validacao@teste.com", senha: "12345678" });
  assert.equal(duplicado.status, 409);
});

test("orçamentos, assinaturas e assistente (sem IA no modo mock, com cache)", opcoes, async () => {
  const token = await cadastrar("assistente@teste.com");
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const id = (nome) => categorias.find((c) => c.nome === nome).id;

  // Datas relativas ao mês atual, para o teste funcionar em qualquer dia
  const agora = new Date();
  const diaDoMes = (mesesAtras, dia) =>
    new Date(Date.UTC(agora.getFullYear(), agora.getMonth() - mesesAtras, dia)).toISOString().slice(0, 10);
  const lancar = (valor, data, descricao, categoria) =>
    chamar(token, "POST", "/transacoes", { valor, data, descricao, categoriaId: id(categoria) });

  // Sem "tipo", o lançamento herda o tipo da categoria: Salário vira entrada
  const salario = (await lancar(4500, diaDoMes(0, 1), "Salário", "Salário")).corpo;
  assert.equal(salario.tipo, "RECEITA");

  for (const mesesAtras of [2, 1, 0]) await lancar(44.9, diaDoMes(mesesAtras, 5), "Netflix", "Assinaturas");
  await lancar(120, diaDoMes(0, 2), "Show", "Lazer");

  // Orçamento: cria, valida e mostra a situação
  assert.equal((await chamar(token, "PUT", `/orcamentos/${id("Lazer")}`, { valorMensal: 0 })).status, 400);
  assert.equal((await chamar(token, "PUT", `/orcamentos/${id("Lazer")}`, { valorMensal: 100 })).status, 200);
  const [lazer] = (await chamar(token, "GET", "/orcamentos")).corpo;
  assert.deepEqual(
    { categoria: lazer.categoria, gasto: lazer.gasto, limite: lazer.limite, percentual: lazer.percentual, situacao: lazer.situacao },
    { categoria: "Lazer", gasto: 120, limite: 100, percentual: 120, situacao: "estourado" },
  );

  const { assinaturas, totalMensal } = (await chamar(token, "GET", "/assinaturas")).corpo;
  assert.deepEqual(assinaturas.map((a) => [a.nome, a.valorMensal, a.ativa]), [["Netflix", 44.9, true]]);
  assert.equal(totalMensal, 44.9);

  // Assistente: sem IA, as dicas são os próprios fatos, com o orçamento estourado primeiro
  const primeira = (await chamar(token, "GET", "/assistente")).corpo;
  assert.equal(primeira.geradoPorIa, false);
  assert.equal(primeira.dicas[0], "Você passou do orçamento de Lazer: R$\u00a0120,00 de R$\u00a0100,00.");
  assert.ok(primeira.dicas.some((d) => d.includes("Netflix")));

  // Mesmos fatos: devolve o que está guardado, sem gerar de novo
  const segunda = (await chamar(token, "GET", "/assistente")).corpo;
  assert.equal(segunda.geradoEm, primeira.geradoEm);

  // Orçamento de outro usuário / inexistente
  const outro = await cadastrar("outro-orcamento@teste.com");
  assert.equal((await chamar(outro, "PUT", `/orcamentos/${id("Lazer")}`, { valorMensal: 50 })).status, 404);
  assert.equal((await chamar(token, "DELETE", `/orcamentos/${id("Lazer")}`)).status, 204);
  assert.equal((await chamar(token, "DELETE", `/orcamentos/${id("Lazer")}`)).status, 404);
});

test("contas, edição completa, histórico de envios, exportação e exclusão da conta", opcoes, async () => {
  const token = await cadastrar("basico@teste.com");
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const id = (nome) => categorias.find((c) => c.nome === nome).id;
  const hoje = new Date().toISOString().slice(0, 10);

  // Contas: cria, renomeia, valida dono
  const nubank = (await chamar(token, "POST", "/contas", { nome: "Nubank", tipo: "CREDITO" })).corpo;
  assert.equal((await chamar(token, "PATCH", `/contas/${nubank.id}`, { nome: "Nubank Roxinho" })).corpo.nome, "Nubank Roxinho");
  const outro = await cadastrar("outro-basico@teste.com");
  assert.equal((await chamar(outro, "DELETE", `/contas/${nubank.id}`)).status, 404);

  // Lançamento numa conta aparece no painel por conta
  const gasto = (await chamar(token, "POST", "/transacoes", {
    valor: 80, data: hoje, descricao: "Farmácia", categoriaId: id("Saúde"), contaId: nubank.id,
  })).corpo;
  let painel = (await chamar(token, "GET", "/painel")).corpo;
  assert.deepEqual(painel.porConta, [{ contaId: nubank.id, conta: "Nubank Roxinho", tipo: "CREDITO", total: 80 }]);

  // Edição completa: valor, descrição, data, tipo e conta
  const editado = (await chamar(token, "PATCH", `/transacoes/${gasto.id}`, {
    valor: 95.5, descricao: "Drogaria", tipo: "DESPESA", contaId: null,
  })).corpo;
  assert.deepEqual([editado.valor, editado.descricao, editado.conta], [95.5, "Drogaria", null]);
  assert.equal((await chamar(token, "GET", `/transacoes/${gasto.id}`)).corpo.descricao, "Drogaria");
  assert.equal((await chamar(outro, "GET", `/transacoes/${gasto.id}`)).status, 404);

  // Excluir a conta mantém os lançamentos (só ficam sem conta)
  await chamar(token, "PATCH", `/transacoes/${gasto.id}`, { contaId: nubank.id });
  assert.equal((await chamar(token, "DELETE", `/contas/${nubank.id}`)).status, 204);
  assert.equal((await chamar(token, "GET", `/transacoes/${gasto.id}`)).corpo.conta, null);

  // Histórico de envios com contagem; apagar envio junto com os lançamentos
  await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4", "application/pdf", "fatura.pdf"));
  await processarPendentes();
  const [fatura] = (await chamar(token, "GET", "/documentos")).corpo;
  assert.equal(fatura._count.transacoes, 4);
  assert.equal((await chamar(token, "DELETE", `/documentos/${fatura.id}?transacoes=true`)).status, 204);
  const restantes = (await chamar(token, "GET", "/transacoes")).corpo;
  assert.deepEqual(restantes.map((t) => t.descricao), ["Drogaria"]);

  // Uso da IA responde (no mock fica zerado)
  assert.deepEqual((await chamar(token, "GET", "/uso-ia")).corpo.porTarefa, []);

  // Exportação em CSV no formato do Excel brasileiro
  const resposta = await fetch(`${base}/exportar`, { headers: { authorization: `Bearer ${token}` } });
  assert.match(resposta.headers.get("content-type"), /text\/csv/);
  const linhas = (await resposta.text()).replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(linhas[0], "Data;Descrição;Estabelecimento;Categoria;Conta;Tipo;Valor;Parcela;Origem;Já contado em outra linha");
  assert.equal(linhas[1], `${hoje.split("-").reverse().join("/")};Drogaria;;Saúde;;Gasto;95,50;;MANUAL;`);

  // Excluir a conta pede a senha certa e apaga tudo
  assert.equal((await chamar(token, "DELETE", "/minha-conta", { senha: "errada" })).status, 403);
  assert.equal((await chamar(token, "DELETE", "/minha-conta", { senha: "12345678" })).status, 204);
  assert.equal((await chamar(null, "POST", "/auth/entrar", { email: "basico@teste.com", senha: "12345678" })).status, 401);
});
