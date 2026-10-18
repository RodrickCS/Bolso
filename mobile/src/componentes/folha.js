import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cores, espaco, raio } from "../lib/tema";

// Folha que sobe de baixo com uma lista de escolhas. opcoes: [{ valor, rotulo, detalhe?, icone }]
export function Folha({ visivel, titulo, opcoes, selecionado, aoEscolher, aoCancelar }) {
  // Sem isso, no Android a folha fica atrás da barra de navegação
  const baixo = useSafeAreaInsets().bottom;
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoCancelar}>
      <Pressable style={estilos.fundo} onPress={aoCancelar} accessibilityLabel="Cancelar" />
      <View style={[estilos.folha, { paddingBottom: baixo + espaco.m }]}>
        <Text style={estilos.titulo}>{titulo}</Text>
        {opcoes.map((o) => (
          <Pressable
            key={String(o.valor)}
            onPress={() => aoEscolher(o.valor)}
            style={({ pressed }) => [estilos.opcao, o.valor === selecionado && estilos.selecionada, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: o.valor === selecionado }}
          >
            <Ionicons name={o.icone} size={22} color={cores.marca} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.rotulo}>{o.rotulo}</Text>
              {!!o.detalhe && <Text style={estilos.detalhe}>{o.detalhe}</Text>}
            </View>
            {o.valor === selecionado && <Ionicons name="checkmark" size={20} color={cores.marca} />}
          </Pressable>
        ))}
        <Pressable onPress={aoCancelar} style={estilos.cancelar} accessibilityRole="button">
          <Text style={estilos.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  folha: {
    backgroundColor: cores.superficie,
    borderTopLeftRadius: raio * 2,
    borderTopRightRadius: raio * 2,
    padding: espaco.m,
    gap: 4,
  },
  titulo: { fontSize: 17, fontWeight: "700", color: cores.texto, marginBottom: espaco.p },
  opcao: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingVertical: 8, paddingHorizontal: espaco.p, borderRadius: raio },
  selecionada: { backgroundColor: cores.marcaSuave },
  rotulo: { fontSize: 15, fontWeight: "600", color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSecundario },
  cancelar: { alignItems: "center", paddingVertical: 12, marginTop: espaco.p },
  cancelarTexto: { fontSize: 15, fontWeight: "600", color: cores.textoSecundario },
});
