import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aviso, SeletorMes, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { diaMes, mesAtual, reais } from "../../lib/formato";
import { cores, espaco, raio } from "../../lib/tema";

const ROTULO_ORIGEM = {
  MANUAL: "Manual",
  TEXTO: "Texto",
  CUPOM: "Cupom",
  FATURA: "Fatura",
  EXTRATO: "Extrato",
  COMPROVANTE: "Comprovante",
  CONTA_CONSUMO: "Conta",
};

function ItemGasto({ transacao, aoTocar, aoSegurar }) {
  const receita = transacao.tipo === "RECEITA";
  const detalhes = [
    diaMes(transacao.data),
    ROTULO_ORIGEM[transacao.origem],
    transacao.parcelaTotal && `${transacao.parcelaAtual}/${transacao.parcelaTotal}`,
    transacao.itens.length > 0 && `${transacao.itens.length} itens`,
  ].filter(Boolean);

  return (
    <Pressable onPress={aoTocar} onLongPress={aoSegurar} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.descricao} numberOfLines={1}>{transacao.descricao}</Text>
        <Text style={estilos.detalhes}>{detalhes.join(" · ")}</Text>
        <View style={estilos.etiquetas}>
          <Text style={estilos.categoria}>{transacao.categoria?.nome ?? "Sem categoria"}</Text>
          {transacao.conciliadaComId && (
            <View style={estilos.conciliada}>
              <Ionicons name="link-outline" size={12} color={cores.textoSecundario} />
              <Text style={estilos.conciliadaTexto}>já contado na fatura</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[estilos.valor, transacao.conciliadaComId && estilos.valorRiscado]}>
        {receita ? "+ " : "− "}
        {reais(transacao.valor)}
      </Text>
    </Pressable>
  );
}

export default function Gastos() {
  const [mes, setMes] = useState(mesAtual());
  const [transacoes, setTransacoes] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      const [lista, cats] = await Promise.all([api.transacoes(mes), api.categorias()]);
      setTransacoes(lista);
      setCategorias(cats);
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function trocarCategoria(categoria) {
    const transacao = editando;
    setEditando(null);
    try {
      const atualizada = await api.editarTransacao(transacao.id, { categoriaId: categoria.id });
      setTransacoes((lista) => lista.map((t) => (t.id === atualizada.id ? atualizada : t)));
    } catch (e) {
      setErro(e.message);
    }
  }

  function confirmarExclusao(transacao) {
    Alert.alert("Apagar gasto?", `${transacao.descricao} · ${reais(transacao.valor)}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.apagarTransacao(transacao.id);
            setTransacoes((lista) => lista.filter((t) => t.id !== transacao.id));
          } catch (e) {
            setErro(e.message);
          }
        },
      },
    ]);
  }

  const doTipo = categorias.filter((c) => c.tipo === (editando?.tipo ?? "DESPESA"));

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={transacoes ?? []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View style={{ gap: espaco.p, marginBottom: espaco.p }}>
            <SeletorMes mes={mes} aoMudar={setMes} />
            <Aviso mensagem={erro} />
            {transacoes?.length > 0 && (
              <Text style={estilos.dica}>Toque para mudar a categoria. Segure para apagar.</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          transacoes && <Vazio icone="wallet-outline" texto="Nenhum lançamento neste mês." />
        }
        renderItem={({ item }) => (
          <ItemGasto transacao={item} aoTocar={() => setEditando(item)} aoSegurar={() => confirmarExclusao(item)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: espaco.p }} />}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            tintColor={cores.marca}
            onRefresh={async () => {
              setAtualizando(true);
              await carregar();
              setAtualizando(false);
            }}
          />
        }
      />

      <Modal visible={Boolean(editando)} animationType="slide" transparent onRequestClose={() => setEditando(null)}>
        <Pressable style={estilos.fundoModal} onPress={() => setEditando(null)} />
        <SafeAreaView edges={["bottom"]} style={estilos.folha}>
          <Text style={estilos.folhaTitulo}>Categoria de “{editando?.descricao}”</Text>
          <Text style={estilos.folhaDica}>O Bolso vai lembrar dessa escolha para os próximos gastos desse lugar.</Text>
          <FlatList
            data={doTipo}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => (
              <Pressable style={estilos.opcao} onPress={() => trocarCategoria(item)}>
                <Text style={estilos.opcaoTexto}>{item.nome}</Text>
                {item.id === editando?.categoria?.id && <Ionicons name="checkmark" size={20} color={cores.marca} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: espaco.m, paddingBottom: 40 },
  dica: { fontSize: 13, color: cores.textoSuave },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.m,
    backgroundColor: cores.superficie,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    padding: 14,
  },
  descricao: { fontSize: 16, fontWeight: "600", color: cores.texto },
  detalhes: { fontSize: 13, color: cores.textoSecundario },
  etiquetas: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  categoria: {
    fontSize: 12,
    color: cores.marca,
    backgroundColor: cores.marcaSuave,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  conciliada: { flexDirection: "row", alignItems: "center", gap: 3 },
  conciliadaTexto: { fontSize: 12, color: cores.textoSecundario },
  valor: { fontSize: 16, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  valorRiscado: { color: cores.textoSuave, textDecorationLine: "line-through" },
  fundoModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  folha: {
    maxHeight: "70%",
    backgroundColor: cores.superficie,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: espaco.m,
    gap: espaco.p,
  },
  folhaTitulo: { fontSize: 17, fontWeight: "700", color: cores.texto },
  folhaDica: { fontSize: 13, color: cores.textoSecundario, marginBottom: espaco.p },
  opcao: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  opcaoTexto: { fontSize: 16, color: cores.texto },
});
