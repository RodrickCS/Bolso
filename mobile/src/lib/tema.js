// Design tokens do Bolso, em três camadas (só tema claro, como definido em app.json):
// 1. Primitivos: os valores brutos (paleta, escalas). As telas não usam esta camada direto.
// 2. Semânticos: o papel de cada valor (fundo, texto, marca...). É o que as telas usam.
// 3. Componentes: medidas de peças repetidas (botão, campo, cartão, chip).
// Nenhuma tela escreve cor em hex ou tamanho solto: tudo sai daqui.

// ─── 1. Primitivos ─────────────────────────────────────────────────────────────

const paleta = {
  branco: "#ffffff",
  preto: "#000000",
  cinza50: "#f6f7f5",
  cinza200: "#e7e7e3",
  cinza400: "#a8a6a1",
  cinza500: "#7a7974",
  cinza700: "#52514e",
  cinza800: "#1f2937",
  cinza950: "#0b0b0b",
  verde50: "#e8f5ee",
  verde100: "#cfe9dc",
  verde600: "#1a8a5c",
  verde800: "#0f5c3d",
  verde300: "#6ee7b7",
  vermelho50: "#fdecea",
  vermelho100: "#f8dede",
  vermelho300: "#fca5a5",
  vermelho600: "#d03b3b",
  vermelho700: "#b42318",
  ambar50: "#fdf0d2",
  ambar400: "#fab219",
  // Paleta categórica dos gráficos (validada para daltonismo; ver componentes/graficos.js)
  azulDados: "#2a78d6",
  laranjaDados: "#eb6834",
  verdeDados: "#1baf7a",
  amareloDados: "#eda100",
  rosaDados: "#e87ba4",
};

const transparente = (opacidade) => `rgba(0,0,0,${opacidade})`;

// Escala de 4 em 4 pontos
const escala = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48 };

// ─── 2. Semânticos ─────────────────────────────────────────────────────────────

export const cores = {
  fundo: paleta.cinza50,
  superficie: paleta.branco,
  borda: paleta.cinza200,
  texto: paleta.cinza950,
  textoSecundario: paleta.cinza700,
  textoSuave: paleta.cinza500,
  // Marca. A cor das barras e medidores foi validada para contraste >= 3:1 sobre o branco.
  marca: paleta.verde600,
  marcaSuave: paleta.verde50,
  marcaEscura: paleta.verde800,
  // Texto e ícones sobre a cor da marca (botões, cartão verde, abertura)
  sobreMarca: paleta.branco,
  sobreMarcaSuave: paleta.verde100,
  // Texto e ícones sobre fundos escuros que não são da marca (câmera, aviso rápido)
  sobreEscuro: paleta.branco,
  erro: paleta.vermelho700,
  erroSuave: paleta.vermelho50,
  // Situação do orçamento (sempre acompanhada de ícone e texto, nunca só a cor)
  alerta: paleta.ambar400,
  alertaSuave: paleta.ambar50,
  critico: paleta.vermelho600,
  criticoSuave: paleta.vermelho100,
  // Camadas por cima do conteúdo
  veu: transparente(0.4),
  veuForte: transparente(0.55),
  camera: paleta.preto,
  sombra: paleta.preto,
  // Aviso rápido (toast): faixa escura com ícone colorido
  toastFundo: paleta.cinza800,
  toastSucesso: paleta.verde300,
  toastErro: paleta.vermelho300,
  // Gráficos: cores das categorias em ordem fixa e o cinza de "Outros"
  dados: [paleta.azulDados, paleta.laranjaDados, paleta.verdeDados, paleta.amareloDados, paleta.rosaDados],
  dadosOutros: paleta.cinza400,
};

// Espaçamento: xs 4 · p 8 · pm 12 · m 16 · g 24 · gg 32 · ggg 48
export const espaco = { xs: escala[1], p: escala[2], pm: escala[3], m: escala[4], g: escala[6], gg: escala[8], ggg: escala[12] };

export const raios = { xs: 4, p: 8, m: 12, g: 16, xg: 24, pilula: 999 };

// Tamanhos de texto: 8 passos no lugar dos 17 que existiam
export const fonte = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, numero: 36, heroi: 44 };
export const peso = { regular: "400", medio: "600", forte: "700" };
export const entrelinha = { sm: 20, md: 24 };

// Sombra para o que flutua sobre a tela (botão +, avisos)
export const sombras = {
  flutuante: {
    shadowColor: cores.sombra,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
};

// ─── 3. Componentes ────────────────────────────────────────────────────────────

export const componentes = {
  // Área mínima de toque (Apple 44pt, Material 48dp)
  toqueMinimo: 44,
  botao: { altura: 48, raio: raios.m, paddingHorizontal: espaco.m },
  campo: { altura: 48, raio: raios.m, paddingHorizontal: espaco.m },
  chip: { altura: 40, raio: raios.pilula, paddingHorizontal: espaco.pm },
  cartao: { padding: espaco.m, raio: raios.m, raioDestaque: raios.g },
  folha: { raio: raios.xg },
  // Círculos de ícone nas listas e nos cartões
  iconeLista: 40,
  iconePequeno: 32,
  grafico: { rotulo: 11 },
};
