// Ícone de cada categoria padrão (as criadas pelo usuário ficam com o genérico)
const ICONES = {
  Mercado: "cart-outline",
  "Restaurantes e delivery": "restaurant-outline",
  Transporte: "car-outline",
  Moradia: "home-outline",
  "Contas da casa": "flash-outline",
  Saúde: "medkit-outline",
  Educação: "school-outline",
  Lazer: "game-controller-outline",
  Compras: "bag-handle-outline",
  Assinaturas: "repeat-outline",
  "Cuidados pessoais": "body-outline",
  Pets: "paw-outline",
  "Impostos e taxas": "document-text-outline",
  Transferências: "swap-horizontal-outline",
  Salário: "wallet-outline",
  "Renda extra": "cash-outline",
  "Outras receitas": "add-circle-outline",
};
export const iconeCategoria = (nome) => ICONES[nome] ?? "pricetag-outline";
