import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as TextoSvg } from "react-native-svg";
import { diaMes, reais, variacao } from "../lib/formato";
import { cores, espaco, fonte, peso, componentes } from "../lib/tema";
import { Cartao } from "./ui";

// Seta + percentual. Preço subindo é ruim para o bolso: seta vermelha; descendo, verde.
// O número fica na cor do texto; a cor vai só no ícone e nunca é a única pista (tem a seta e o sinal).
export function Variacao({ percentual, tamanho = 14 }) {
  if (percentual === null || percentual === undefined) return null;
  const icone = percentual > 0 ? "arrow-up" : percentual < 0 ? "arrow-down" : "remove";
  const cor = percentual > 0 ? cores.critico : percentual < 0 ? cores.marca : cores.textoSuave;
  return (
    <View style={estilos.variacao}>
      <Ionicons name={icone} size={tamanho} color={cor} />
      <Text style={[estilos.variacaoTexto, { fontSize: tamanho + 1 }]}>{variacao(percentual)}</Text>
    </View>
  );
}

// Atalho no painel para a tela de preços
export function CartaoPrecos({ dados, aoTocar }) {
  if (!dados?.produtos.length) return null;
  const { inflacao, produtos } = dados;
  return (
    <Pressable onPress={aoTocar} accessibilityRole="button">
      <Cartao style={estilos.atalho}>
        <Ionicons name="pricetags-outline" size={22} color={cores.marca} />
        <View style={{ flex: 1, gap: espaco.xs }}>
          <Text style={estilos.atalhoTitulo}>Preços dos seus produtos</Text>
          <Text style={estilos.atalhoTexto}>
            {inflacao
              ? `Sua inflação pessoal: ${variacao(inflacao.percentual)} em ${inflacao.produtos} produtos`
              : `${produtos.length} ${produtos.length === 1 ? "produto acompanhado" : "produtos acompanhados"}`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={cores.textoSuave} />
      </Cartao>
    </Pressable>
  );
}

// Escala "redonda" para o eixo: 3 ou 4 marcas em valores fáceis de ler (5, 10, 20, 25, 50...)
function marcasDoEixo(minimo, maximo) {
  if (minimo === maximo) {
    minimo *= 0.9;
    maximo *= 1.1;
  }
  const bruto = (maximo - minimo) / 3;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
  const inicio = Math.floor(minimo / passo) * passo;
  const marcas = [];
  for (let v = inicio; v < maximo + passo; v += passo) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

const ALTURA = 170;
const MARGEM = { cima: 12, baixo: 24, esquerda: 44, direita: 64 };

// Preço unitário ao longo do tempo: linha de 2px, um ponto por compra e o último valor escrito na ponta
export function GraficoPreco({ historico }) {
  const [largura, setLargura] = useState(0);
  if (historico.length < 2) return null;

  const tempo = historico.map((h) => new Date(`${h.data}T00:00:00Z`).getTime());
  const precos = historico.map((h) => h.preco);
  const marcas = marcasDoEixo(Math.min(...precos), Math.max(...precos));
  const [base, topo] = [marcas[0], marcas.at(-1)];
  const [inicio, fim] = [tempo[0], tempo.at(-1)];

  const areaX = largura - MARGEM.esquerda - MARGEM.direita;
  const areaY = ALTURA - MARGEM.cima - MARGEM.baixo;
  const x = (t) => MARGEM.esquerda + (fim === inicio ? areaX : ((t - inicio) / (fim - inicio)) * areaX);
  const y = (p) => MARGEM.cima + (1 - (p - base) / (topo - base)) * areaY;
  const pontos = historico.map((h, i) => ({ x: x(tempo[i]), y: y(h.preco) }));
  const ultimo = pontos.at(-1);
  const valorEixo = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });

  return (
    <View
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      style={{ height: ALTURA }}
      accessible
      accessibilityLabel={`Preço de ${reais(precos[0])} em ${diaMes(historico[0].data)} para ${reais(precos.at(-1))} em ${diaMes(historico.at(-1).data)}`}
    >
      {largura > 0 && (
        <Svg width={largura} height={ALTURA}>
          {marcas.map((m) => (
            <Line key={`g${m}`} x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(m)} y2={y(m)} stroke={cores.borda} strokeWidth={1} />
          ))}
          {marcas.map((m) => (
            <TextoSvg key={`t${m}`} x={MARGEM.esquerda - 8} y={y(m) + 4} fontSize={componentes.grafico.rotulo} fontFamily="sans-serif" fill={cores.textoSecundario} textAnchor="end">
              {valorEixo(m)}
            </TextoSvg>
          ))}
          <TextoSvg x={MARGEM.esquerda} y={ALTURA - 6} fontSize={componentes.grafico.rotulo} fontFamily="sans-serif" fill={cores.textoSecundario}>
            {diaMes(historico[0].data)}
          </TextoSvg>
          <TextoSvg x={largura - MARGEM.direita} y={ALTURA - 6} fontSize={componentes.grafico.rotulo} fontFamily="sans-serif" fill={cores.textoSecundario} textAnchor="end">
            {diaMes(historico.at(-1).data)}
          </TextoSvg>

          <Polyline
            points={pontos.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={cores.marca}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {pontos.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={4} fill={cores.marca} stroke={cores.superficie} strokeWidth={2} />
          ))}
          <TextoSvg x={ultimo.x + 8} y={ultimo.y + 4} fontSize={fonte.xs} fontWeight={peso.medio} fontFamily="sans-serif" fill={cores.texto}>
            {reais(precos.at(-1))}
          </TextoSvg>
        </Svg>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  variacao: { flexDirection: "row", alignItems: "center", gap: espaco.xs },
  variacaoTexto: { fontWeight: peso.medio, color: cores.texto, fontVariant: ["tabular-nums"] },
  atalho: { flexDirection: "row", alignItems: "center", gap: espaco.pm, marginTop: espaco.p },
  atalhoTitulo: { fontSize: fonte.md, fontWeight: peso.forte, color: cores.texto },
  atalhoTexto: { fontSize: fonte.sm, color: cores.textoSecundario },
});
