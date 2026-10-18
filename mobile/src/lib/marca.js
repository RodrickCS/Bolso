// Desenho da marca do Bolso (um bolso de calça com uma moeda saindo), numa grade de 100x100.
// O mesmo desenho gera os ícones do app e aparece na tela de abertura.
export const MARCA = {
  verde: "#1a8a5c",
  verdeEscuro: "#0f5c3d",
  moeda: "#f5b82e",
  moedaBorda: "#d99a12",
  // Moeda atrás do bolso, com a metade de cima aparecendo
  moedaCentro: { x: 60, y: 30, raio: 13 },
  bolso: "M20 34 H80 V62 Q80 69 74 72.5 L54.5 83.5 Q50 86 45.5 83.5 L26 72.5 Q20 69 20 62 Z",
  // Costura: o contorno de dentro e a bainha de cima, tracejados
  costura: "M26 46 V61 Q26 65.5 30 67.8 L48 78 Q50 79.2 52 78 L70 67.8 Q74 65.5 74 61 V46",
  bainha: "M26 41 H74",
};
