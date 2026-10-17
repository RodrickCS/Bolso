import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Aviso, Cartao, SeletorMes, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { mesAtual, reais } from "../../lib/formato";
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

export default function Painel() {
  const [mes, setMes] = useState(mesAtual());
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro(null);
      setPainel(await api.painel(mes));
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
      contentContainerStyle={estilos.conteudo}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={cores.marca} />}
    >
      <SeletorMes mes={mes} aoMudar={setMes} />
      <Aviso mensagem={erro} />

      {painel && (
        <>
          <Resumo titulo="Gastos do mês" valor={reais(painel.despesas)} destaque />
          <View style={estilos.resumos}>
            <Resumo titulo="Entradas" valor={reais(painel.receitas)} />
            <Resumo titulo="Saldo" valor={reais(painel.saldo)} />
          </View>

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
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 12 },
  resumos: { flexDirection: "row", gap: 12 },
  resumo: { flex: 1, gap: 4 },
  resumoDestaque: { paddingVertical: espaco.g },
  resumoTitulo: { fontSize: 14, color: cores.textoSecundario },
  resumoValor: { fontSize: 20, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
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
