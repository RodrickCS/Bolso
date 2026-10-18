// Página de consulta da NFC-e no layout usado por SP, RS, PR, BA e outros estados (dados fictícios)
// Chave de acesso de NFC-e (modelo 65) com o dígito verificador certo, para o número de nota pedido
export function gerarChave(numero = 123456) {
  const base = `3526101234567800019065001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  for (let i = 42, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  const resto = soma % 11;
  return base + (resto < 2 ? 0 : 11 - resto);
}

export const qrcodeDe = (chave) =>
  `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chave}|2|1|1|5A3C9E0F1B2D4E6A7C8B9D0E1F2A3B4C5D6E7F80`;

export const CHAVE = gerarChave();
export const QRCODE = qrcodeDe(CHAVE);

const item = (n, nome, codigo, qtd, un, unit, total) => `
  <tr id="Item + ${n}">
    <td valign="top">
      <span class="txtTit">${nome}</span>
      <span class="RCod">(Código: ${codigo} )</span><br>
      <span class="Rqtd"><strong>Qtde.:</strong>${qtd}</span>
      <span class="RUN"><strong>UN: </strong>${un}</span>
      <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;${unit}</span>
    </td>
    <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br><span class="valor">${total}</span></td>
  </tr>`;

export function paginaNfce({ data = "17/10/2026", itens } = {}) {
  const linhas = itens ?? [
    ["CAFE PILAO TRAD 500G", "7896089011906", "1", "UN", "21,9", "21,90"],
    ["BANANA PRATA KG", "2000001", "1,2000", "KG", "7", "8,40"],
    ["LEITE ITALAC INT 1L", "7898080640017", "4", "UN", "5,19", "20,76"],
    ["PÃO FRANCÊS KG", "2000002", "0,4500", "KG", "15,9", "7,16"],
  ];
  return `<!DOCTYPE html>
<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><title>NFC-e</title>
<script>var x = "nada aqui";</script><style>.txtTit{font-weight:bold}</style></head>
<body><div id="conteudo">
  <div class="txtCenter">
    <div id="u20" class="txtTopo">SUPERMERCADO BOM PRECO LTDA</div>
    <div class="text">CNPJ: 12.345.678/0001-90</div>
    <div class="text">RUA DAS FLORES, 100, , CENTRO, SAO PAULO, SP</div>
  </div>
  <table id="tabResult" cellspacing="0" cellpadding="0">${linhas.map((l, i) => item(i + 1, ...l)).join("")}</table>
  <div id="totalNota" class="txtRight">
    <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">${linhas.length}</span></div>
    <div id="linhaTotal"><label>Valor total R$:</label><span class="totalNumb">58,22</span></div>
    <div id="linhaTotal"><label>Descontos R$:</label><span class="totalNumb">1,00</span></div>
    <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">57,22</span></div>
    <div id="linhaForma"><label>Forma de pagamento:</label><span class="totalNumb txtTitR">Valor pago R$:</span></div>
    <div id="linhaTotal"><label class="tx">Cartão de Débito</label><span class="totalNumb">57,22</span></div>
  </div>
  <div data-role="collapsible" id="infos"><h4>Informações gerais da Nota</h4>
    <ul data-role="listview"><li><strong>Número: </strong>123456<strong> Série: </strong>1<strong> Emissão: </strong>${data} 14:32:10 - Via Consumidor</li></ul>
  </div>
</div></body></html>`;
}
