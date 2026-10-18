import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aviso, Botao, Campo, Cartao, Opcoes, Rotulo } from "../componentes/ui";
import { api } from "../lib/api";
import { iconeCategoria } from "../lib/categorias";
import { PELO_TIPO } from "../lib/contas";
import { dataBR, hojeISO, lerDataBR, lerValorBR, reais, valorParaCampo } from "../lib/formato";
import { cores, espaco, raios, fonte, peso } from "../lib/tema";
import { useAvisos } from "../componentes/avisos";

const TIPOS = [
  { valor: "DESPESA", rotulo: "Gasto" },
  { valor: "RECEITA", rotulo: "Entrada" },
];

// Ao criar, "Automático" deixa a IA (ou a categoria Assinaturas) decidir se é um gasto fixo
const REPETIR_NOVO = [
  { valor: null, rotulo: "Automático" },
  { valor: true, rotulo: "Sim" },
  { valor: false, rotulo: "Não" },
];
const REPETIR_EDICAO = REPETIR_NOVO.slice(1);

// Cria um lançamento à mão (sem IA) ou edita um existente (/lancamento?id=123)
export default function Lancamento() {
  const { alerta, toast } = useAvisos();
  const { id } = useLocalSearchParams();
  const editando = Boolean(id);

  const [carregando, setCarregando] = useState(true);
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [original, setOriginal] = useState(null);
  const [tipo, setTipo] = useState("DESPESA");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(dataBR(hojeISO()));
  const [categoriaId, setCategoriaId] = useState(null);
  const [contaId, setContaId] = useState(null);
  const [repetir, setRepetir] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([api.categorias(), api.contas(), editando ? api.transacao(id) : null])
      .then(([cats, listaContas, transacao]) => {
        setCategorias(cats);
        setContas(listaContas);
        if (transacao) {
          setOriginal(transacao);
          setTipo(transacao.tipo);
          setValor(valorParaCampo(transacao.valor));
          setDescricao(transacao.descricao);
          setData(dataBR(transacao.data));
          setCategoriaId(transacao.categoria?.id ?? null);
          setContaId(transacao.conta?.id ?? null);
          setRepetir(Boolean(transacao.recorrencia?.ativa));
        }
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [id, editando]);

  function mudarTipo(novo) {
    setTipo(novo);
    // A categoria escolhida pode não existir para o outro tipo (Salário não é gasto)
    if (categorias.find((c) => c.id === categoriaId)?.tipo !== novo) setCategoriaId(null);
  }

  async function salvar() {
    setErro(null);
    const valorNumero = lerValorBR(valor);
    const dataISO = lerDataBR(data);
    if (!valorNumero) return setErro("Informe um valor válido, como 35 ou 35,90.");
    if (!descricao.trim()) return setErro("Informe uma descrição.");
    if (!dataISO) return setErro("Informe a data no formato DD/MM/AAAA.");

    const dados = { tipo, valor: valorNumero, descricao: descricao.trim(), data: dataISO, contaId };
    setSalvando(true);
    try {
      if (editando) {
        await api.editarTransacao(id, { ...dados, categoriaId });
        if (tipo === "DESPESA" && repetir !== Boolean(original.recorrencia?.ativa)) await api.repetirTransacao(id, repetir);
      } else {
        // Sem categoria escolhida, o Bolso usa a memória ou sugere uma; sem "repetir", decide se é gasto fixo
        await api.criarTransacao({
          ...dados,
          contaId: contaId ?? undefined,
          categoriaId: categoriaId ?? undefined,
          repetir: tipo === "DESPESA" ? (repetir ?? undefined) : false,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(editando ? "Lançamento atualizado" : "Lançamento adicionado");
      router.back();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  function apagar() {
    alerta("Apagar lançamento?", `${original.descricao} · ${reais(original.valor)}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.apagarTransacao(id);
            toast("Lançamento apagado");
            router.back();
          } catch (e) {
            setErro(e.message);
          }
        },
      },
    ]);
  }

  const opcoesCategoria = [
    ...(editando ? [] : [{ valor: null, rotulo: "Automática", icone: "sparkles-outline" }]),
    ...categorias.filter((c) => c.tipo === tipo).map((c) => ({ valor: c.id, rotulo: c.nome, icone: iconeCategoria(c.nome) })),
  ];
  const opcoesConta = [
    { valor: null, rotulo: "Nenhuma" },
    ...contas.map((c) => ({ valor: c.id, rotulo: c.nome, icone: PELO_TIPO[c.tipo]?.icone })),
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ title: editando ? "Editar lançamento" : "Novo lançamento" }} />
      {carregando ? (
        <ActivityIndicator color={cores.marca} style={{ marginTop: espaco.ggg }} />
      ) : (
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          {original?.conciliadaComId && (
            <View style={estilos.nota}>
              <Ionicons name="link-outline" size={16} color={cores.textoSecundario} />
              <Text style={estilos.notaTexto}>
                {original.origem === "RECORRENTE"
                  ? "Lançado automaticamente pelo gasto fixo. A cobrança real já chegou e é ela que conta."
                  : "Este gasto também veio na fatura e já é contado por lá."}
              </Text>
            </View>
          )}
          {original?.origem === "RECORRENTE" && !original.conciliadaComId && (
            <View style={estilos.nota}>
              <Ionicons name="repeat" size={16} color={cores.textoSecundario} />
              <Text style={estilos.notaTexto}>
                Lançado automaticamente pelo gasto fixo. Quando a fatura chegar, a cobrança real substitui este.
              </Text>
            </View>
          )}

          {/* O valor é o principal da tela: grande, no topo, com o tipo logo acima */}
          <View style={estilos.valorCartao}>
            <Opcoes opcoes={TIPOS} valor={tipo} aoMudar={mudarTipo} />
            <View style={estilos.valorLinha}>
              <Text style={estilos.valorMoeda}>R$</Text>
              <TextInput
                value={valor}
                onChangeText={setValor}
                placeholder="0,00"
                placeholderTextColor={cores.textoSuave}
                keyboardType="decimal-pad"
                autoFocus={!editando}
                style={[estilos.valorEntrada, tipo === "RECEITA" && { color: cores.marca }]}
                accessibilityLabel="Valor"
              />
            </View>
          </View>

          <Rotulo>Descrição</Rotulo>
          <Campo value={descricao} onChangeText={setDescricao} placeholder="Ex: Padaria" accessibilityLabel="Descrição" />

          <Rotulo>Data</Rotulo>
          <Campo value={data} onChangeText={setData} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" accessibilityLabel="Data" />

          <Rotulo>Categoria</Rotulo>
          <Opcoes opcoes={opcoesCategoria} valor={categoriaId} aoMudar={setCategoriaId} />
          {editando && (
            <Text style={estilos.dica}>O Bolso vai lembrar da categoria para os próximos gastos desse lugar.</Text>
          )}

          <Rotulo>Conta ou cartão</Rotulo>
          <Opcoes opcoes={opcoesConta} valor={contaId} aoMudar={setContaId} />

          {tipo === "DESPESA" && (
            <>
              <Rotulo>Repetir todo mês</Rotulo>
              <Opcoes opcoes={editando ? REPETIR_EDICAO : REPETIR_NOVO} valor={repetir} aoMudar={setRepetir} />
              <Text style={estilos.dica}>
                {repetir === null
                  ? "O Bolso marca sozinho se for assinatura, aluguel ou mensalidade."
                  : repetir
                    ? "Todo mês, no mesmo dia, o Bolso lança este gasto sozinho."
                    : "Fica só neste mês."}
              </Text>
            </>
          )}

          {original?.itens?.length > 0 && (
            <>
              <Rotulo>Itens do cupom</Rotulo>
              <Cartao style={{ gap: espaco.p }}>
                {original.itens.map((item) => (
                  <View key={item.id} style={estilos.item}>
                    <Text style={estilos.itemNome} numberOfLines={1}>
                      {item.produto?.nomeCanonico ?? item.descricao}
                    </Text>
                    <Text style={estilos.itemValor}>{reais(item.precoTotal)}</Text>
                  </View>
                ))}
              </Cartao>
            </>
          )}
        </ScrollView>
      )}
      <SafeAreaView edges={["bottom"]} style={estilos.rodape}>
        <Aviso mensagem={erro} />
        <Botao titulo="Salvar" icone="checkmark" aoTocar={salvar} carregando={salvando} desativado={carregando} />
        {editando && original && <Botao titulo="Apagar lançamento" icone="trash-outline" variante="secundario" aoTocar={apagar} />}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.p, paddingBottom: espaco.g },
  nota: { flexDirection: "row", gap: espaco.p, alignItems: "center", marginBottom: espaco.p },
  notaTexto: { flex: 1, fontSize: fonte.sm, color: cores.textoSecundario },
  dica: { fontSize: fonte.sm, color: cores.textoSuave },
  valorCartao: {
    gap: espaco.pm,
    padding: espaco.m,
    marginBottom: espaco.p,
    backgroundColor: cores.superficie,
    borderRadius: raios.g,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  valorLinha: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  valorMoeda: { fontSize: fonte.xl, fontWeight: peso.medio, color: cores.textoSecundario },
  valorEntrada: { flex: 1, minWidth: 0, fontSize: fonte.numero, fontWeight: peso.forte, color: cores.texto, paddingVertical: espaco.xs },
  item: { flexDirection: "row", justifyContent: "space-between", gap: espaco.p },
  itemNome: { flex: 1, fontSize: fonte.sm, color: cores.texto },
  itemValor: { fontSize: fonte.sm, color: cores.texto, fontVariant: ["tabular-nums"] },
  rodape: { padding: espaco.m, gap: espaco.p, borderTopWidth: 1, borderTopColor: cores.borda, backgroundColor: cores.fundo },
});
