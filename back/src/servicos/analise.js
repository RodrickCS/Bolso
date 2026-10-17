// Análises dos gastos feitas só com código (sem IA e sem banco): assinaturas, previsão,
// comparações, orçamentos e gastos fora do padrão. A IA só reescreve o resultado em dicas.
import { normalizarEstabelecimento } from "./texto.js";

const UM_DIA = 24 * 60 * 60 * 1000;
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Espaço que não quebra entre "R$" e o número, para o valor nunca ficar partido em duas linhas
export const reais = (valor) =>
  `R$\u00a0${Number(valor).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const arredondar = (valor) => Math.round(valor * 100) / 100;
const chaveMes = (data) => data.toISOString().slice(0, 7);
const diaMes = (data) => `${data.toISOString().slice(8, 10)}/${data.toISOString().slice(5, 7)}`;

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function mesesEntre(a, b) {
  const [anoA, mesA] = a.split("-").map(Number);
  const [anoB, mesB] = b.split("-").map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

// Assinatura = mesmo estabelecimento, valor quase igual (até 10% de diferença), no máximo 2 cobranças por mês,
// em pelo menos 2 meses próximos. Uber e mercado ficam de fora por aparecerem muitas vezes no mês.
export function detectarAssinaturas(transacoes, hoje) {
  const grupos = new Map();
  for (const t of transacoes) {
    if (t.tipo !== "DESPESA" || t.parcelaTotal) continue;
    const chave = normalizarEstabelecimento(t.estabelecimento ?? t.descricao);
    if (!chave) continue;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(t);
  }

  const assinaturas = [];
  for (const [chave, lista] of grupos) {
    const porMes = new Map();
    for (const t of lista) porMes.set(chaveMes(t.data), (porMes.get(chaveMes(t.data)) ?? 0) + 1);
    const meses = [...porMes.keys()].sort();
    if (meses.length < 2 || Math.max(...porMes.values()) > 2) continue;
    if (meses.some((mes, i) => i > 0 && mesesEntre(meses[i - 1], mes) > 2)) continue;

    const valores = lista.map((t) => Number(t.valor));
    const valorTipico = mediana(valores);
    // Assinatura quase não muda de valor (no máximo um reajuste); compras de mercado variam bem mais
    const parecidos = valores.filter((v) => Math.abs(v - valorTipico) <= valorTipico * 0.1).length;
    if (parecidos / valores.length < 0.8) continue;

    const ultima = lista.reduce((a, b) => (b.data > a.data ? b : a));
    assinaturas.push({
      chave,
      nome: ultima.descricao,
      categoria: ultima.categoria ?? null,
      valorMensal: arredondar(valorTipico),
      ultimaCobranca: ultima.data.toISOString().slice(0, 10),
      meses: meses.length,
      ativa: (hoje.getTime() - ultima.data.getTime()) / UM_DIA <= 45,
    });
  }
  return assinaturas.sort((a, b) => b.valorMensal - a.valorMensal);
}

// "Fatos" do mês, cada um com um texto pronto. Funcionam sozinhos se a IA estiver indisponível.
// atuais: despesas do mês; anteriores: despesas do mês anterior; historico: despesas dos 90 dias antes do mês.
export function calcularFatos({ mes, hoje, atuais, anteriores, historico, orcamentos = [], assinaturas = [] }) {
  const fatos = [];
  const [ano, numero] = mes.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  const ehMesAtual = chaveMes(hoje) === mes;
  const dia = ehMesAtual ? hoje.getUTCDate() : diasNoMes;
  const nomeMesAnterior = MESES[(numero + 10) % 12];
  const soma = (lista) => lista.reduce((total, t) => total + Number(t.valor), 0);

  // Compara com o mês anterior até o mesmo dia, para não comparar meio mês com mês inteiro
  const diasMesAnterior = new Date(Date.UTC(ano, numero - 1, 0)).getUTCDate();
  const anterioresAteODia = anteriores.filter((t) => t.data.getUTCDate() <= Math.min(dia, diasMesAnterior));
  const total = soma(atuais);
  const totalAnterior = soma(anterioresAteODia);
  const periodo = ehMesAtual ? `no mesmo período de ${nomeMesAnterior}` : `em ${nomeMesAnterior}`;

  if (total > 0 && totalAnterior > 0) {
    const variacao = Math.round(((total - totalAnterior) / totalAnterior) * 100);
    if (Math.abs(variacao) >= 5) {
      fatos.push({
        tipo: "comparacao",
        prioridade: 50,
        texto: `${ehMesAtual ? "Até agora você gastou" : "Você gastou"} ${reais(total)}, ${Math.abs(variacao)}% ${variacao > 0 ? "a mais" : "a menos"} que ${periodo}.`,
      });
    }
  }

  if (ehMesAtual && dia >= 5 && dia < diasNoMes && total > 0) {
    fatos.push({
      tipo: "previsao",
      prioridade: 60,
      texto: `No ritmo atual, você deve fechar o mês com cerca de ${reais((total / dia) * diasNoMes)} em gastos.`,
    });
  }

  const porCategoria = (lista) => {
    const mapa = new Map();
    for (const t of lista) mapa.set(t.categoria ?? "Sem categoria", (mapa.get(t.categoria ?? "Sem categoria") ?? 0) + Number(t.valor));
    return mapa;
  };
  const categoriasAtuais = porCategoria(atuais);
  const categoriasAnteriores = porCategoria(anterioresAteODia);
  const aumentos = [...categoriasAtuais]
    .map(([categoria, valor]) => ({ categoria, valor, antes: categoriasAnteriores.get(categoria) ?? 0 }))
    .filter(({ valor, antes }) => antes > 0 && valor - antes >= 50 && (valor - antes) / antes >= 0.3)
    .sort((a, b) => b.valor - b.antes - (a.valor - a.antes))
    .slice(0, 2);
  for (const { categoria, valor, antes } of aumentos) {
    fatos.push({
      tipo: "variacao",
      prioridade: 70,
      texto: `Você gastou ${reais(valor)} com ${categoria}, ${Math.round(((valor - antes) / antes) * 100)}% a mais que ${periodo}.`,
    });
  }

  for (const o of orcamentos) {
    if (o.percentual >= 100) {
      fatos.push({
        tipo: "orcamento",
        prioridade: 90,
        texto: `Você passou do orçamento de ${o.categoria}: ${reais(o.gasto)} de ${reais(o.limite)}.`,
      });
    } else if (o.percentual >= 80) {
      fatos.push({
        tipo: "orcamento",
        prioridade: 80,
        texto: `Você já usou ${Math.round(o.percentual)}% do orçamento de ${o.categoria} (${reais(o.gasto)} de ${reais(o.limite)}).`,
      });
    }
  }

  // Fora do padrão: pelo menos 3x a mediana da categoria nos 90 dias anteriores (com histórico suficiente)
  const historicoPorCategoria = new Map();
  for (const t of historico) {
    const categoria = t.categoria ?? "Sem categoria";
    if (!historicoPorCategoria.has(categoria)) historicoPorCategoria.set(categoria, []);
    historicoPorCategoria.get(categoria).push(Number(t.valor));
  }
  const foraDoPadrao = atuais
    .filter((t) => {
      const valores = historicoPorCategoria.get(t.categoria ?? "Sem categoria") ?? [];
      return valores.length >= 5 && Number(t.valor) >= 100 && Number(t.valor) >= 3 * mediana(valores);
    })
    .sort((a, b) => Number(b.valor) - Number(a.valor))[0];
  if (foraDoPadrao) {
    fatos.push({
      tipo: "fora_do_padrao",
      prioridade: 65,
      texto: `Gasto fora do padrão em ${diaMes(foraDoPadrao.data)}: ${reais(foraDoPadrao.valor)} em ${foraDoPadrao.descricao} (${foraDoPadrao.categoria ?? "sem categoria"}), bem acima do seu normal nessa categoria.`,
    });
  } else if (atuais.length >= 3) {
    const maior = atuais.reduce((a, b) => (Number(b.valor) > Number(a.valor) ? b : a));
    fatos.push({
      tipo: "maior_gasto",
      prioridade: 20,
      texto: `Seu maior gasto do mês foi ${reais(maior.valor)} em ${maior.descricao}.`,
    });
  }

  const ativas = assinaturas.filter((a) => a.ativa);
  if (ativas.length > 0) {
    const totalMensal = ativas.reduce((soma, a) => soma + a.valorMensal, 0);
    fatos.push({
      tipo: "assinaturas",
      prioridade: 40,
      texto: `Encontrei ${ativas.length} ${ativas.length === 1 ? "cobrança recorrente" : "cobranças recorrentes"} (${ativas.map((a) => a.nome).slice(0, 3).join(", ")}) que somam ${reais(totalMensal)} por mês.`,
    });
  }
  for (const a of assinaturas.filter((a) => !a.ativa).slice(0, 1)) {
    fatos.push({
      tipo: "assinatura_parada",
      prioridade: 30,
      texto: `A cobrança de ${a.nome} (${reais(a.valorMensal)}) não aparece desde ${diaMes(new Date(`${a.ultimaCobranca}T00:00:00Z`))}.`,
    });
  }

  return fatos.sort((a, b) => b.prioridade - a.prioridade);
}
