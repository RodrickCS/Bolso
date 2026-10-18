import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveValida, decodificarPagina, enderecoDaSefaz, lerPaginaNfce, lerQrCode, nomeLegivel, paginaSemNota, textoDaPagina } from "../src/lib/nfce.js";
import { CHAVE, QRCODE, paginaNfce } from "./fixtures/nfce.js";

test("lê a chave do QR Code e confere o dígito verificador", () => {
  assert.equal(chaveValida(CHAVE), true);
  assert.equal(chaveValida(CHAVE.slice(0, 43) + "0"), false);
  assert.deepEqual(lerQrCode(QRCODE), { url: new URL(QRCODE).toString(), chave: CHAVE });
  // Formato antigo, com a chave em chNFe
  assert.equal(lerQrCode(`http://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?chNFe=${CHAVE}&nVersao=100&tpAmb=1`).chave, CHAVE);
  assert.equal(lerQrCode("https://pix.exemplo.com/abc"), null, "QR de outra coisa");
  assert.equal(lerQrCode(QRCODE.replace(CHAVE, CHAVE.slice(0, 20) + "55" + CHAVE.slice(22))), null, "NF-e (modelo 55) ou chave inválida");
  assert.equal(lerQrCode("só texto"), null);
});

test("o servidor só abre endereços do governo", () => {
  assert.equal(enderecoDaSefaz(QRCODE), true);
  assert.equal(enderecoDaSefaz("http://169.254.169.254/latest"), false);
  assert.equal(enderecoDaSefaz("https://gov.br.exemplo.com/x"), false);
  assert.equal(enderecoDaSefaz("file:///etc/passwd"), false);
});

test("lê loja, data, total com desconto e itens da página da SEFAZ", () => {
  const html = decodificarPagina(Buffer.from(paginaNfce(), "latin1"), "text/html");
  const nota = lerPaginaNfce(html);
  assert.deepEqual(
    { loja: nota.loja, cnpj: nota.cnpj, data: nota.data, total: nota.total },
    { loja: "SUPERMERCADO BOM PRECO LTDA", cnpj: "12.345.678/0001-90", data: "2026-10-17", total: 57.22 },
  );
  assert.deepEqual(nota.itens, [
    { descricao: "CAFE PILAO TRAD 500G", quantidade: 1, unidade: "UN", precoTotal: 21.9 },
    { descricao: "BANANA PRATA KG", quantidade: 1.2, unidade: "KG", precoTotal: 8.4 },
    { descricao: "LEITE ITALAC INT 1L", quantidade: 4, unidade: "UN", precoTotal: 20.76 },
    { descricao: "PÃO FRANCÊS KG", quantidade: 0.45, unidade: "KG", precoTotal: 7.16 },
  ]);
});

test("layout desconhecido devolve null e vira texto limpo para a IA", () => {
  const html = "<html><head><script>lixo()</script></head><body><h1>Cupom</h1><p>ARROZ 5KG 27,90</p></body></html>";
  assert.equal(lerPaginaNfce(html), null);
  assert.equal(textoDaPagina(html), "Cupom ARROZ 5KG 27,90");
  assert.equal(paginaSemNota("NFC-e não encontrada na base da SEFAZ"), true);
  assert.equal(paginaSemNota(textoDaPagina(paginaNfce())), false);
});

test("nome da loja legível", () => {
  assert.equal(nomeLegivel("SUPERMERCADO BOM PRECO LTDA"), "Supermercado Bom Preco");
  assert.equal(nomeLegivel("DROGARIA SAO PAULO S.A."), "Drogaria Sao Paulo");
  assert.equal(nomeLegivel("PADARIA E CONFEITARIA DA ESQUINA ME"), "Padaria e Confeitaria da Esquina");
});
