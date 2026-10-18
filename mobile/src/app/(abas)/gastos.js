import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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
  RECORRENTE: "Gasto fixo",
};

function ItemGasto({ transacao, aoTocar, aoSegurar }) {
  const receita = transacao.tipo === "RECEITA";
  const detalhes = [
    diaMes(transacao.data),
    ROTULO_ORIGEM[transacao.origem],
    transacao.conta?.nome,
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
          {transacao.recorrencia?.ativa && !transacao.conciliadaComId && (
            <View style={estilos.conciliada}>
              <Ionicons name="repeat" size={12} color={cores.textoSecundario} />
              <Text style={estilos.conciliadaTexto}>todo mês</Text>
            </View>
          )}
          {transacao.conciliadaComId && (
            <View style={estilos.conciliada}>
              <Ionicons name="link-outline" size={12} color={cores.textoSecundario} />
              <Text style={estilos.conciliadaTexto}>
                {transacao.origem === "RECORRENTE" ? "trocado pela cobrança real" : "já contado na fatura"}
              </Text>
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
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      setTransacoes(await api.transacoes(mes));
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);

  // Recarrega ao voltar da tela de edição
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  function confirmarExclusao(transacao) {
    Alert.alert("Apagar lançamento?", `${transacao.descricao} · ${reais(transacao.valor)}`, [
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

  return (
    <FlatList
      data={transacoes ?? []}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={estilos.lista}
      ListHeaderComponent={
        <View style={{ gap: espaco.p, marginBottom: espaco.p }}>
          <SeletorMes mes={mes} aoMudar={setMes} />
          <Aviso mensagem={erro} />
          <View style={estilos.cabecalho}>
            <Text style={estilos.dica}>
              {transacoes?.length ? "Toque para editar. Segure para apagar." : ""}
            </Text>
            <Pressable onPress={() => router.push("/lancamento")} hitSlop={10} style={estilos.novo} accessibilityRole="button">
              <Ionicons name="add" size={18} color={cores.marca} />
              <Text style={estilos.novoTexto}>Novo</Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={transacoes && <Vazio icone="wallet-outline" texto="Nenhum lançamento neste mês." />}
      renderItem={({ item }) => (
        <ItemGasto
          transacao={item}
          aoTocar={() => router.push(`/lancamento?id=${item.id}`)}
          aoSegurar={() => confirmarExclusao(item)}
        />
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
  );
}

const estilos = StyleSheet.create({
  lista: { padding: espaco.m, paddingBottom: 40 },
  cabecalho: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dica: { fontSize: 13, color: cores.textoSuave, flex: 1 },
  novo: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 4 },
  novoTexto: { fontSize: 15, fontWeight: "600", color: cores.marca },
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
});
