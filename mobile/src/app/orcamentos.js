import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aviso, Botao } from "../componentes/ui";
import { api } from "../lib/api";
import { iconeCategoria } from "../lib/categorias";
import { lerValorBR, mesAtual, reais } from "../lib/formato";
import { cores, espaco, raios, fonte } from "../lib/tema";

const mostrarValor = (valor) => (valor ? String(valor).replace(".", ",") : "");

export default function Orcamentos() {
  const [categorias, setCategorias] = useState([]);
  const [valores, setValores] = useState({});
  const [originais, setOriginais] = useState({});
  // Quanto já saiu em cada categoria neste mês, para ajudar a escolher o limite
  const [gastos, setGastos] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.categorias(), api.orcamentos(mesAtual()), api.painel(mesAtual())])
      .then(([todas, orcamentos, painel]) => {
        setGastos(Object.fromEntries(painel.porCategoria.map((c) => [c.categoriaId, c.total])));
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
    const invalida = mudancas.find((c) => Number.isNaN(lerValorBR(valores[c.id] ?? "")));
    if (invalida) {
      setErro(`Valor inválido em ${invalida.nome}. Use só números, como 300 ou 250,50.`);
      return;
    }
    setSalvando(true);
    try {
      await Promise.all(
        mudancas.map((c) => {
          const valor = lerValorBR(valores[c.id] ?? "");
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.dica}>
          Limite mensal por categoria. Deixe em branco as categorias sem orçamento.
        </Text>
        {categorias.map((c) => (
          <View key={c.id} style={estilos.linha}>
            <View style={estilos.icone}>
              <Ionicons name={iconeCategoria(c.nome)} size={18} color={cores.textoSecundario} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.nome} numberOfLines={1}>{c.nome}</Text>
              <Text style={estilos.gasto}>{gastos[c.id] ? `${reais(gastos[c.id])} este mês` : "Nada este mês"}</Text>
            </View>
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
  dica: { fontSize: fonte.sm, color: cores.textoSecundario, marginBottom: espaco.p },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.pm, minHeight: 56 },
  icone: { width: 36, height: 36, borderRadius: raios.pilula, backgroundColor: cores.superficie, alignItems: "center", justifyContent: "center" },
  nome: { fontSize: fonte.md, color: cores.texto },
  gasto: { fontSize: fonte.sm, color: cores.textoSecundario },
  campo: {
    flexDirection: "row",
    alignItems: "center",
    width: 140,
    minHeight: 44,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raios.m,
    backgroundColor: cores.superficie,
    paddingHorizontal: espaco.pm,
  },
  prefixo: { color: cores.textoSecundario, fontSize: fonte.md, marginRight: espaco.p },
  entrada: { flex: 1, fontSize: fonte.md, color: cores.texto, paddingVertical: espaco.p },
  rodape: { padding: espaco.m, gap: espaco.p, borderTopWidth: 1, borderTopColor: cores.borda, backgroundColor: cores.fundo },
});
