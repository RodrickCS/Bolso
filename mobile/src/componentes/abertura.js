import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, StyleSheet, Text } from "react-native";
import Svg, { Circle, G, Path, Text as TextoSvg } from "react-native-svg";
import { MARCA } from "../lib/marca";

// Mesmo tamanho e escala da splash nativa (imageWidth 200, desenho em 82% da imagem):
// a troca da splash nativa para esta tela não dá pulo
const TAMANHO = 200;
const ESCALA = 0.82;
const AJUSTE = `translate(${(100 - 100 * ESCALA) / 2} ${(100 - 100 * ESCALA) / 2}) scale(${ESCALA})`;
const TEMPO_MINIMO = 1300;

function Moeda() {
  const { x, y, raio } = MARCA.moedaCentro;
  return (
    <Svg width={TAMANHO} height={TAMANHO} viewBox="0 0 100 100">
      <G transform={AJUSTE}>
        <Circle cx={x} cy={y} r={raio} fill={MARCA.moeda} stroke={MARCA.moedaBorda} strokeWidth={2} />
        <TextoSvg x={x} y={y - 2.5} fontSize={11} fontWeight="700" fill={MARCA.moedaBorda} textAnchor="middle" fontFamily="sans-serif">
          $
        </TextoSvg>
      </G>
    </Svg>
  );
}

function Bolso() {
  const costura = { stroke: MARCA.verde, strokeWidth: 2.2, fill: "none", strokeDasharray: "4.5 3.5", strokeLinecap: "round" };
  return (
    <Svg width={TAMANHO} height={TAMANHO} viewBox="0 0 100 100">
      <G transform={AJUSTE}>
        <Path d={MARCA.bolso} fill="#fff" />
        <Path d={MARCA.costura} {...costura} />
        <Path d={MARCA.bainha} {...costura} />
      </G>
    </Svg>
  );
}

// Abertura animada: continua de onde a splash nativa parou. A moeda pula e cai no bolso,
// o nome aparece e, quando a sessão termina de carregar, a tela some num fade.
export function Abertura({ pronto }) {
  const [visivel, setVisivel] = useState(true);
  const [tempoOk, setTempoOk] = useState(false);
  // Valores animados criados uma vez (useState, não useRef: eles são lidos na renderização)
  const [moeda] = useState(() => new Animated.Value(0));
  const [bolso] = useState(() => new Animated.Value(0));
  const [nome] = useState(() => new Animated.Value(0));
  const [saida] = useState(() => new Animated.Value(0));

  const estilosAnimados = useMemo(
    () => ({
      moeda: { transform: [{ translateY: moeda.interpolate({ inputRange: [-1, 0, 1], outputRange: [-46, 0, 14] }) }] },
      bolso: { transform: [{ scaleY: bolso.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }] },
      nome: { opacity: nome, transform: [{ translateY: nome.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      tela: { opacity: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
      logo: { transform: [{ scale: saida.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] },
    }),
    [moeda, bolso, nome, saida],
  );

  // Esconde a splash nativa só depois que esta tela, idêntica a ela, já está desenhada
  function aoDesenhar() {
    SplashScreen.hideAsync().catch(() => {});
    const mola = { useNativeDriver: true, easing: Easing.out(Easing.cubic) };
    Animated.sequence([
      Animated.delay(150),
      Animated.timing(moeda, { toValue: -1, duration: 260, ...mola }),
      Animated.timing(moeda, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(bolso, { toValue: 1, duration: 90, useNativeDriver: true }),
          Animated.spring(bolso, { toValue: 0, friction: 4, useNativeDriver: true }),
        ]),
        Animated.spring(moeda, { toValue: 0, friction: 5, useNativeDriver: true }),
        Animated.timing(nome, { toValue: 1, duration: 320, ...mola }),
      ]),
    ]).start();
  }

  useEffect(() => {
    const espera = setTimeout(() => setTempoOk(true), TEMPO_MINIMO);
    return () => clearTimeout(espera);
  }, []);

  useEffect(() => {
    if (!pronto || !tempoOk) return;
    Animated.timing(saida, { toValue: 1, duration: 350, useNativeDriver: true, easing: Easing.in(Easing.quad) }).start(() =>
      setVisivel(false),
    );
  }, [pronto, tempoOk, saida]);

  if (!visivel) return null;
  return (
    <Animated.View style={[estilos.tela, estilosAnimados.tela, pronto && tempoOk && { pointerEvents: "none" }]} onLayout={aoDesenhar}>
      <StatusBar style="light" />
      <Animated.View style={[estilos.logo, estilosAnimados.logo]} accessible accessibilityLabel="Bolso">
        <Animated.View style={[estilos.camada, estilosAnimados.moeda]}>
          <Moeda />
        </Animated.View>
        <Animated.View style={[estilos.camada, estilosAnimados.bolso, { transformOrigin: "50% 30%" }]}>
          <Bolso />
        </Animated.View>
        <Animated.View style={[estilos.textos, estilosAnimados.nome]}>
          <Text style={estilos.nome}>Bolso</Text>
          <Text style={estilos.frase}>Seus gastos no lugar certo</Text>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: MARCA.verde,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: TAMANHO, height: TAMANHO },
  camada: { position: "absolute", top: 0, left: 0 },
  textos: { position: "absolute", top: TAMANHO * 0.86, left: -80, right: -80, alignItems: "center", gap: 4 },
  nome: { fontSize: 34, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  frase: { fontSize: 15, color: "#d4efe2" },
});
