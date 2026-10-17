// Boas-vindas do painel. Tudo calculado no celular: sem IA, sem custo e instantâneo.
// A frase muda de um dia para o outro, mas fica fixa durante o mesmo período do dia.

const FRASES = {
  manha: [
    "Quais os planos pra hoje?",
    "Café tomado? Bora ver como estão as contas.",
    "Um bom dia começa com o bolso em dia.",
    "Que hoje seja leve, inclusive para a carteira.",
  ],
  tarde: [
    "Como está sendo o dia?",
    "Gastou algo no almoço? Me conta que eu anoto.",
    "Que tal uma olhadinha rápida nos gastos?",
    "Metade do dia já foi. E as contas, como estão?",
  ],
  noite: [
    "Como foi o dia?",
    "Antes de dormir, que tal registrar os gastos de hoje?",
    "Hora de descansar. Seus gastos estão organizados por aqui.",
    "Teve alguma compra hoje? Anota aqui rapidinho.",
  ],
  madrugada: [
    "Seus gastos estão em dia por aqui. Pode descansar.",
    "Lembrou de algum gasto agora? Anota antes que esqueça.",
  ],
};

// Momentos especiais têm prioridade sobre a frase do período
const ESPECIAIS = [
  { quando: ({ dia }) => dia <= 3, frases: ["Mês novo, orçamento novo. Bora começar bem?", "Começo de mês: ótima hora para revisar os orçamentos."] },
  { quando: ({ dia, diasNoMes }) => diasNoMes - dia < 3, frases: ["Reta final do mês. Vamos fechar no azul?", "Últimos dias do mês: dá uma olhada na previsão do assistente."] },
  { quando: ({ semana, periodo }) => semana === 1 && periodo === "manha", frases: ["Semana nova! Que tal começar de olho nos gastos?"] },
  { quando: ({ semana, periodo }) => semana === 5 && (periodo === "tarde" || periodo === "noite"), frases: ["Sextou! Que tal um limite para o fim de semana?"] },
];

function periodoDoDia(hora) {
  if (hora >= 5 && hora < 12) return "manha";
  if (hora >= 12 && hora < 18) return "tarde";
  if (hora >= 18) return "noite";
  return "madrugada";
}

const TITULOS = { manha: "Bom dia", tarde: "Boa tarde", noite: "Boa noite", madrugada: "Ainda por aqui" };

// Número estável a partir de um texto, para escolher a frase do dia sem sortear a cada abertura
function hash(texto) {
  let valor = 0;
  for (const letra of texto) valor = (valor * 31 + letra.charCodeAt(0)) >>> 0;
  return valor;
}

export function saudacao(nomeCompleto, agora = new Date()) {
  const nome = nomeCompleto?.trim().split(/\s+/)[0];
  const periodo = periodoDoDia(agora.getHours());
  const contexto = {
    periodo,
    dia: agora.getDate(),
    semana: agora.getDay(),
    diasNoMes: new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate(),
  };
  const opcoes = ESPECIAIS.find((e) => e.quando(contexto))?.frases ?? FRASES[periodo];
  const chave = `${agora.getFullYear()}-${agora.getMonth()}-${agora.getDate()}-${periodo}`;
  const titulo = TITULOS[periodo];

  return {
    titulo: nome ? `${titulo}, ${nome}${periodo === "madrugada" ? "?" : ""}` : `${titulo}${periodo === "madrugada" ? "?" : ""}`,
    frase: opcoes[hash(chave) % opcoes.length],
  };
}
