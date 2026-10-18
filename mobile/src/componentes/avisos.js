import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cores, espaco, raios, fonte, peso, entrelinha, sombras, componentes } from "../lib/tema";

// Diálogos e avisos rápidos com o visual do app, no lugar do Alert cinza do sistema.
// alerta(titulo, mensagem, botoes) aceita os mesmos botões do Alert.alert: { text, style, onPress },
// com style "cancel" ou "destructive". toast(mensagem) mostra uma faixa embaixo por 2,5 segundos.
const ContextoAvisos = createContext(null);

export function useAvisos() {
  return useContext(ContextoAvisos);
}

function Dialogo({ dialogo, aoFechar }) {
  const baixo = useSafeAreaInsets().bottom;
  const botoes = dialogo?.botoes?.length ? dialogo.botoes : [{ text: "Ok" }];
  // Ações primeiro, "Cancelar" por último, como numa folha de opções
  const ordenados = [...botoes.filter((b) => b.style !== "cancel"), ...botoes.filter((b) => b.style === "cancel")];
  const cancelar = botoes.find((b) => b.style === "cancel");

  function tocar(botao) {
    aoFechar();
    botao.onPress?.();
  }

  return (
    <Modal visible={Boolean(dialogo)} transparent animationType="slide" onRequestClose={() => (cancelar ? tocar(cancelar) : aoFechar())}>
      <Pressable style={estilos.fundo} onPress={() => (cancelar ? tocar(cancelar) : aoFechar())} accessibilityLabel="Fechar" />
      {dialogo && (
        <View style={[estilos.folha, { paddingBottom: baixo + espaco.m }]} accessibilityRole="alert">
          <Text style={estilos.titulo}>{dialogo.titulo}</Text>
          {!!dialogo.mensagem && <Text style={estilos.mensagem}>{dialogo.mensagem}</Text>}
          <View style={estilos.botoes}>
            {ordenados.map((b) => (
              <Pressable
                key={b.text}
                onPress={() => tocar(b)}
                style={({ pressed }) => [
                  estilos.botao,
                  b.style === "destructive" ? estilos.botaoPerigo : b.style === "cancel" ? estilos.botaoCancelar : estilos.botaoNormal,
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    estilos.botaoTexto,
                    { color: b.style === "destructive" ? cores.critico : b.style === "cancel" ? cores.textoSecundario : cores.marca },
                  ]}
                >
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </Modal>
  );
}

function Toast({ toast }) {
  const baixo = useSafeAreaInsets().bottom;
  // Valor animado criado uma vez (useState, não useRef: ele é lido na renderização)
  const [opacidade] = useState(() => new Animated.Value(0));
  const deslocamento = useMemo(() => opacidade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }), [opacidade]);

  useEffect(() => {
    if (!toast) return;
    opacidade.setValue(0);
    Animated.sequence([
      Animated.timing(opacidade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacidade, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [toast, opacidade]);

  if (!toast) return null;
  const erro = toast.tipo === "erro";
  return (
    <Animated.View
      style={[
        estilos.toast,
        { bottom: baixo + 136, opacity: opacidade, transform: [{ translateY: deslocamento }] },
        { pointerEvents: "none" },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Ionicons name={erro ? "alert-circle" : "checkmark-circle"} size={18} color={erro ? cores.toastErro : cores.toastSucesso} />
      <Text style={estilos.toastTexto}>{toast.mensagem}</Text>
    </Animated.View>
  );
}

export function ProvedorAvisos({ children }) {
  const [dialogo, setDialogo] = useState(null);
  const [toast, setToast] = useState(null);

  const alerta = useCallback((titulo, mensagem, botoes) => setDialogo({ titulo, mensagem, botoes }), []);
  // Um id novo a cada chamada: o mesmo texto duas vezes seguidas também reaparece
  const mostrarToast = useCallback((mensagem, { tipo } = {}) => setToast({ mensagem, tipo, id: Date.now() }), []);
  const valor = useMemo(() => ({ alerta, toast: mostrarToast }), [alerta, mostrarToast]);

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <Dialogo dialogo={dialogo} aoFechar={() => setDialogo(null)} />
      <Toast toast={toast} />
    </ContextoAvisos.Provider>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: cores.veu },
  folha: {
    backgroundColor: cores.superficie,
    borderTopLeftRadius: componentes.folha.raio,
    borderTopRightRadius: componentes.folha.raio,
    padding: espaco.m,
    paddingTop: espaco.g,
    gap: espaco.p,
  },
  titulo: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto },
  mensagem: { fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.textoSecundario },
  botoes: { gap: espaco.p, marginTop: espaco.p },
  botao: { minHeight: componentes.botao.altura, borderRadius: componentes.botao.raio, alignItems: "center", justifyContent: "center", paddingHorizontal: espaco.m },
  botaoNormal: { backgroundColor: cores.marcaSuave },
  botaoPerigo: { backgroundColor: cores.criticoSuave },
  botaoCancelar: { backgroundColor: "transparent" },
  botaoTexto: { fontSize: fonte.md, fontWeight: peso.medio },
  toast: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    paddingHorizontal: espaco.m,
    paddingVertical: espaco.pm,
    borderRadius: raios.pilula,
    backgroundColor: cores.toastFundo,
    ...sombras.flutuante,
  },
  toastTexto: { color: cores.sobreEscuro, fontSize: fonte.sm, fontWeight: peso.medio, flexShrink: 1 },
});
