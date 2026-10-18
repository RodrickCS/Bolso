import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Aviso, Botao, Campo, Cartao, Opcoes, Rotulo } from "../componentes/ui";
import { api } from "../lib/api";
import { PELO_TIPO, TIPOS_CONTA } from "../lib/contas";
import { cores, espaco, fonte, peso } from "../lib/tema";
import { useAvisos } from "../componentes/avisos";

export default function Contas() {
  const { alerta, toast } = useAvisos();
  const [contas, setContas] = useState([]);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("CREDITO");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => api.contas().then(setContas).catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
  }, []);

  async function adicionar() {
    if (!nome.trim()) return setErro("Dê um nome para a conta, como Nubank ou Itaú.");
    setErro(null);
    setSalvando(true);
    try {
      await api.criarConta({ nome: nome.trim(), tipo });
      setNome("");
      await carregar();
      toast("Conta adicionada");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  function apagar(conta) {
    alerta("Excluir conta?", `"${conta.nome}" sai da lista. Os lançamentos dela continuam, só ficam sem conta.`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () =>
          api
            .apagarConta(conta.id)
            .then(carregar)
            .then(() => toast("Conta excluída"))
            .catch((e) => setErro(e.message)),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" automaticOffset>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.dica}>
          Separe seus gastos por cartão e conta. No painel você vê quanto foi em cada um, e num cartão de crédito
          isso é o que vai pesar na fatura.
        </Text>

        {contas.length > 0 && (
          <Cartao style={{ gap: espaco.xs }}>
            {contas.map((conta) => (
              <View key={conta.id} style={estilos.linha}>
                <Ionicons name={PELO_TIPO[conta.tipo]?.icone ?? "wallet-outline"} size={22} color={cores.marca} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nome}>{conta.nome}</Text>
                  <Text style={estilos.tipo}>{PELO_TIPO[conta.tipo]?.rotulo}</Text>
                </View>
                <Pressable onPress={() => apagar(conta)} hitSlop={12} accessibilityLabel={`Excluir ${conta.nome}`}>
                  <Ionicons name="trash-outline" size={20} color={cores.textoSecundario} />
                </Pressable>
              </View>
            ))}
          </Cartao>
        )}

        <Rotulo>Nova conta ou cartão</Rotulo>
        <Campo value={nome} onChangeText={setNome} placeholder="Ex: Nubank, Itaú, Carteira" accessibilityLabel="Nome da conta" />
        <Opcoes opcoes={TIPOS_CONTA} valor={tipo} aoMudar={setTipo} />
        <Aviso mensagem={erro} />
        <Botao titulo="Adicionar" icone="add" aoTocar={adicionar} carregando={salvando} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.p, paddingBottom: espaco.ggg },
  dica: { fontSize: fonte.sm, color: cores.textoSecundario, marginBottom: espaco.p },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.pm, minHeight: 56 },
  nome: { fontSize: fonte.md, color: cores.texto, fontWeight: peso.medio },
  tipo: { fontSize: fonte.sm, color: cores.textoSecundario },
});
