import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CartaoAssistente, ListaAlertas, ListaAssinaturas, ListaContas, ListaOrcamentos } from "../../componentes/painel";
import { CartaoPrecos } from "../../componentes/precos";
import { Aviso, Cartao, SeletorMes, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { mesAtual, reais } from "../../lib/formato";
import { saudacao } from "../../lib/saudacao";
import { useSessao } from "../../lib/sessao";
import { cores, espaco, raio } from "../../lib/tema";
import { useAvisos } from "../../componentes/avisos";

function Resumo({ titulo, valor, destaque }) {
  return (
    <Cartao style={[estilos.resumo, destaque && estilos.resumoDestaque]}>
      <Text style={estilos.resumoTitulo}>{titulo}</Text>
      <Text style={[estilos.resumoValor, destaque && estilos.resumoValorDestaque]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
    </Cartao>
  );
}

// Barra horizontal de uma categoria: comprimento proporcional à maior categoria,
// valor e percentual escritos ao lado (a cor nunca é a única informação)
function LinhaCategoria({ item, maior }) {
  const largura = maior > 0 ? Math.max((item.total / maior) * 100, 2) : 0;
  return (
    <View style={estilos.linha} accessible accessibilityLabel={`${item.categoria}: ${reais(item.total)}, ${item.percentual}%`}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.linhaNome} numberOfLines={1}>{item.categoria}</Text>
        <Text style={estilos.linhaValor}>{reais(item.total)}</Text>
      </View>
      <View style={estilos.linhaBarraArea}>
        <View style={estilos.trilho}>
          <View style={[estilos.barra, { width: `${largura}%` }]} />
        </View>
        <Text style={estilos.percentual}>{item.percentual.toLocaleString("pt-BR")}%</Text>
      </View>
    </View>
  );
}

// Boas-vindas no topo, no lugar do título da tela. Frase pronta escolhida pelo horário e pelo dia.
function BoasVindas() {
  const { usuario } = useSessao();
  const { titulo, frase } = saudacao(usuario?.nome);
  return (
    <View style={estilos.boasVindas}>
      <Text style={estilos.boasVindasTitulo}>{titulo}</Text>
      <Text style={estilos.boasVindasFrase}>{frase}</Text>
    </View>
  );
}

// Atalho para o chat, com cara de campo de busca
function Perguntar() {
  return (
    <Pressable
      onPress={() => router.push("/perguntar")}
      style={({ pressed }) => [estilos.perguntar, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel="Pergunte ao Bolso"
    >
      <Ionicons name="chatbubble-ellipses-outline" size={20} color={cores.marca} />
      <Text style={estilos.perguntarTexto} numberOfLines={1}>Pergunte ao Bolso sobre seus gastos</Text>
    </Pressable>
  );
}

export default function Painel() {
  const { toast } = useAvisos();
  const topo = useSafeAreaInsets().top;
  const [mes, setMes] = useState(mesAtual());
  const [painel, setPainel] = useState(null);
  const [orcamentos, setOrcamentos] = useState([]);
  const [assinaturas, setAssinaturas] = useState(null);
  const [assistente, setAssistente] = useState(null);
  const [precos, setPrecos] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    // O assistente pode chamar a IA e demorar uns segundos: carrega à parte, sem segurar o painel
    setPensando(true);
    api
      .assistente(mes)
      .then(setAssistente)
      .catch(() => setAssistente(null))
      .finally(() => setPensando(false));
    api.produtos().then(setPrecos).catch(() => setPrecos(null));
    try {
      setErro(null);
      const [resumo, listaOrcamentos, recorrentes, avisos] = await Promise.all([
        api.painel(mes),
        api.orcamentos(mes),
        api.assinaturas(mes),
        api.alertas(mes),
      ]);
      setPainel(resumo);
      setOrcamentos(listaOrcamentos);
      setAssinaturas(recorrentes);
      setAlertas(avisos);
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

  // Resposta a um alerta ou assinatura; recarrega só o que muda
  async function responder(acao, mensagem) {
    try {
      await acao();
      toast(mensagem);
      const [avisos, recorrentes] = await Promise.all([api.alertas(mes), api.assinaturas(mes)]);
      setAlertas(avisos);
      setAssinaturas(recorrentes);
    } catch (e) {
      setErro(e.message);
    }
  }
  const MENSAGEM_MARCACAO = {
    ok: "Aviso dispensado",
    cancelar: "Marcada para cancelar. Se cobrar de novo, o Bolso avisa",
    ignorar: "Tirada das cobranças recorrentes",
  };
  const marcar = (chave, tipo) => responder(() => api.marcar(chave, tipo), MENSAGEM_MARCACAO[tipo]);
  const desmarcar = (chave) => responder(() => api.desmarcar(chave), "Marcação desfeita");

  async function puxarParaAtualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  const maior = painel?.porCategoria[0]?.total ?? 0;

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: topo + espaco.g }]}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={cores.marca} />}
    >
      <BoasVindas />
      <Perguntar />
      <SeletorMes mes={mes} aoMudar={setMes} />
      <Aviso mensagem={erro} />
      <ListaAlertas alertas={alertas} aoMarcar={marcar} aoAbrir={(id) => router.push(`/lancamento?id=${id}`)} />

      <CartaoAssistente
        assistente={assistente?.mes === mes ? assistente : null}
        carregando={pensando && assistente?.mes !== mes}
      />

      {painel && (
        <>
          <Resumo titulo="Gastos do mês" valor={reais(painel.despesas)} destaque />
          <View style={estilos.resumos}>
            <Resumo titulo="Entradas" valor={reais(painel.receitas)} />
            <Resumo titulo="Saldo" valor={reais(painel.saldo)} />
          </View>

          <ListaOrcamentos orcamentos={orcamentos} aoEditar={() => router.push("/orcamentos")} />

          <Text style={estilos.secao}>Para onde foi o dinheiro</Text>
          {painel.porCategoria.length === 0 ? (
            <Vazio icone="receipt-outline" texto="Nenhum gasto neste mês. Adicione um cupom, uma fatura ou digite um gasto." />
          ) : (
            <Cartao style={estilos.categorias}>
              {painel.porCategoria.map((item) => (
                <LinhaCategoria key={item.categoriaId ?? "sem"} item={item} maior={maior} />
              ))}
            </Cartao>
          )}

          <ListaContas porConta={painel.porConta} />
          <ListaAssinaturas dados={assinaturas} aoMarcar={marcar} aoDesmarcar={desmarcar} />
          <CartaoPrecos dados={precos} aoTocar={() => router.push("/produtos")} />
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 12 },
  boasVindas: { gap: 4, marginBottom: espaco.p },
  boasVindasTitulo: { fontSize: 28, fontWeight: "700", color: cores.texto },
  boasVindasFrase: { fontSize: 16, lineHeight: 22, color: cores.textoSecundario },
  perguntar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: espaco.m,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  perguntarTexto: { flex: 1, fontSize: 15, color: cores.textoSuave },
  resumos: { flexDirection: "row", gap: 12 },
  resumo: { flex: 1, gap: 4 },
  resumoDestaque: { paddingVertical: espaco.g },
  resumoTitulo: { fontSize: 14, color: cores.textoSecundario },
  resumoValor: { fontSize: 20, fontWeight: "700", color: cores.texto },
  resumoValorDestaque: { fontSize: 36 },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto, marginTop: espaco.p },
  categorias: { gap: espaco.m },
  linha: { gap: 6 },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", gap: espaco.p },
  linhaNome: { fontSize: 15, color: cores.texto, flex: 1 },
  linhaValor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
  linhaBarraArea: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  // Barra fina com ponta arredondada e base reta, crescendo da esquerda
  barra: {
    height: 10,
    backgroundColor: cores.marca,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  trilho: { flex: 1 },
  percentual: { fontSize: 13, color: cores.textoSecundario, minWidth: 48, textAlign: "right", fontVariant: ["tabular-nums"] },
});
