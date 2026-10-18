import Ionicons from "@expo/vector-icons/Ionicons";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../lib/api";
import { reais } from "../lib/formato";
import { cores, espaco, raio } from "../lib/tema";

const SUGESTOES = [
  "Quanto gastei este mês?",
  "Onde mais gastei este mês?",
  "Qual mês gastei mais com mercado?",
  "Quanto gastei com Uber desde agosto?",
  "Meus maiores gastos do mês",
];

const BOAS_VINDAS = {
  id: 0,
  de: "bolso",
  texto: "Oi! Pergunte sobre seus gastos e entradas. Eu procuro nos seus lançamentos e faço as contas.",
};

function Linhas({ linhas }) {
  if (!linhas?.length) return null;
  return (
    <View style={estilos.linhas}>
      {linhas.map((l, i) => (
        <View key={i} style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.linhaRotulo} numberOfLines={1}>{l.rotulo}</Text>
            {!!l.detalhe && <Text style={estilos.linhaDetalhe}>{l.detalhe}</Text>}
          </View>
          <Text style={estilos.linhaValor}>{reais(l.valor)}</Text>
        </View>
      ))}
    </View>
  );
}

function Mensagem({ mensagem }) {
  const minha = mensagem.de === "voce";
  return (
    <View style={[estilos.bolha, minha ? estilos.bolhaMinha : estilos.bolhaBolso, mensagem.erro && estilos.bolhaErro]}>
      <Text style={[estilos.bolhaTexto, minha && estilos.bolhaTextoMinha, mensagem.erro && { color: cores.erro }]}>{mensagem.texto}</Text>
      <Linhas linhas={mensagem.linhas} />
    </View>
  );
}

// "Pergunte ao Bolso": a IA só entende a pergunta; os números vêm dos lançamentos, calculados pela API
export default function Perguntar() {
  const [mensagens, setMensagens] = useState([BOAS_VINDAS]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const rolagem = useRef(null);

  async function enviar(pergunta = texto) {
    const limpa = pergunta.trim();
    if (!limpa || pensando) return;
    setTexto("");
    setMensagens((atuais) => [...atuais, { id: Date.now(), de: "voce", texto: limpa }]);
    setPensando(true);
    try {
      const { resposta, linhas } = await api.perguntar(limpa);
      setMensagens((atuais) => [...atuais, { id: Date.now() + 1, de: "bolso", texto: resposta, linhas }]);
    } catch (e) {
      setMensagens((atuais) => [...atuais, { id: Date.now() + 1, de: "bolso", texto: e.message, erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        ref={rolagem}
        contentContainerStyle={estilos.conversa}
        onContentSizeChange={() => rolagem.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {mensagens.map((m) => (
          <Mensagem key={m.id} mensagem={m} />
        ))}
        {pensando && (
          <View style={[estilos.bolha, estilos.bolhaBolso, estilos.pensando]}>
            <ActivityIndicator size="small" color={cores.marca} />
            <Text style={estilos.linhaDetalhe}>Procurando nos seus lançamentos...</Text>
          </View>
        )}
        {mensagens.length === 1 && (
          <View style={estilos.sugestoes}>
            {SUGESTOES.map((s) => (
              <Pressable key={s} onPress={() => enviar(s)} style={({ pressed }) => [estilos.sugestao, pressed && { opacity: 0.6 }]}>
                <Text style={estilos.sugestaoTexto}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={estilos.barra}>
        <TextInput
          style={estilos.campo}
          value={texto}
          onChangeText={setTexto}
          placeholder="Escreva sua pergunta"
          placeholderTextColor={cores.textoSuave}
          onSubmitEditing={() => enviar()}
          returnKeyType="send"
          maxLength={300}
          editable={!pensando}
        />
        <Pressable
          onPress={() => enviar()}
          disabled={!texto.trim() || pensando}
          style={({ pressed }) => [estilos.enviar, (!texto.trim() || pensando || pressed) && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Enviar pergunta"
        >
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conversa: { padding: espaco.m, gap: 10, paddingBottom: espaco.g },
  bolha: { maxWidth: "88%", borderRadius: raio + 4, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  bolhaBolso: { alignSelf: "flex-start", backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda },
  bolhaMinha: { alignSelf: "flex-end", backgroundColor: cores.marca },
  bolhaErro: { backgroundColor: cores.erroSuave, borderColor: cores.erroSuave },
  bolhaTexto: { fontSize: 15, lineHeight: 21, color: cores.texto },
  bolhaTextoMinha: { color: "#fff" },
  pensando: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  linhas: { gap: 8, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 8 },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.m },
  linhaRotulo: { fontSize: 14, color: cores.texto },
  linhaDetalhe: { fontSize: 12, color: cores.textoSecundario },
  linhaValor: { fontSize: 14, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
  sugestoes: { gap: espaco.p, marginTop: espaco.p },
  sugestao: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cores.marca,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sugestaoTexto: { fontSize: 14, color: cores.marca, fontWeight: "600" },
  barra: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    padding: espaco.p,
    paddingHorizontal: espaco.m,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  campo: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingHorizontal: espaco.m,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  enviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" },
});
