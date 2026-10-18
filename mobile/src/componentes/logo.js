import Svg, { Circle, G, Path, Text as TextoSvg } from "react-native-svg";
import { View } from "react-native";
import { MARCA } from "../lib/marca";

// O desenho ocupa 82% da imagem, como na splash nativa e nos ícones
const ESCALA = 0.82;
const AJUSTE = `translate(${(100 - 100 * ESCALA) / 2} ${(100 - 100 * ESCALA) / 2}) scale(${ESCALA})`;

export function Moeda({ tamanho }) {
  const { x, y, raio } = MARCA.moedaCentro;
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
      <G transform={AJUSTE}>
        <Circle cx={x} cy={y} r={raio} fill={MARCA.moeda} stroke={MARCA.moedaBorda} strokeWidth={2} />
        <TextoSvg
          x={x}
          y={MARCA.cifrao.y}
          fontSize={MARCA.cifrao.tamanho}
          fontWeight="700"
          fill={MARCA.moedaBorda}
          textAnchor="middle"
          fontFamily="sans-serif"
        >
          $
        </TextoSvg>
      </G>
    </Svg>
  );
}

// corCostura: verde no fundo verde (padrão), ou outra cor quando o bolso fica sobre um fundo claro
export function Bolso({ tamanho, cor = "#fff", corCostura = MARCA.verde }) {
  const costura = { stroke: corCostura, strokeWidth: 2.2, fill: "none", strokeDasharray: "4.5 3.5", strokeLinecap: "round" };
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
      <G transform={AJUSTE}>
        <Path d={MARCA.bolso} fill={cor} />
        <Path d={MARCA.costura} {...costura} />
        <Path d={MARCA.bainha} {...costura} />
      </G>
    </Svg>
  );
}

// Ícone do app: o bolso com a moeda num quadrado verde arredondado
export function LogoBolso({ tamanho = 64 }) {
  return (
    <View
      style={{ width: tamanho, height: tamanho, borderRadius: tamanho * 0.28, backgroundColor: MARCA.verde, overflow: "hidden" }}
      accessible
      accessibilityLabel="Bolso"
    >
      <View style={{ position: "absolute", top: 0, left: 0 }}>
        <Moeda tamanho={tamanho} />
      </View>
      <View style={{ position: "absolute", top: 0, left: 0 }}>
        <Bolso tamanho={tamanho} />
      </View>
    </View>
  );
}
