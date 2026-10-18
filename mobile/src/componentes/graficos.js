import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as TextoSvg } from "react-native-svg";
import { reais } from "../lib/formato";
import { cores } from "../lib/tema";

// Cores das fatias, em ordem fixa (paleta categórica validada: separação para daltonismo e entre vizinhas).
// "Outros" junta o resto em cinza. Como três tons ficam abaixo de 3:1 no branco, a legenda sempre mostra nome e valor.
export const CORES_FATIAS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export const COR_OUTROS = "#a8a6a1";

// Até 5 categorias com cor própria; o resto (e a categoria "Outros") vira uma fatia só
export function fatiasDoMes(porCategoria, total) {
  const proprias = porCategoria.filter((c) => c.categoria !== "Outros").slice(0, 5);
  const resto = total - proprias.reduce((soma, c) => soma + c.total, 0);
  const fatias = proprias.map((c, i) => ({ chave: String(c.categoriaId ?? c.categoria), nome: c.categoria, total: c.total, cor: CORES_FATIAS[i] }));
  if (resto > 0.004) fatias.push({ chave: "outros", nome: "Outros", total: Math.round(resto * 100) / 100, cor: COR_OUTROS });
  return fatias.map((f) => ({ ...f, percentual: total ? (f.total / total) * 100 : 0 }));
}

// Rosca de parte do todo: anel fino, 2px de folga entre as fatias e o total no meio
export function Rosca({ fatias, total, legenda, tamanho = 148 }) {
  const espessura = 16;
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const folga = fatias.length > 1 ? 2 : 0;
  // Onde cada fatia começa no anel: soma das anteriores
  const inicios = fatias.map((_, i) => fatias.slice(0, i).reduce((soma, f) => soma + (f.percentual / 100) * circunferencia, 0));

  return (
    <View style={{ width: tamanho, height: tamanho }} accessible accessibilityLabel={`Total de ${reais(total)}`}>
      <Svg width={tamanho} height={tamanho}>
        <Circle cx={tamanho / 2} cy={tamanho / 2} r={raio} stroke={cores.borda} strokeWidth={espessura} fill="none" opacity={fatias.length ? 0 : 1} />
        {fatias.map((f, i) => {
          const comprimento = (f.percentual / 100) * circunferencia;
          return (
            <Circle
              key={f.chave}
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              stroke={f.cor}
              strokeWidth={espessura}
              strokeDasharray={`${Math.max(comprimento - folga, 0.5)} ${circunferencia}`}
              strokeDashoffset={-inicios[i]}
              transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
            />
          );
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, estilos.centro]}>
        <Text style={estilos.centroValor} numberOfLines={1} adjustsFontSizeToFit>{reais(total)}</Text>
        {!!legenda && <Text style={estilos.centroLegenda}>{legenda}</Text>}
      </View>
    </View>
  );
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Gastos dos últimos meses: linha de 2px com área suave, ponto final com anel e o valor escrito só na ponta
export function AreaMeses({ historico, altura = 96 }) {
  const [largura, setLargura] = useState(0);
  const valores = historico.map((h) => h.despesas);
  const maior = Math.max(...valores, 1);
  const margem = { cima: 22, baixo: 18, lados: 8 };
  const areaX = largura - margem.lados * 2 - 4;
  const areaY = altura - margem.cima - margem.baixo;
  const x = (i) => margem.lados + (historico.length > 1 ? (i / (historico.length - 1)) * areaX : areaX / 2);
  const y = (v) => margem.cima + (1 - v / maior) * areaY;
  const pontos = valores.map((v, i) => [x(i), y(v)]);
  const linha = pontos.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const area = `${linha} L${x(valores.length - 1)},${margem.cima + areaY} L${x(0)},${margem.cima + areaY} Z`;
  const [fimX, fimY] = pontos.at(-1) ?? [0, 0];
  const ultimo = valores.at(-1) ?? 0;

  return (
    <View
      style={{ height: altura }}
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Gastos por mês: ${historico.map((h) => `${MESES_CURTOS[Number(h.mes.slice(5)) - 1]} ${reais(h.despesas)}`).join(", ")}`}
    >
      {largura > 0 && (
        <Svg width={largura} height={altura}>
          <Defs>
            <LinearGradient id="lavagem" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={cores.marca} stopOpacity={0.16} />
              <Stop offset="1" stopColor={cores.marca} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Path d={`M${margem.lados},${margem.cima + areaY} H${largura - margem.lados}`} stroke={cores.borda} strokeWidth={1} />
          <Path d={area} fill="url(#lavagem)" />
          <Path d={linha} stroke={cores.marca} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={fimX} cy={fimY} r={4} fill={cores.marca} stroke={cores.superficie} strokeWidth={2} />
          <TextoSvg x={Math.min(fimX, largura - 4)} y={fimY - 9} fontSize={11} fontWeight="600" fill={cores.texto} textAnchor="end" fontFamily="sans-serif">
            {reais(ultimo)}
          </TextoSvg>
          {historico.map((h, i) => (
            <TextoSvg
              key={h.mes}
              x={x(i)}
              y={altura - 4}
              fontSize={10}
              fill={i === historico.length - 1 ? cores.texto : cores.textoSecundario}
              fontWeight={i === historico.length - 1 ? "600" : "400"}
              textAnchor={i === 0 ? "start" : i === historico.length - 1 ? "end" : "middle"}
              fontFamily="sans-serif"
            >
              {MESES_CURTOS[Number(h.mes.slice(5)) - 1]}
            </TextoSvg>
          ))}
        </Svg>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: { alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  centroValor: { fontSize: 16, fontWeight: "700", color: cores.texto },
  centroLegenda: { fontSize: 12, color: cores.textoSecundario, marginTop: 2 },
});
