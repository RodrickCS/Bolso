import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarFormato } from "../src/lib/formatos.js";
import { textoDoArquivo } from "../src/ia/extrair.js";

const csv = Buffer.from("Data;Descrição;Valor\n01/10/2026;UBER *TRIP;-23,15\n02/10/2026;PIX RECEBIDO;150,00\n");
const ofx = Buffer.from("OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRN><TRNAMT>-23.15</TRNAMT></STMTTRN></BANKMSGSRSV1></OFX>");

test("CSV é reconhecido com os tipos que o Android costuma mandar", () => {
  for (const tipo of ["text/comma-separated-values", "application/vnd.ms-excel", "application/octet-stream", "", undefined]) {
    assert.equal(detectarFormato(csv, tipo, "extrato.csv"), "text/csv", String(tipo));
  }
  assert.equal(detectarFormato(csv, "application/octet-stream", "extrato"), "text/csv", "sem extensão, pelo conteúdo");
});

test("OFX é reconhecido pelo conteúdo, com qualquer tipo ou extensão", () => {
  for (const [tipo, nome] of [["application/octet-stream", "extrato.ofx"], ["application/vnd.intu.qfx", "x.qfx"], ["text/plain", "extrato.txt"], ["", "arquivo"]]) {
    assert.equal(detectarFormato(ofx, tipo, nome), "application/x-ofx", `${tipo} ${nome}`);
  }
});

test("PDF e imagens pelo conteúdo; o resto continua recusado", () => {
  assert.equal(detectarFormato(Buffer.from("%PDF-1.4 ..."), "application/octet-stream", "fatura"), "application/pdf");
  assert.equal(detectarFormato(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]), "", "foto"), "image/jpeg");
  assert.equal(detectarFormato(Buffer.from("PK\u0003\u0004\u0000\u0000"), "application/zip", "a.zip"), "application/zip");
  assert.equal(detectarFormato(Buffer.from("oi"), "application/zip", "a.zip"), "application/zip");
  assert.equal(detectarFormato(Buffer.from([0, 1, 2]), "application/octet-stream", "planilha.csv"), "application/octet-stream", "binário com nome .csv");
});

test("arquivo do banco em Latin-1 mantém os acentos", () => {
  assert.equal(textoDoArquivo(Buffer.from("Descrição;Valor", "latin1")), "Descrição;Valor");
  assert.equal(textoDoArquivo(Buffer.from("Descrição;Valor", "utf8")), "Descrição;Valor");
});
