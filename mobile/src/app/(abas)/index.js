import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CartaoAssistente, ListaAssinaturas, ListaOrcamentos } from "../../componentes/painel";
import { Aviso, Cartao, SeletorMes, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { mesAtual, reais } from "../../lib/formato";
import { saudacao } from "../../lib/saudacao";
import { useSessao } from "../../lib/sessao";
import { cores, espaco } from "../../lib/tema";

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

export default function Painel() {
  const topo = useSafeAreaInsets().top;
  const [mes, setMes] = useState(mesAtual());
  const [painel, setPainel] = useState(null);
  const [orcamentos, setOrcamentos] = useState([]);
  const [assinaturas, setAssinaturas] = useState(null);
  const [assistente, setAssistente] = useState(null);
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
    try {
      setErro(null);
      const [resumo, listaOrcamentos, recorrentes] = await Promise.all([
        api.painel(mes),
        api.orcamentos(mes),
        api.assinaturas(mes),
      ]);
      setPainel(resumo);
      setOrcamentos(listaOrcamentos);
      setAssinaturas(recorrentes);
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [carregar]),
  );

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
      <SeletorMes mes={mes} aoMudar={setMes} />
      <Aviso mensagem={erro} />

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

          <ListaAssinaturas dados={assinaturas} />
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
