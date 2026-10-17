// O mesmo gasto pode chegar duas vezes: pelo cupom (com os itens) e pela fatura ou
// extrato (o valor oficial do banco). A transação do banco fica valendo e a outra
// passa a apontar para ela, para não ser somada em dobro no painel.

const ORIGENS_BANCO = new Set(["FATURA", "EXTRATO"]);
const JANELA_DIAS = 3;
const UM_DIA = 24 * 60 * 60 * 1000;

const centavos = (valor) => Math.round(Number(valor) * 100);
const diasEntre = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / UM_DIA;

export const ehDoBanco = (transacao) => ORIGENS_BANCO.has(transacao.origem);

// Entre as candidatas, acha a que corresponde à transação nova (ou null).
// Só junta uma transação do banco com uma que não é do banco.
export function encontrarCorrespondente(nova, candidatas) {
  const compativeis = candidatas.filter(
    (c) =>
      c.id !== nova.id &&
      ehDoBanco(c) !== ehDoBanco(nova) &&
      c.tipo === nova.tipo &&
      centavos(c.valor) === centavos(nova.valor) &&
      diasEntre(c.data, nova.data) <= JANELA_DIAS &&
      !c.conciliadaComId,
  );
  compativeis.sort((a, b) => diasEntre(a.data, nova.data) - diasEntre(b.data, nova.data));
  return compativeis[0] ?? null;
}

// Mesma linha de fatura/extrato enviada de novo em outro arquivo
export function ehReenvio(nova, existentes) {
  return (
    ehDoBanco(nova) &&
    existentes.some(
      (e) =>
        ehDoBanco(e) &&
        e.documentoId !== nova.documentoId &&
        centavos(e.valor) === centavos(nova.valor) &&
        diasEntre(e.data, nova.data) === 0 &&
        e.descricao.toLowerCase() === nova.descricao.toLowerCase(),
    )
  );
}

// Devolve { duplicataId, oficialId } para gravar no banco, ou null
export function decidirConciliacao(nova, candidatas) {
  const outra = encontrarCorrespondente(nova, candidatas);
  if (!outra) return null;
  return ehDoBanco(nova)
    ? { duplicataId: outra.id, oficialId: nova.id }
    : { duplicataId: nova.id, oficialId: outra.id };
}
