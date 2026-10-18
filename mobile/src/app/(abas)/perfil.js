import Ionicons from "@expo/vector-icons/Ionicons";
import { File, Paths } from "expo-file-system";
import { router, useFocusEffect } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar, Aviso, Botao, Campo, Cartao } from "../../componentes/ui";
import { api } from "../../lib/api";
import { dolares, mesAtual, nomeDoMes } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";
import { cores, espaco, raio } from "../../lib/tema";

const ROTULO_TAREFA = {
  "extrair:CUPOM": "Cupons",
  "extrair:FATURA": "Faturas",
  "extrair:EXTRATO": "Extratos",
  "extrair:COMPROVANTE": "Comprovantes",
  "extrair:CONTA_CONSUMO": "Contas",
  "extrair:TEXTO": "Gastos por texto",
  categorizar: "Categorização",
  assistente: "Assistente",
  pergunta: "Pergunte ao Bolso",
  nfce: "Cupons por QR Code",
};

function ItemMenu({ icone, titulo, aoTocar, perigo }) {
  return (
    <Pressable onPress={aoTocar} style={({ pressed }) => [estilos.item, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <Ionicons name={icone} size={22} color={perigo ? cores.critico : cores.marca} />
      <Text style={estilos.itemTexto}>{titulo}</Text>
      <Ionicons name="chevron-forward" size={18} color={cores.textoSuave} />
    </Pressable>
  );
}

// Confirmação com senha antes de apagar tudo
function ExcluirConta({ visivel, aoFechar, aoExcluir }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [excluindo, setExcluindo] = useState(false);

  async function confirmar() {
    setErro(null);
    setExcluindo(true);
    try {
      await aoExcluir(senha);
    } catch (e) {
      setErro(e.message);
      setExcluindo(false);
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={estilos.fundoModal}>
        <View style={estilos.modal}>
          <Text style={estilos.modalTitulo}>Excluir minha conta</Text>
          <Text style={estilos.modalTexto}>
            Isso apaga para sempre sua conta, seus lançamentos, orçamentos e histórico. Exporte seus dados antes se quiser
            guardar uma cópia.
          </Text>
          <Campo value={senha} onChangeText={setSenha} placeholder="Digite sua senha para confirmar" secureTextEntry />
          <Aviso mensagem={erro} />
          <Botao titulo="Excluir definitivamente" icone="trash-outline" aoTocar={confirmar} carregando={excluindo} desativado={!senha} />
          <Botao titulo="Cancelar" variante="secundario" aoTocar={aoFechar} />
        </View>
      </View>
    </Modal>
  );
}

export default function Perfil() {
  const { usuario, sair } = useSessao();
  const [uso, setUso] = useState(null);
  const [erro, setErro] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const mes = mesAtual();

  useFocusEffect(
    useCallback(() => {
      api.usoIa(mes).then(setUso).catch((e) => setErro(e.message));
    }, [mes]),
  );

  // Gera a planilha no celular e abre o "compartilhar" (salvar no Drive, mandar por e-mail...)
  async function exportar() {
    setErro(null);
    setExportando(true);
    try {
      const csv = await api.exportarCsv();
      const arquivo = new File(Paths.cache, "bolso-lancamentos.csv");
      arquivo.create({ overwrite: true });
      arquivo.write(csv);
      await Sharing.shareAsync(arquivo.uri, { mimeType: "text/csv", dialogTitle: "Exportar lançamentos" });
    } catch (e) {
      setErro(`Não deu para exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  }

  async function excluirConta(senha) {
    await api.excluirMinhaConta(senha);
    setExcluindo(false);
    await sair();
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cartao style={estilos.conta}>
        <Avatar nome={usuario?.nome} tamanho={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={estilos.nome} numberOfLines={1}>{usuario?.nome}</Text>
          <Text style={estilos.email} numberOfLines={1}>{usuario?.email}</Text>
        </View>
      </Cartao>

      <Cartao style={{ paddingVertical: 4 }}>
        <ItemMenu icone="card-outline" titulo="Contas e cartões" aoTocar={() => router.push("/contas")} />
        <ItemMenu icone="repeat" titulo="Gastos fixos" aoTocar={() => router.push("/fixos")} />
        <ItemMenu icone="pie-chart-outline" titulo="Orçamentos" aoTocar={() => router.push("/orcamentos")} />
        <ItemMenu icone="pricetags-outline" titulo="Preços dos produtos" aoTocar={() => router.push("/produtos")} />
      </Cartao>

      <Text style={estilos.secao}>Uso da IA em {nomeDoMes(mes).toLowerCase()}</Text>
      {uso && (
        <Cartao style={{ gap: espaco.p }}>
          <Text style={estilos.custo}>{dolares(uso.custoUsd)}</Text>
          <Text style={estilos.legenda}>usados dos seus créditos da API do Claude</Text>
          {uso.porTarefa.map((t) => (
            <View key={t.tarefa} style={estilos.linha}>
              <Text style={estilos.linhaTexto}>
                {ROTULO_TAREFA[t.tarefa] ?? t.tarefa} ({t.chamadas})
              </Text>
              <Text style={estilos.linhaValor}>{dolares(t.custoUsd)}</Text>
            </View>
          ))}
        </Cartao>
      )}

      <Text style={estilos.secao}>Seus dados</Text>
      <Aviso mensagem={erro} />
      <Cartao style={{ paddingVertical: 4 }}>
        <ItemMenu
          icone="download-outline"
          titulo={exportando ? "Gerando planilha..." : "Exportar lançamentos (planilha)"}
          aoTocar={exportando ? undefined : exportar}
        />
        <ItemMenu icone="trash-outline" titulo="Excluir minha conta" aoTocar={() => setExcluindo(true)} perigo />
      </Cartao>

      <View style={{ marginTop: espaco.m }}>
        <Botao titulo="Sair" icone="log-out-outline" variante="secundario" aoTocar={sair} />
      </View>

      {excluindo && <ExcluirConta visivel aoFechar={() => setExcluindo(false)} aoExcluir={excluirConta} />}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 12, paddingBottom: 40 },
  nome: { fontSize: 18, fontWeight: "700", color: cores.texto },
  email: { fontSize: 14, color: cores.textoSecundario },
  conta: { flexDirection: "row", alignItems: "center", gap: 14 },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto, marginTop: espaco.p },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  itemTexto: { flex: 1, fontSize: 16, color: cores.texto },
  custo: { fontSize: 32, fontWeight: "700", color: cores.texto },
  legenda: { fontSize: 14, color: cores.textoSecundario, marginTop: -6 },
  linha: { flexDirection: "row", justifyContent: "space-between" },
  linhaTexto: { fontSize: 15, color: cores.texto },
  linhaValor: { fontSize: 15, color: cores.texto, fontVariant: ["tabular-nums"] },
  fundoModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: espaco.m },
  modal: { backgroundColor: cores.superficie, borderRadius: raio, padding: espaco.m, gap: 12 },
  modalTitulo: { fontSize: 18, fontWeight: "700", color: cores.texto },
  modalTexto: { fontSize: 15, lineHeight: 21, color: cores.textoSecundario },
});
