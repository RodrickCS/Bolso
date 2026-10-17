import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cores, espaco, raio } from "../lib/tema";
import { nomeDoMes, somarMes } from "../lib/formato";

export function Botao({ titulo, aoTocar, icone, variante = "primario", carregando, desativado }) {
  const primario = variante === "primario";
  return (
    <Pressable
      onPress={aoTocar}
      disabled={desativado || carregando}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.botao,
        primario ? estilos.botaoPrimario : estilos.botaoSecundario,
        (pressed || desativado) && { opacity: 0.6 },
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={primario ? "#fff" : cores.marca} />
      ) : (
        <>
          {icone && <Ionicons name={icone} size={20} color={primario ? "#fff" : cores.marca} />}
          <Text style={[estilos.botaoTexto, { color: primario ? "#fff" : cores.marca }]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

// Grupo de opções em "pílulas" (escolha única). opcoes: [{ valor, rotulo }]
export function Opcoes({ opcoes, valor, aoMudar }) {
  return (
    <View style={estilos.opcoes} accessibilityRole="radiogroup">
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <Pressable
            key={String(o.valor)}
            onPress={() => aoMudar(o.valor)}
            style={[estilos.opcao, ativa && estilos.opcaoAtiva]}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativa }}
          >
            <Text style={[estilos.opcaoTexto, ativa && estilos.opcaoTextoAtiva]}>{o.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Rotulo({ children }) {
  return <Text style={estilos.rotulo}>{children}</Text>;
}

export function Campo(props) {
  return <TextInput placeholderTextColor={cores.textoSuave} style={estilos.campo} {...props} />;
}

export function Cartao({ children, style }) {
  return <View style={[estilos.cartao, style]}>{children}</View>;
}

export function Aviso({ mensagem }) {
  if (!mensagem) return null;
  return (
    <View style={estilos.aviso} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={cores.erro} />
      <Text style={estilos.avisoTexto}>{mensagem}</Text>
    </View>
  );
}

export function SeletorMes({ mes, aoMudar }) {
  return (
    <View style={estilos.seletor}>
      <Pressable onPress={() => aoMudar(somarMes(mes, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
        <Ionicons name="chevron-back" size={22} color={cores.textoSecundario} />
      </Pressable>
      <Text style={estilos.seletorTexto}>{nomeDoMes(mes)}</Text>
      <Pressable onPress={() => aoMudar(somarMes(mes, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
        <Ionicons name="chevron-forward" size={22} color={cores.textoSecundario} />
      </Pressable>
    </View>
  );
}

export function Vazio({ icone, texto }) {
  return (
    <View style={estilos.vazio}>
      <Ionicons name={icone} size={40} color={cores.textoSuave} />
      <Text style={estilos.vazioTexto}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  botao: {
    minHeight: 48,
    borderRadius: raio,
    paddingHorizontal: espaco.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.p,
  },
  botaoPrimario: { backgroundColor: cores.marca },
  botaoSecundario: { backgroundColor: cores.marcaSuave },
  botaoTexto: { fontSize: 16, fontWeight: "600" },
  campo: {
    minHeight: 48,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    paddingHorizontal: espaco.m,
    fontSize: 16,
    color: cores.texto,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: espaco.m,
  },
  aviso: {
    flexDirection: "row",
    gap: espaco.p,
    alignItems: "center",
    backgroundColor: cores.erroSuave,
    borderRadius: raio,
    padding: 12,
  },
  avisoTexto: { color: cores.erro, flex: 1, fontSize: 14 },
  seletor: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: espaco.p },
  seletorTexto: { fontSize: 17, fontWeight: "600", color: cores.texto },
  opcoes: { flexDirection: "row", flexWrap: "wrap", gap: espaco.p },
  opcao: {
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  opcaoAtiva: { backgroundColor: cores.marca, borderColor: cores.marca },
  opcaoTexto: { fontSize: 14, color: cores.texto },
  opcaoTextoAtiva: { color: "#fff", fontWeight: "600" },
  rotulo: { fontSize: 14, fontWeight: "600", color: cores.textoSecundario, marginTop: espaco.p },
  vazio: { alignItems: "center", gap: espaco.p, paddingVertical: 48 },
  vazioTexto: { color: cores.textoSecundario, textAlign: "center", fontSize: 15, maxWidth: 260 },
});
