import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cores, espaco, raios, fonte, peso, componentes } from "../lib/tema";
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
        <ActivityIndicator color={primario ? cores.sobreMarca : cores.marca} />
      ) : (
        <>
          {icone && <Ionicons name={icone} size={20} color={primario ? cores.sobreMarca : cores.marca} />}
          <Text style={[estilos.botaoTexto, { color: primario ? cores.sobreMarca : cores.marca }]}>{titulo}</Text>
        </>
      )}
    </Pressable>
  );
}

// Grupo de opções em "pílulas" (escolha única). opcoes: [{ valor, rotulo, icone? }]
export function Opcoes({ opcoes, valor, aoMudar }) {
  return (
    <View style={estilos.opcoes} accessibilityRole="radiogroup">
      {opcoes.map((o) => {
        const ativa = o.valor === valor;
        return (
          <Pressable
            key={String(o.valor)}
            onPress={() => aoMudar(o.valor)}
            hitSlop={4}
            style={({ pressed }) => [estilos.opcao, ativa && estilos.opcaoAtiva, pressed && !ativa && { backgroundColor: cores.fundo }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativa }}
          >
            {o.icone && <Ionicons name={o.icone} size={16} color={ativa ? cores.sobreMarca : cores.textoSecundario} />}
            <Text style={[estilos.opcaoTexto, ativa && estilos.opcaoTextoAtiva]}>{o.rotulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Inicial do nome num círculo verde (o app não guarda foto)
export function Avatar({ nome, tamanho = 44 }) {
  const inicial = nome?.trim()[0]?.toUpperCase() ?? "B";
  return (
    <View
      style={[estilos.avatar, { width: tamanho, height: tamanho, borderRadius: tamanho / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[estilos.avatarTexto, { fontSize: tamanho * 0.42 }]}>{inicial}</Text>
    </View>
  );
}

export function Rotulo({ children }) {
  return <Text style={estilos.rotulo}>{children}</Text>;
}

export function Campo({ style, ...props }) {
  return <TextInput placeholderTextColor={cores.textoSuave} style={[estilos.campo, style]} {...props} />;
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
    minHeight: componentes.botao.altura,
    borderRadius: componentes.botao.raio,
    paddingHorizontal: componentes.botao.paddingHorizontal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: espaco.p,
  },
  botaoPrimario: { backgroundColor: cores.marca },
  botaoSecundario: { backgroundColor: cores.marcaSuave },
  botaoTexto: { fontSize: fonte.md, fontWeight: peso.medio },
  campo: {
    minHeight: componentes.campo.altura,
    borderRadius: componentes.campo.raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    paddingHorizontal: componentes.campo.paddingHorizontal,
    fontSize: fonte.md,
    color: cores.texto,
  },
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: componentes.cartao.raio,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: componentes.cartao.padding,
  },
  aviso: {
    flexDirection: "row",
    gap: espaco.p,
    alignItems: "center",
    backgroundColor: cores.erroSuave,
    borderRadius: raios.m,
    padding: espaco.pm,
  },
  avisoTexto: { color: cores.erro, flex: 1, fontSize: fonte.sm },
  seletor: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: espaco.p },
  seletorTexto: { fontSize: fonte.lg, fontWeight: peso.medio, color: cores.texto },
  opcoes: { flexDirection: "row", flexWrap: "wrap", gap: espaco.p },
  opcao: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    paddingHorizontal: componentes.chip.paddingHorizontal,
    minHeight: componentes.chip.altura,
    justifyContent: "center",
    borderRadius: componentes.chip.raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  opcaoAtiva: { backgroundColor: cores.marca, borderColor: cores.marca },
  opcaoTexto: { fontSize: fonte.sm, color: cores.texto },
  opcaoTextoAtiva: { color: cores.sobreMarca, fontWeight: peso.medio },
  avatar: { backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" },
  avatarTexto: { color: cores.sobreMarca, fontWeight: peso.forte },
  rotulo: { fontSize: fonte.sm, fontWeight: peso.medio, color: cores.textoSecundario, marginTop: espaco.p },
  vazio: { alignItems: "center", gap: espaco.p, paddingVertical: espaco.ggg },
  vazioTexto: { color: cores.textoSecundario, textAlign: "center", fontSize: fonte.md, maxWidth: 260 },
});
