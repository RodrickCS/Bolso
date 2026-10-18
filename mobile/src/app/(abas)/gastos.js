import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { Aviso, SeletorMes, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { iconeCategoria } from "../../lib/categorias";
import { diaMes, mesAtual, reais } from "../../lib/formato";
import { cores, espaco, raio } from "../../lib/tema";
import { useAvisos } from "../../componentes/avisos";

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

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// "Hoje", "Ontem" ou "Sexta, 16/10"
function rotuloDoDia(iso) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diferenca = Math.round((hoje - data) / 86400000);
  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";
  return `${DIAS_SEMANA[data.getDay()]}, ${diaMes(iso)}`;
}

// Lançamentos do mês agrupados por dia, com o total gasto em cada dia
function agruparPorDia(transacoes) {
  const grupos = new Map();
  for (const t of transacoes) {
    const dia = t.data.slice(0, 10);
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(t);
  }
  return [...grupos].map(([dia, data]) => ({
    dia,
    data,
    gasto: data.filter((t) => t.tipo === "DESPESA" && !t.conciliadaComId).reduce((soma, t) => soma + Number(t.valor), 0),
  }));
}

function ItemGasto({ transacao, primeiro, ultimo, aoTocar, aoSegurar }) {
  const receita = transacao.tipo === "RECEITA";
  const detalhes = [
    transacao.categoria?.nome ?? "Sem categoria",
    transacao.conta?.nome,
    ROTULO_ORIGEM[transacao.origem],
    transacao.parcelaTotal && `${transacao.parcelaAtual}/${transacao.parcelaTotal}`,
    transacao.itens.length > 0 && `${transacao.itens.length} itens`,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={aoTocar}
      onLongPress={aoSegurar}
      style={({ pressed }) => [estilos.item, primeiro && estilos.itemPrimeiro, ultimo && estilos.itemUltimo, pressed && { backgroundColor: cores.fundo }]}
      accessibilityRole="button"
      accessibilityHint="Toque para editar, segure para apagar"
    >
      <View style={[estilos.icone, receita && { backgroundColor: cores.marcaSuave }]}>
        <Ionicons name={iconeCategoria(transacao.categoria?.nome)} size={18} color={receita ? cores.marca : cores.textoSecundario} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.descricao} numberOfLines={1}>{transacao.descricao}</Text>
        <Text style={estilos.detalhes} numberOfLines={1}>{detalhes.join(" · ")}</Text>
        {transacao.recorrencia?.ativa && !transacao.conciliadaComId && (
          <View style={estilos.etiqueta}>
            <Ionicons name="repeat" size={12} color={cores.textoSecundario} />
            <Text style={estilos.etiquetaTexto}>todo mês</Text>
          </View>
        )}
        {transacao.conciliadaComId && (
          <View style={estilos.etiqueta}>
            <Ionicons name="link-outline" size={12} color={cores.textoSecundario} />
            <Text style={estilos.etiquetaTexto}>
              {transacao.origem === "RECORRENTE" ? "trocado pela cobrança real" : "já contado na fatura"}
            </Text>
          </View>
        )}
      </View>
      <Text style={[estilos.valor, receita && { color: cores.marca }, transacao.conciliadaComId && estilos.valorRiscado]}>
        {receita ? "+ " : "− "}
        {reais(transacao.valor)}
      </Text>
    </Pressable>
  );
}

function Resumo({ transacoes }) {
  const contam = transacoes.filter((t) => !t.conciliadaComId);
  const soma = (tipo) => contam.filter((t) => t.tipo === tipo).reduce((total, t) => total + Number(t.valor), 0);
  return (
    <View style={estilos.resumo}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.resumoRotulo}>Gastos</Text>
        <Text style={estilos.resumoValor}>{reais(soma("DESPESA"))}</Text>
      </View>
      <View style={estilos.resumoDivisor} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.resumoRotulo}>Entradas</Text>
        <Text style={estilos.resumoValor}>{reais(soma("RECEITA"))}</Text>
      </View>
      <View style={estilos.resumoDivisor} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.resumoRotulo}>Lançamentos</Text>
        <Text style={estilos.resumoValor}>{contam.length}</Text>
      </View>
    </View>
  );
}

export default function Gastos() {
  const { alerta, toast } = useAvisos();
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
    alerta("Apagar lançamento?", `${transacao.descricao} · ${reais(transacao.valor)}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.apagarTransacao(transacao.id);
            setTransacoes((lista) => lista.filter((t) => t.id !== transacao.id));
            toast("Lançamento apagado");
          } catch (e) {
            setErro(e.message);
          }
        },
      },
    ]);
  }

  return (
    <SectionList
      sections={transacoes ? agruparPorDia(transacoes) : []}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={estilos.lista}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: espaco.p }}>
          <SeletorMes mes={mes} aoMudar={setMes} />
          <Aviso mensagem={erro} />
          {transacoes?.length > 0 && <Resumo transacoes={transacoes} />}
          <View style={estilos.cabecalho}>
            <Text style={estilos.dica}>
              {transacoes?.length ? "Toque para editar, segure para apagar." : ""}
            </Text>
            <Pressable onPress={() => router.push("/lancamento")} hitSlop={10} style={estilos.novo} accessibilityRole="button">
              <Ionicons name="add" size={18} color={cores.marca} />
              <Text style={estilos.novoTexto}>Novo</Text>
            </Pressable>
          </View>
        </View>
      }
      ListEmptyComponent={
        transacoes && (
          <Vazio icone="wallet-outline" texto="Nenhum lançamento neste mês. Toque no + para mandar um cupom, uma fatura ou escrever um gasto." />
        )
      }
      renderSectionHeader={({ section }) => (
        <View style={estilos.dia}>
          <Text style={estilos.diaTitulo}>{rotuloDoDia(section.dia)}</Text>
          {section.gasto > 0 && <Text style={estilos.diaTotal}>{reais(section.gasto)}</Text>}
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <ItemGasto
          transacao={item}
          primeiro={index === 0}
          ultimo={index === section.data.length - 1}
          aoTocar={() => router.push(`/lancamento?id=${item.id}`)}
          aoSegurar={() => confirmarExclusao(item)}
        />
      )}
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
  novo: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 36 },
  novoTexto: { fontSize: 15, fontWeight: "600", color: cores.marca },
  resumo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: cores.superficie,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingVertical: 12,
    paddingHorizontal: espaco.m,
    gap: 12,
  },
  resumoRotulo: { fontSize: 12, color: cores.textoSecundario },
  resumoValor: { fontSize: 16, fontWeight: "700", color: cores.texto },
  resumoDivisor: { width: 1, alignSelf: "stretch", backgroundColor: cores.borda },
  dia: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: espaco.m, marginBottom: espaco.p },
  diaTitulo: { fontSize: 14, fontWeight: "700", color: cores.texto },
  diaTotal: { fontSize: 13, color: cores.textoSecundario },
  // As linhas de um mesmo dia formam um cartão só: bordas arredondadas só na primeira e na última
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: cores.superficie,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemPrimeiro: { borderTopLeftRadius: raio, borderTopRightRadius: raio },
  itemUltimo: { borderBottomWidth: 1, borderBottomLeftRadius: raio, borderBottomRightRadius: raio },
  icone: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.fundo, alignItems: "center", justifyContent: "center" },
  descricao: { fontSize: 15, fontWeight: "600", color: cores.texto },
  detalhes: { fontSize: 13, color: cores.textoSecundario },
  etiqueta: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  etiquetaTexto: { fontSize: 12, color: cores.textoSecundario },
  valor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
  valorRiscado: { color: cores.textoSuave, textDecorationLine: "line-through" },
});
