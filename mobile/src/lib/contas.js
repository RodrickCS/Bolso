export const TIPOS_CONTA = [
  { valor: "CREDITO", rotulo: "Cartão de crédito", icone: "card-outline" },
  { valor: "CORRENTE", rotulo: "Conta corrente", icone: "business-outline" },
  { valor: "POUPANCA", rotulo: "Poupança", icone: "trending-up-outline" },
  { valor: "DINHEIRO", rotulo: "Dinheiro", icone: "cash-outline" },
];

export const PELO_TIPO = Object.fromEntries(TIPOS_CONTA.map((t) => [t.valor, t]));
