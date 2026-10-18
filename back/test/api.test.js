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
  // Histórico dos últimos 6 meses, terminando no mês atual
  assert.equal(painel.historico.length, 6);
  assert.deepEqual(painel.historico.at(-1), { mes: new Date().toISOString().slice(0, 7), despesas: 247.35, receitas: 0 });

  // O mesmo arquivo de novo é recusado antes de chegar na IA
  const repetido = await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4", "application/pdf", "fatura-copia.pdf"));
  assert.equal(repetido.status, 409);
  assert.match(repetido.corpo.erro, /^Você já enviou esse arquivo em \d{2}\/\d{2} às \d{2}:\d{2}\./);
  assert.equal((await chamar(token, "GET", "/documentos")).corpo.length, 3);

  // Outro arquivo com as mesmas linhas (ex.: fatura baixada de novo) passa, mas não duplica nada
  await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4 baixada de novo", "application/pdf", "fatura-de-novo.pdf"));
  await processarPendentes();
  assert.equal((await chamar(token, "GET", "/transacoes")).corpo.length, transacoes.length);

  // Apagar o envio libera o arquivo para ser lido de novo
  const [ultimo] = (await chamar(token, "GET", "/documentos")).corpo;
  assert.equal((await chamar(token, "DELETE", `/documentos/${ultimo.id}`)).status, 204);
  assert.equal((await chamar(token, "POST", "/documentos", arquivo("%PDF-1.4 baixada de novo", "application/pdf", "f.pdf"))).status, 202);
  await processarPendentes();
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

test("preços dos produtos: histórico, mercado mais barato, renomear, juntar e dica do assistente", opcoes, async () => {
  const token = await cadastrar("precos@teste.com");
  const usuario = await prisma.usuario.findUnique({ where: { email: "precos@teste.com" } });

  // Cupom de hoje (mock: café a 21,90 no Supermercado Bom Preço) e um cupom antigo em outro mercado
  await chamar(token, "POST", "/documentos", arquivo("\xff\xd8\xff", "image/jpeg", "cupom.jpg"));
  await processarPendentes();
  const cafe = await prisma.produto.findFirst({ where: { usuarioId: usuario.id, nomeCanonico: "Café Pilão 500g" } });
  const duplicado = await prisma.produto.create({ data: { usuarioId: usuario.id, nomeCanonico: "Café Pilão Tradicional 500g" } });
  const antes = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  await prisma.transacao.create({
    data: {
      usuarioId: usuario.id, tipo: "DESPESA", origem: "CUPOM", valor: 37.4, data: antes,
      descricao: "Compra no mercado", estabelecimento: "Atacadão Centro",
      itens: {
        create: [
          { descricao: "CAFE PILAO 500", quantidade: 1, precoTotal: 18.9, produtoId: cafe.id },
          { descricao: "CAFE PILAO TRAD", quantidade: 1, precoTotal: 18.5, produtoId: duplicado.id },
        ],
      },
    },
  });

  const { inflacao, produtos } = (await chamar(token, "GET", "/produtos")).corpo;
  assert.equal(produtos.length, 6);
  assert.equal(inflacao, null, "só um produto com mais de uma compra");
  const resumo = produtos.find((p) => p.id === cafe.id);
  assert.deepEqual(
    [resumo.compras, resumo.primeiroPreco, resumo.ultimoPreco, resumo.variacao, resumo.maisBarato],
    [2, 18.9, 21.9, 15.9, { estabelecimento: "Atacadão Centro", preco: 18.9, economia: 3 }],
  );

  // Detalhe com o histórico e o preço em cada mercado
  const detalhe = (await chamar(token, "GET", `/produtos/${cafe.id}`)).corpo;
  assert.deepEqual(detalhe.historico.map((h) => h.preco), [18.9, 21.9]);
  assert.deepEqual(detalhe.porMercado.map((m) => m.estabelecimento), ["Atacadão Centro", "Supermercado Bom Preço"]);

  // O assistente comenta o preço que subiu
  const { dicas } = (await chamar(token, "GET", "/assistente")).corpo;
  assert.ok(dicas.some((d) => d.startsWith("Café Pilão 500g saiu R$ 21,90")), dicas.join("\n"));

  // Renomear para um nome que já existe pede para juntar; juntar move as compras
  assert.equal((await chamar(token, "PATCH", `/produtos/${duplicado.id}`, { nome: "Café Pilão 500g" })).status, 409);
  assert.equal((await chamar(token, "PATCH", `/produtos/${duplicado.id}`, { nome: "Café Pilão Trad." })).corpo.nome, "Café Pilão Trad.");
  assert.equal((await chamar(token, "POST", `/produtos/${duplicado.id}/juntar`, { produtoId: duplicado.id })).status, 400);
  const juntado = (await chamar(token, "POST", `/produtos/${duplicado.id}/juntar`, { produtoId: cafe.id })).corpo;
  assert.equal(juntado.compras, 3);
  assert.equal((await chamar(token, "GET", `/produtos/${duplicado.id}`)).status, 404);

  // Outro usuário não vê nem mexe
  const outro = await cadastrar("outro-precos@teste.com");
  assert.equal((await chamar(outro, "GET", `/produtos/${cafe.id}`)).status, 404);
  assert.equal((await chamar(outro, "POST", `/produtos/${cafe.id}/juntar`, { produtoId: cafe.id + 1 })).status, 404);
  assert.deepEqual((await chamar(outro, "GET", "/produtos")).corpo, { inflacao: null, produtos: [] });
});

test("cupom pelo QR Code da NFC-e: itens da SEFAZ, sem repetir, memória de produtos e categoria", opcoes, async () => {
  const { gerarChave, qrcodeDe, paginaNfce } = await import("./fixtures/nfce.js");
  const token = await cadastrar("nfce@teste.com");
  const pagina = (html) => ({ base64: Buffer.from(html, "latin1").toString("base64"), tipo: "text/html; charset=ISO-8859-1" });
  const enviar = (corpo) => chamar(token, "POST", "/documentos/nfce", corpo);

  // QR que não é de NFC-e, e QR com a chave certa mas fora de um site do governo
  assert.equal((await enviar({ qrcode: "https://pix.exemplo.com/abc" })).status, 400);
  assert.equal((await enviar({ qrcode: `https://exemplo.com/?p=${gerarChave(1)}|2|1` })).status, 400);

  const primeira = await enviar({ qrcode: qrcodeDe(gerarChave(1)), pagina: pagina(paginaNfce({ data: "02/10/2026" })) });
  assert.equal(primeira.status, 202);
  await processarPendentes();
  const lida = (await chamar(token, "GET", `/documentos/${primeira.corpo.id}`)).corpo;
  assert.equal(lida.status, "PRONTO");
  const [compra] = lida.transacoes;
  assert.deepEqual(
    [compra.valor, compra.data.slice(0, 10), compra.estabelecimento, compra.origem, compra.itens.length],
    [57.22, "2026-10-02", "Supermercado Bom Preco", "CUPOM", 4],
  );

  // A mesma nota de novo é recusada sem ler nada
  const repetida = await enviar({ qrcode: qrcodeDe(gerarChave(1)), pagina: pagina(paginaNfce()) });
  assert.equal(repetida.status, 409);
  assert.match(repetida.corpo.erro, /^Você já enviou esse cupom em/);

  // O usuário arruma a categoria e o nome de um produto; a próxima compra na mesma loja já vem certa
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const mercado = categorias.find((c) => c.nome === "Mercado").id;
  await chamar(token, "PATCH", `/transacoes/${compra.id}`, { categoriaId: mercado });
  const { produtos } = (await chamar(token, "GET", "/produtos")).corpo;
  const cafe = produtos.find((p) => p.nome === "Cafe Pilao Trad 500g");
  assert.ok(cafe, produtos.map((p) => p.nome).join(", "));
  await chamar(token, "PATCH", `/produtos/${cafe.id}`, { nome: "Café Pilão 500g" });

  const itensSegunda = [
    ["CAFE PILAO TRAD 500G", "7896089011906", "1", "UN", "23,5", "23,50"],
    ["ARROZ CAMIL T1 5KG", "7896006711117", "1", "UN", "27,9", "27,90"],
  ];
  await enviar({ qrcode: qrcodeDe(gerarChave(2)), pagina: pagina(paginaNfce({ data: "16/10/2026", itens: itensSegunda })) });
  await processarPendentes();
  const [ultimo] = (await chamar(token, "GET", "/documentos")).corpo;
  const segunda = (await chamar(token, "GET", `/documentos/${ultimo.id}`)).corpo.transacoes[0];
  assert.equal(segunda.categoria.nome, "Mercado");
  const detalheCafe = (await chamar(token, "GET", `/produtos/${cafe.id}`)).corpo;
  assert.deepEqual(detalheCafe.historico.map((h) => h.preco), [21.9, 23.5]);

  // Nota que a SEFAZ ainda não tem: erro claro, sem chamar a IA
  const naoAchada = await enviar({ qrcode: qrcodeDe(gerarChave(3)), pagina: pagina("<html><body>NFC-e não encontrada</body></html>") });
  await processarPendentes();
  const erro = (await chamar(token, "GET", `/documentos/${naoAchada.corpo.id}`)).corpo;
  assert.equal(erro.status, "ERRO");
  assert.match(erro.erro, /^A SEFAZ ainda não mostra essa nota/);
});

test("alertas: reajuste, cobrança em dobro, vou cancelar e não é assinatura", opcoes, async () => {
  const token = await cadastrar("alertas@teste.com");
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const id = (nome) => categorias.find((c) => c.nome === nome).id;
  const agora = new Date();
  const dia = (mesesAtras, d) => new Date(Date.UTC(agora.getFullYear(), agora.getMonth() - mesesAtras, d)).toISOString().slice(0, 10);
  const lancar = (valor, data, descricao, categoria) =>
    chamar(token, "POST", "/transacoes", { valor, data, descricao, categoriaId: id(categoria) });

  for (const mesesAtras of [3, 2, 1]) await lancar(19.9, dia(mesesAtras, 3), "Spotify", "Assinaturas");
  await lancar(21.9, dia(0, 3), "Spotify", "Assinaturas");
  await lancar(129.9, dia(0, 2), "Loja X Online", "Compras");
  await lancar(129.9, dia(0, 2), "Loja X Online", "Compras");

  let alertas = (await chamar(token, "GET", "/alertas")).corpo;
  assert.deepEqual(alertas.map((a) => a.tipo).sort(), ["duplicada", "reajuste"]);
  const { assinaturas, totalMensal, totalAnual } = (await chamar(token, "GET", "/assinaturas")).corpo;
  assert.deepEqual([assinaturas[0].nome, totalMensal, totalAnual], ["Spotify", 21.9, 262.8]);

  // "Está certo" some com o aviso
  const duplicada = alertas.find((a) => a.tipo === "duplicada");
  assert.equal((await chamar(token, "PUT", "/marcacoes", { chave: duplicada.chave, tipo: "ok" })).status, 200);
  alertas = (await chamar(token, "GET", "/alertas")).corpo;
  assert.deepEqual(alertas.map((a) => a.tipo), ["reajuste"]);

  // "Vou cancelar": sai do total e o aviso de reajuste deixa de fazer sentido
  const chave = `assinatura:${assinaturas[0].chave}`;
  await chamar(token, "PUT", "/marcacoes", { chave, tipo: "cancelar" });
  let resposta = (await chamar(token, "GET", "/assinaturas")).corpo;
  assert.deepEqual([resposta.assinaturas[0].marcacao, resposta.totalMensal], ["cancelar", 0]);
  assert.deepEqual((await chamar(token, "GET", "/alertas")).corpo, []);

  // "Não é assinatura" tira da lista; desfazer traz de volta
  await chamar(token, "PUT", "/marcacoes", { chave, tipo: "ignorar" });
  assert.deepEqual((await chamar(token, "GET", "/assinaturas")).corpo.assinaturas, []);
  assert.equal((await chamar(token, "DELETE", `/marcacoes?chave=${encodeURIComponent(chave)}`)).status, 204);
  resposta = (await chamar(token, "GET", "/assinaturas")).corpo;
  assert.deepEqual([resposta.assinaturas[0].marcacao, resposta.totalMensal], [null, 21.9]);

  assert.equal((await chamar(token, "PUT", "/marcacoes", { chave: "qualquer", tipo: "ok" })).status, 400);
});

test("pergunte ao Bolso: a resposta vem dos números do banco", opcoes, async () => {
  const token = await cadastrar("perguntas@teste.com");
  const categorias = (await chamar(token, "GET", "/categorias")).corpo;
  const id = (nome) => categorias.find((c) => c.nome === nome).id;
  const hoje = new Date().toISOString().slice(0, 10);
  await chamar(token, "POST", "/transacoes", { valor: 87.4, data: hoje, descricao: "Supermercado Bom Preço", categoriaId: id("Mercado") });
  await chamar(token, "POST", "/transacoes", { valor: 23.15, data: hoje, descricao: "Uber", categoriaId: id("Transporte") });

  const perguntar = (pergunta) => chamar(token, "POST", "/perguntas", { pergunta });
  const total = (await perguntar("Quanto gastei com mercado este mês?")).corpo;
  assert.match(total.resposta, /^Você gastou R\$ 87,40 com Mercado/);
  assert.equal(total.filtros.intencao, "total");

  const onde = (await perguntar("Onde mais gastei?")).corpo;
  assert.match(onde.resposta, /onde você mais gastou foi Supermercado Bom Preço: R\$ 87,40/);
  assert.deepEqual(onde.linhas.map((l) => l.valor), [87.4, 23.15]);

  assert.equal((await perguntar("")).status, 400);
  // Outro usuário não enxerga nada
  const outro = await cadastrar("outro-perguntas@teste.com");
  assert.match((await chamar(outro, "POST", "/perguntas", { pergunta: "quanto gastei?" })).corpo.resposta, /^Não achei gastos/);
});

test("gastos fixos: a IA marca, repete todo mês e a cobrança de verdade substitui o automático", opcoes, async () => {
  const token = await cadastrar("fixos@teste.com");
  const usuario = await prisma.usuario.findUnique({ where: { email: "fixos@teste.com" } });
  const hoje = new Date().toISOString().slice(0, 10);

  // Texto que a IA (mock) reconhece como assinatura vira gasto fixo
  await chamar(token, "POST", "/documentos", { texto: "assinei a netflix por 44,90" });
  await processarPendentes();
  let { recorrencias, totalMensal } = (await chamar(token, "GET", "/recorrencias")).corpo;
  assert.deepEqual(recorrencias.map((r) => [r.descricao, Number(r.valor), r.criadaPorIa]), [["Netflix", 44.9, true]]);
  assert.equal(totalMensal, 44.9);

  // Lançamento à mão: a IA (mock) reconhece academia; o usuário pode dizer que não repete
  const academia = (await chamar(token, "POST", "/transacoes", { valor: 99.9, data: hoje, descricao: "Academia Smart Fit" })).corpo;
  assert.equal(academia.recorrencia?.criadaPorIa, true);
  const lanche = (await chamar(token, "POST", "/transacoes", { valor: 25, data: hoje, descricao: "Lanche" })).corpo;
  assert.equal(lanche.recorrencia, null);
  const semRepetir = (await chamar(token, "POST", "/transacoes", { valor: 21.9, data: hoje, descricao: "Spotify", repetir: false })).corpo;
  assert.equal(semRepetir.recorrencia, null);

  // "Não repetir" logo depois de a IA marcar: o gasto fixo some de vez
  const desfeito = (await chamar(token, "POST", `/transacoes/${academia.id}/repetir`, { repetir: false })).corpo;
  assert.equal(desfeito.recorrencia, null);
  assert.equal((await chamar(token, "GET", "/recorrencias")).corpo.recorrencias.length, 1);

  // Um gasto fixo que venceu há 10 dias é lançado sozinho ao abrir o painel, uma vez só
  const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const venceu = new Date(Date.UTC(dezDiasAtras.getFullYear(), dezDiasAtras.getMonth(), dezDiasAtras.getDate()));
  const aluguel = await prisma.recorrencia.create({
    data: { usuarioId: usuario.id, descricao: "Aluguel", valor: 1500, dia: venceu.getUTCDate(), proximaData: venceu },
  });
  await chamar(token, "GET", "/painel");
  await chamar(token, "GET", "/painel");
  const automaticos = await prisma.transacao.findMany({ where: { recorrenciaId: aluguel.id } });
  assert.deepEqual(automaticos.map((t) => [t.origem, t.data.toISOString().slice(0, 10), Number(t.valor)]), [["RECORRENTE", venceu.toISOString().slice(0, 10), 1500]]);
  assert.ok((await prisma.recorrencia.findUnique({ where: { id: aluguel.id } })).proximaData > venceu);

  // A cobrança de verdade (com reajuste) chega: o automático sai da soma, sem duplicar
  await chamar(token, "POST", "/transacoes", { valor: 1590, data: venceu.toISOString().slice(0, 10), descricao: "Aluguel", repetir: false });
  const [automatico] = await prisma.transacao.findMany({ where: { recorrenciaId: aluguel.id, origem: "RECORRENTE" } });
  assert.ok(automatico.conciliadaComId, "o automático aponta para a cobrança de verdade");

  // Editar dia, parar e apagar; outro usuário não mexe
  const outro = await cadastrar("outro-fixos@teste.com");
  assert.equal((await chamar(outro, "PATCH", `/recorrencias/${aluguel.id}`, { ativa: false })).status, 404);
  assert.equal((await chamar(token, "PATCH", `/recorrencias/${aluguel.id}`, { dia: 10 })).corpo.dia, 10);
  assert.equal((await chamar(token, "PATCH", `/recorrencias/${aluguel.id}`, { ativa: false })).corpo.ativa, false);
  ({ totalMensal } = (await chamar(token, "GET", "/recorrencias")).corpo);
  assert.equal(totalMensal, 44.9);
  assert.equal((await chamar(token, "DELETE", `/recorrencias/${aluguel.id}`)).status, 204);
  assert.equal(await prisma.transacao.count({ where: { descricao: "Aluguel", usuarioId: usuario.id } }), 2, "os lançamentos ficam");
});

test("assistente do chat: criar na hora, propor, confirmar, cancelar e desfazer", opcoes, async () => {
  const token = await cadastrar("chat@teste.com");
  const usuario = await prisma.usuario.findUnique({ where: { email: "chat@teste.com" } });
  const conversar = (mensagem, extra = {}) => chamar(token, "POST", "/conversa", { mensagem, ...extra });

  // Criar acontece na hora e vem com a opção de desfazer
  const criado = (await conversar("gastei 45 na farmácia")).corpo;
  assert.equal(criado.acoes.length, 1);
  assert.equal(criado.acoes[0].situacao, "FEITA");
  assert.equal(criado.acoes[0].podeDesfazer, true);
  assert.match(criado.acoes[0].detalhes[0], /Farmácia · \d\d\/\d\d · R\$\s45,00/);
  assert.match(criado.referencias, /^#\d+ Farmácia/);
  assert.equal(await prisma.transacao.count({ where: { usuarioId: usuario.id } }), 1);

  const desfeito = await chamar(token, "POST", `/conversa/acoes/${criado.acoes[0].id}/desfazer`);
  assert.equal(desfeito.corpo.situacao, "DESFEITA");
  assert.equal(await prisma.transacao.count({ where: { usuarioId: usuario.id } }), 0);
  assert.equal((await chamar(token, "POST", `/conversa/acoes/${criado.acoes[0].id}/desfazer`)).status, 409);

  // Apagar vira proposta: nada some até o usuário confirmar
  await conversar("gastei 30 no uber");
  await conversar("gastei 20 no uber ontem");
  const proposta = (await conversar("apaga uber")).corpo;
  assert.equal(proposta.acoes[0].situacao, "PENDENTE");
  assert.equal(proposta.acoes[0].detalhes.length, 2);
  assert.match(proposta.acoes[0].resumo, /Apagar 2 lançamentos, total R\$\s50,00/);
  assert.equal(await prisma.transacao.count({ where: { usuarioId: usuario.id } }), 2);

  // Outro usuário não confirma; confirmar duas vezes não executa duas vezes
  const outro = await cadastrar("chat-outro@teste.com");
  assert.equal((await chamar(outro, "POST", `/conversa/acoes/${proposta.acoes[0].id}/confirmar`)).status, 404);
  const confirmada = await chamar(token, "POST", `/conversa/acoes/${proposta.acoes[0].id}/confirmar`);
  assert.equal(confirmada.corpo.situacao, "FEITA");
  assert.equal(confirmada.corpo.podeDesfazer, false, "apagar não tem volta");
  assert.equal(await prisma.transacao.count({ where: { usuarioId: usuario.id } }), 0);
  assert.equal((await chamar(token, "POST", `/conversa/acoes/${proposta.acoes[0].id}/confirmar`)).status, 409);

  // Cancelar; e proposta velha não vale mais
  await conversar("gastei 12 na padaria");
  const cancelar = (await conversar("apaga padaria")).corpo.acoes[0];
  assert.equal((await chamar(token, "POST", `/conversa/acoes/${cancelar.id}/cancelar`)).corpo.situacao, "CANCELADA");
  assert.equal((await chamar(token, "POST", `/conversa/acoes/${cancelar.id}/confirmar`)).status, 409);
  const velha = (await conversar("apaga padaria")).corpo.acoes[0];
  await prisma.acaoAssistente.update({ where: { id: velha.id }, data: { criadoEm: new Date(Date.now() - 31 * 60 * 1000) } });
  assert.equal((await chamar(token, "POST", `/conversa/acoes/${velha.id}/confirmar`)).status, 410);
  assert.equal(await prisma.transacao.count({ where: { usuarioId: usuario.id } }), 1);

  // Perguntas continuam funcionando pelo chat
  const pergunta = (await conversar("quanto gastei este mês?")).corpo;
  assert.match(pergunta.resposta, /12,00/);
  assert.deepEqual(pergunta.acoes, []);
});

test("ferramentas do assistente: editar em lote, orçamento e conta, com erros que a IA consegue corrigir", opcoes, async () => {
  const token = await cadastrar("ferramentas@teste.com");
  const usuario = await prisma.usuario.findUnique({ where: { email: "ferramentas@teste.com" } });
  const { criarFerramentas, rodarFerramenta } = await import("../src/servicos/ferramentas.js");
  const { confirmarAcao, desfazerAcao } = await import("../src/servicos/acoes.js");
  const ctx = { usuarioId: usuario.id, acoes: [], citados: new Map() };
  const ferramentas = criarFerramentas(ctx);
  const rodar = (nome, entrada) => rodarFerramenta(ferramentas.find((f) => f.nome === nome), entrada);

  const shell1 = (await chamar(token, "POST", "/transacoes", { valor: 200, data: "2026-10-01", descricao: "Posto Shell" })).corpo;
  const shell2 = (await chamar(token, "POST", "/transacoes", { valor: 180, data: "2026-10-09", descricao: "Posto Shell" })).corpo;
  const alheio = (await chamar(await cadastrar("ferramentas-outro@teste.com"), "POST", "/transacoes", { valor: 5, data: "2026-10-01", descricao: "Café" })).corpo;

  // Consulta acha os dois e devolve os ids
  const achados = JSON.parse((await rodar("consultar_lancamentos", {
    inicio: "2026-10-01", fim: "2026-10-31", tipo: "DESPESA", categorias: [], busca: "shell", conta: null, agrupar: "nenhum", ordenar: "recentes",
  })).texto);
  assert.equal(achados.total, 380);
  assert.deepEqual(achados.lancamentos.map((t) => t.id), [shell2.id, shell1.id]);

  // Erros voltam como texto para a IA corrigir: categoria que não existe, lançamento de outro usuário
  const semCategoria = await rodar("editar_lancamentos", {
    ids: [shell1.id], valor: null, descricao: null, data: null, categoria: "Gasolina", conta: null, repetir_todo_mes: null,
  });
  assert.equal(semCategoria.erro, true);
  assert.match(semCategoria.texto, /Opções: .*Transporte/);
  const deOutro = await rodar("apagar_lancamentos", { ids: [shell1.id, alheio.id] });
  assert.equal(deOutro.erro, true);
  assert.match(deOutro.texto, new RegExp(`não encontrados: ${alheio.id}`));

  // Editar em lote: proposta, confirmação, e desfazer volta tudo como era
  await rodar("editar_lancamentos", {
    ids: [shell1.id, shell2.id], valor: null, descricao: null, data: null, categoria: "transporte", conta: null, repetir_todo_mes: null,
  });
  const edicao = ctx.acoes.at(-1);
  assert.equal(edicao.situacao, "PENDENTE");
  assert.equal(edicao.resumo, "Mudar categoria para Transporte em 2 lançamentos");
  assert.equal((await prisma.transacao.findUnique({ where: { id: shell1.id }, include: { categoria: true } })).categoria?.nome ?? null, shell1.categoria?.nome ?? null);
  await confirmarAcao(usuario.id, edicao.id);
  const depois = await prisma.transacao.findMany({ where: { id: { in: [shell1.id, shell2.id] } }, include: { categoria: true } });
  assert.deepEqual(depois.map((t) => t.categoria.nome), ["Transporte", "Transporte"]);
  await desfazerAcao(usuario.id, edicao.id);
  const voltou = await prisma.transacao.findUnique({ where: { id: shell1.id } });
  assert.equal(voltou.categoriaId, shell1.categoria?.id ?? null);

  // Orçamento novo é na hora; mudar um que existe vira proposta, e desfazer volta ao valor antigo
  await rodar("definir_orcamento", { categoria: "Mercado", valor_mensal: 900 });
  assert.equal(ctx.acoes.at(-1).situacao, "FEITA");
  await rodar("definir_orcamento", { categoria: "Mercado", valor_mensal: 1100 });
  const mudanca = ctx.acoes.at(-1);
  assert.equal(mudanca.situacao, "PENDENTE");
  assert.match(mudanca.resumo, /de R\$\s900,00 para R\$\s1\.100,00/);
  await confirmarAcao(usuario.id, mudanca.id);
  const orcamento = () => prisma.orcamento.findFirst({ where: { usuarioId: usuario.id } });
  assert.equal(Number((await orcamento()).valorMensal), 1100);
  await desfazerAcao(usuario.id, mudanca.id);
  assert.equal(Number((await orcamento()).valorMensal), 900);

  // Conta: criar na hora; renomear com confirmação e desfazer
  await rodar("criar_conta", { nome: "Nubank", tipo: "CREDITO" });
  assert.equal((await rodar("criar_conta", { nome: "nubank", tipo: "CREDITO" })).erro, true, "não duplica");
  await rodar("alterar_conta", { conta: "nubank", acao: "renomear", novo_nome: "Nubank Roxinho" });
  const renomear = ctx.acoes.at(-1);
  await confirmarAcao(usuario.id, renomear.id);
  assert.equal((await prisma.conta.findFirst({ where: { usuarioId: usuario.id } })).nome, "Nubank Roxinho");
  await desfazerAcao(usuario.id, renomear.id);
  assert.equal((await prisma.conta.findFirst({ where: { usuarioId: usuario.id } })).nome, "Nubank");

  // Tudo fica registrado como histórico do assistente
  assert.equal(await prisma.acaoAssistente.count({ where: { usuarioId: usuario.id } }), 5);
});

test("assistente com IA: ferramentas estritas, esforço baixo, cache e o laço de ferramentas", opcoes, async () => {
  const http = await import("node:http");
  const { config } = await import("../src/config.js");
  const pedidos = [];
  const fake = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (parte) => (corpo += parte));
    req.on("end", () => {
      pedidos.push({ cabecalhos: req.headers, corpo: JSON.parse(corpo) });
      const primeira = pedidos.length === 1;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: `msg_${pedidos.length}`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: primeira
          ? [{ type: "tool_use", id: "toolu_1", name: "criar_lancamento", input: {
              tipo: "DESPESA", valor: 45, descricao: "Farmácia", data: null, categoria: "Saúde", conta: null, repetir_todo_mes: null,
            } }]
          : [{ type: "text", text: "Anotado: Farmácia, R$ 45,00 em Saúde." }],
        stop_reason: primeira ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000 },
      }));
    });
  });
  await new Promise((pronto) => fake.listen(0, pronto));
  Object.assign(process.env, { ANTHROPIC_BASE_URL: `http://localhost:${fake.address().port}`, ANTHROPIC_API_KEY: "teste" });
  config.ia.mock = false;
  try {
    const token = await cadastrar("chat-ia@teste.com");
    const { corpo } = await chamar(token, "POST", "/conversa", {
      mensagem: "comprei remédio, 45 reais",
      historico: [{ papel: "bolso", texto: "Oi!" }, { papel: "usuario", texto: "quanto gastei?" }, { papel: "bolso", texto: "R$ 10,00." }],
      referencias: "#999 Uber · 17/10 · R$ 23,15",
    });
    assert.equal(corpo.resposta, "Anotado: Farmácia, R$ 45,00 em Saúde.");
    assert.equal(corpo.acoes[0].situacao, "FEITA");
    assert.match(corpo.acoes[0].detalhes[0], /Farmácia .* Saúde/);

    const [primeiro, segundo] = pedidos;
    assert.equal(primeiro.corpo.model, "claude-sonnet-5-5");
    assert.deepEqual(primeiro.corpo.output_config, { effort: "low" });
    assert.equal(primeiro.corpo.fallbacks, "default");
    assert.match(primeiro.cabecalhos["anthropic-beta"], /server-side-fallback-2026-07-01/);
    assert.deepEqual(primeiro.corpo.cache_control, { type: "ephemeral" });
    assert.deepEqual(primeiro.corpo.system[0].cache_control, { type: "ephemeral" });
    assert.match(primeiro.corpo.system[1].text, /Categorias de gasto: .*Saúde/);
    for (const ferramenta of primeiro.corpo.tools) {
      assert.equal(ferramenta.strict, true, ferramenta.name);
      assert.equal(ferramenta.input_schema.additionalProperties, false, ferramenta.name);
      assert.equal(ferramenta.input_schema.$schema, undefined, ferramenta.name);
      assert.deepEqual(ferramenta.input_schema.required, Object.keys(ferramenta.input_schema.properties), ferramenta.name);
    }
    // Histórico começa pelo usuário; as referências vão junto da mensagem nova
    assert.deepEqual(primeiro.corpo.messages.map((m) => m.role), ["user", "assistant", "user"]);
    assert.match(primeiro.corpo.messages.at(-1).content[0].text, /#999 Uber/);
    // A segunda volta leva o resultado da ferramenta
    const resultado = segundo.corpo.messages.at(-1).content[0];
    assert.equal(resultado.type, "tool_result");
    assert.match(JSON.stringify(resultado.content), /Criado #\d+/);

    const usuario = await prisma.usuario.findUnique({ where: { email: "chat-ia@teste.com" } });
    const usos = await prisma.usoIa.findMany({ where: { usuarioId: usuario.id }, orderBy: { id: "asc" } });
    assert.deepEqual(usos.map((u) => u.tarefa), ["conversa", "conversa:ferramentas"]);
  } finally {
    config.ia.mock = true;
    fake.close();
  }
});
