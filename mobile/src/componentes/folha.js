import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cores, espaco, raios, fonte, peso, componentes } from "../lib/tema";

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
  fundo: { flex: 1, backgroundColor: cores.veu },
  folha: {
    backgroundColor: cores.superficie,
    borderTopLeftRadius: componentes.folha.raio,
    borderTopRightRadius: componentes.folha.raio,
    padding: espaco.m,
    gap: espaco.xs,
  },
  titulo: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto, marginBottom: espaco.p },
  opcao: { flexDirection: "row", alignItems: "center", gap: espaco.m, minHeight: 52, paddingVertical: espaco.p, paddingHorizontal: espaco.p, borderRadius: raios.m },
  selecionada: { backgroundColor: cores.marcaSuave },
  rotulo: { fontSize: fonte.md, fontWeight: peso.medio, color: cores.texto },
  detalhe: { fontSize: fonte.sm, color: cores.textoSecundario },
  cancelar: { alignItems: "center", paddingVertical: espaco.pm, marginTop: espaco.p },
  cancelarTexto: { fontSize: fonte.md, fontWeight: peso.medio, color: cores.textoSecundario },
});
