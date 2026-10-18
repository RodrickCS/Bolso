import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Aviso, Botao, Campo, Cartao, Rotulo, Vazio } from "../componentes/ui";
import { api } from "../lib/api";
import { diaMes, lerValorBR, reais, valorParaCampo } from "../lib/formato";
import { cores, espaco, raios, fonte, peso, entrelinha } from "../lib/tema";
import { useAvisos } from "../componentes/avisos";

function Editar({ fixo, aoFechar, aoSalvar, aoApagar }) {
  const [valor, setValor] = useState(valorParaCampo(fixo.valor));
  const [dia, setDia] = useState(String(fixo.dia));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const numero = lerValorBR(valor);
    const diaNumero = Number(dia);
    if (!numero) return setErro("Informe um valor válido, como 44,90.");
    if (!Number.isInteger(diaNumero) || diaNumero < 1 || diaNumero > 31) return setErro("O dia vai de 1 a 31.");
    setErro(null);
    setSalvando(true);
    try {
      await aoSalvar({ valor: numero, dia: diaNumero });
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={estilos.fundoModal}>
        <View style={estilos.modal}>
          <Text style={estilos.modalTitulo}>{fixo.descricao}</Text>
          <Rotulo>Valor por mês</Rotulo>
          <Campo value={valor} onChangeText={setValor} keyboardType="decimal-pad" accessibilityLabel="Valor por mês" />
          <Rotulo>Dia do vencimento</Rotulo>
          <Campo value={dia} onChangeText={setDia} keyboardType="number-pad" maxLength={2} accessibilityLabel="Dia do vencimento" />
          <Aviso mensagem={erro} />
          <Botao titulo="Salvar" icone="checkmark" aoTocar={salvar} carregando={salvando} />
          <Botao titulo="Apagar gasto fixo" icone="trash-outline" variante="secundario" aoTocar={aoApagar} />
          <Botao titulo="Cancelar" variante="secundario" aoTocar={aoFechar} />
        </View>
      </View>
    </Modal>
  );
}

// Gastos fixos: o que se repete todo mês (assinaturas, aluguel, mensalidades)
export default function Fixos() {
  const { alerta, toast } = useAvisos();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(() => api.recorrencias().then(setDados).catch((e) => setErro(e.message)), []);
  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  async function alterar(fixo, mudancas) {
    try {
      setErro(null);
      await api.editarRecorrencia(fixo.id, mudancas);
      await carregar();
      if (mudancas.ativa !== undefined) toast(mudancas.ativa ? "Voltou a repetir todo mês" : "Gasto fixo pausado");
    } catch (e) {
      setErro(e.message);
    }
  }

  async function salvarEdicao(mudancas) {
    await api.editarRecorrencia(editando.id, mudancas);
    setEditando(null);
    await carregar();
    toast("Gasto fixo atualizado");
  }

  function apagar(fixo) {
    alerta("Apagar gasto fixo?", "Os lançamentos que ele já fez continuam. Só os próximos deixam de ser criados.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          try {
            await api.apagarRecorrencia(fixo.id);
            setEditando(null);
            await carregar();
            toast("Gasto fixo apagado");
          } catch (e) {
            setErro(e.message);
          }
        },
      },
    ]);
  }

  if (!dados && !erro) return <ActivityIndicator style={{ marginTop: espaco.ggg }} color={cores.marca} />;
  const lista = dados?.recorrencias ?? [];

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Aviso mensagem={erro} />
      {lista.length > 0 && (
        <Cartao style={{ gap: espaco.xs }}>
          <Text style={estilos.secundario}>Gastos fixos por mês</Text>
          <Text style={estilos.total}>{reais(dados.totalMensal)}</Text>
          <Text style={estilos.secundario}>{reais(dados.totalMensal * 12)} por ano</Text>
        </Cartao>
      )}
      <Text style={estilos.ajuda}>
        No dia do vencimento, o Bolso lança cada gasto sozinho. Quando a fatura ou o extrato chega, a cobrança real
        substitui o lançamento automático.
      </Text>

      {lista.length === 0 ? (
        <Vazio
          icone="repeat"
          texto={'Nenhum gasto fixo ainda. Lance uma assinatura, aluguel ou mensalidade e o Bolso marca sozinho, ou escolha "Repetir todo mês" no lançamento.'}
        />
      ) : (
        <Cartao style={{ gap: espaco.m }}>
          {lista.map((fixo) => (
            <View key={fixo.id} style={estilos.linha}>
              <Pressable onPress={() => setEditando(fixo)} style={({ pressed }) => [{ flex: 1, gap: espaco.xs }, pressed && { opacity: 0.6 }]}>
                <Text style={[estilos.nome, !fixo.ativa && estilos.parado]} numberOfLines={1}>{fixo.descricao}</Text>
                <Text style={estilos.secundario}>
                  {fixo.ativa ? `Todo dia ${fixo.dia} · próximo ${diaMes(fixo.proximaData)}` : "Parado"}
                  {fixo.categoria ? ` · ${fixo.categoria.nome}` : ""}
                </Text>
                {fixo.criadaPorIa && (
                  <View style={estilos.ia}>
                    <Ionicons name="sparkles" size={11} color={cores.textoSuave} />
                    <Text style={estilos.iaTexto}>marcado pela IA</Text>
                  </View>
                )}
              </Pressable>
              <Text style={[estilos.valor, !fixo.ativa && estilos.parado]}>{reais(fixo.valor)}</Text>
              <Switch
                value={fixo.ativa}
                onValueChange={(ativa) => alterar(fixo, { ativa })}
                trackColor={{ true: cores.marca, false: cores.borda }}
                accessibilityLabel={`${fixo.descricao}: ${fixo.ativa ? "repetindo todo mês" : "parado"}`}
              />
            </View>
          ))}
        </Cartao>
      )}

      {editando && (
        <Editar fixo={editando} aoFechar={() => setEditando(null)} aoSalvar={salvarEdicao} aoApagar={() => apagar(editando)} />
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.pm, paddingBottom: espaco.ggg },
  total: { fontSize: fonte.xxl, fontWeight: peso.forte, color: cores.texto },
  secundario: { fontSize: fonte.sm, color: cores.textoSecundario },
  ajuda: { fontSize: fonte.sm, lineHeight: entrelinha.sm, color: cores.textoSuave },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.pm },
  nome: { fontSize: fonte.md, color: cores.texto },
  valor: { fontSize: fonte.md, fontWeight: peso.medio, color: cores.texto, fontVariant: ["tabular-nums"] },
  parado: { color: cores.textoSuave },
  ia: { flexDirection: "row", alignItems: "center", gap: espaco.xs },
  iaTexto: { fontSize: fonte.xs, color: cores.textoSuave },
  fundoModal: { flex: 1, backgroundColor: cores.veu, justifyContent: "center", padding: espaco.m },
  modal: { backgroundColor: cores.superficie, borderRadius: raios.m, padding: espaco.m, gap: espaco.p },
  modalTitulo: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto },
});
