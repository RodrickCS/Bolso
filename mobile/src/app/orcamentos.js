import { router } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aviso, Botao } from "../componentes/ui";
import { api } from "../lib/api";
import { mesAtual } from "../lib/formato";
import { cores, espaco, raio } from "../lib/tema";

// "300" -> 300 | "1.250,50" -> 1250.5 | "" -> null
function lerValor(texto) {
  const limpo = texto.replace(/\./g, "").replace(",", ".").trim();
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor > 0 ? valor : NaN;
}

const mostrarValor = (valor) => (valor ? String(valor).replace(".", ",") : "");

export default function Orcamentos() {
  const [categorias, setCategorias] = useState([]);
  const [valores, setValores] = useState({});
  const [originais, setOriginais] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.categorias(), api.orcamentos(mesAtual())])
      .then(([todas, orcamentos]) => {
        const atuais = Object.fromEntries(orcamentos.map((o) => [o.categoriaId, mostrarValor(o.limite)]));
        setCategorias(todas.filter((c) => c.tipo === "DESPESA"));
        setValores(atuais);
        setOriginais(atuais);
      })
      .catch((e) => setErro(e.message));
  }, []);

  async function salvar() {
    setErro(null);
    const mudancas = categorias.filter((c) => (valores[c.id] ?? "") !== (originais[c.id] ?? ""));
    const invalida = mudancas.find((c) => Number.isNaN(lerValor(valores[c.id] ?? "")));
    if (invalida) {
      setErro(`Valor inválido em ${invalida.nome}. Use só números, como 300 ou 250,50.`);
      return;
    }
    setSalvando(true);
    try {
      await Promise.all(
        mudancas.map((c) => {
          const valor = lerValor(valores[c.id] ?? "");
          return valor === null ? api.apagarOrcamento(c.id) : api.salvarOrcamento(c.id, valor);
        }),
      );
      router.back();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.dica}>
          Limite mensal por categoria. Deixe em branco as categorias sem orçamento.
        </Text>
        {categorias.map((c) => (
          <View key={c.id} style={estilos.linha}>
            <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
            <View style={estilos.campo}>
              <Text style={estilos.prefixo}>R$</Text>
              <TextInput
                value={valores[c.id] ?? ""}
                onChangeText={(texto) => setValores((atual) => ({ ...atual, [c.id]: texto }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={cores.textoSuave}
                style={estilos.entrada}
                accessibilityLabel={`Orçamento de ${c.nome}`}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <SafeAreaView edges={["bottom"]} style={estilos.rodape}>
        <Aviso mensagem={erro} />
        <Botao titulo="Salvar orçamentos" aoTocar={salvar} carregando={salvando} />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.p },
  dica: { fontSize: 14, color: cores.textoSecundario, marginBottom: espaco.p },
  linha: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espaco.m, minHeight: 52 },
  nome: { fontSize: 16, color: cores.texto, flex: 1 },
  campo: {
    flexDirection: "row",
    alignItems: "center",
    width: 140,
    minHeight: 44,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio,
    backgroundColor: cores.superficie,
    paddingHorizontal: 12,
  },
  prefixo: { color: cores.textoSecundario, fontSize: 15, marginRight: 6 },
  entrada: { flex: 1, fontSize: 16, color: cores.texto, paddingVertical: 8 },
  rodape: { padding: espaco.m, gap: espaco.p, borderTopWidth: 1, borderTopColor: cores.borda, backgroundColor: cores.fundo },
});
