import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Variacao } from "../componentes/precos";
import { Aviso, Campo, Cartao, Opcoes, Vazio } from "../componentes/ui";
import { api } from "../lib/api";
import { dataBR, reais, semAcentos, variacao } from "../lib/formato";
import { cores, espaco } from "../lib/tema";

const ORDENS = [
  { valor: "gasto", rotulo: "Mais comprados" },
  { valor: "subiu", rotulo: "Mais subiram" },
  { valor: "caiu", rotulo: "Mais baixaram" },
];

const ORDENAR = {
  gasto: () => 0, // a API já manda do que mais pesa no bolso para o que menos pesa
  subiu: (a, b) => (b.variacao ?? -Infinity) - (a.variacao ?? -Infinity),
  caiu: (a, b) => (a.variacao ?? Infinity) - (b.variacao ?? Infinity),
};

function Inflacao({ inflacao }) {
  if (!inflacao) {
    return (
      <Cartao style={{ gap: 6 }}>
        <Text style={estilos.titulo}>Sua inflação pessoal</Text>
        <Text style={estilos.explicacao}>
          Continue enviando fotos de cupons fiscais. Quando pelo menos 3 produtos aparecerem em compras de dias diferentes, o
          Bolso calcula quanto os preços do que você compra mudaram.
        </Text>
      </Cartao>
    );
  }
  return (
    <Cartao style={{ gap: 6 }}>
      <Text style={estilos.titulo}>Sua inflação pessoal</Text>
      <Text style={estilos.numero}>{variacao(inflacao.percentual)}</Text>
      <Text style={estilos.explicacao}>
        Média da mudança de preço de {inflacao.produtos} produtos desde {dataBR(inflacao.desde)}, com mais peso para os que
        você mais compra.
      </Text>
    </Cartao>
  );
}

function LinhaProduto({ produto }) {
  return (
    <Pressable
      onPress={() => router.push(`/produto?id=${produto.id}`)}
      style={({ pressed }) => [estilos.linha, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={estilos.nome} numberOfLines={1}>{produto.nome}</Text>
        <Text style={estilos.detalhe} numberOfLines={1}>
          {reais(produto.ultimoPreco)} · {produto.compras === 1 ? "1 compra" : `${produto.compras} compras`}
          {produto.ultimoEstabelecimento ? ` · ${produto.ultimoEstabelecimento}` : ""}
        </Text>
        {produto.maisBarato && (
          <View style={estilos.dica}>
            <Ionicons name="pricetag-outline" size={13} color={cores.marca} />
            <Text style={estilos.detalhe} numberOfLines={1}>
              {reais(produto.maisBarato.preco)} em {produto.maisBarato.estabelecimento}
            </Text>
          </View>
        )}
      </View>
      <Variacao percentual={produto.variacao} />
    </Pressable>
  );
}

export default function Produtos() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("gasto");

  useFocusEffect(
    useCallback(() => {
      api.produtos().then(setDados).catch((e) => setErro(e.message));
    }, []),
  );

  if (!dados && !erro) return <ActivityIndicator style={{ marginTop: 48 }} color={cores.marca} />;

  const termo = semAcentos(busca.trim().toLowerCase());
  const lista = (dados?.produtos ?? [])
    .filter((p) => !termo || semAcentos(p.nome.toLowerCase()).includes(termo))
    .sort(ORDENAR[ordem]);

  return (
    <FlatList
      data={lista}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <LinhaProduto produto={item} />}
      ItemSeparatorComponent={() => <View style={estilos.separador} />}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 12 }}>
          <Aviso mensagem={erro} />
          {dados && <Inflacao inflacao={dados.inflacao} />}
          {dados?.produtos.length > 0 && (
            <>
              <Campo value={busca} onChangeText={setBusca} placeholder="Buscar produto" returnKeyType="search" />
              <Opcoes opcoes={ORDENS} valor={ordem} aoMudar={setOrdem} />
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        dados && (
          <Vazio
            icone="cart-outline"
            texto={
              dados.produtos.length
                ? "Nenhum produto com esse nome."
                : "Os produtos aparecem aqui quando você envia a foto de um cupom fiscal com os itens."
            }
          />
        )
      }
    />
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, paddingBottom: 40 },
  titulo: { fontSize: 15, fontWeight: "700", color: cores.texto },
  numero: { fontSize: 36, fontWeight: "700", color: cores.texto },
  explicacao: { fontSize: 14, lineHeight: 20, color: cores.textoSecundario },
  linha: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  nome: { fontSize: 16, color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSecundario, flexShrink: 1 },
  dica: { flexDirection: "row", alignItems: "center", gap: 4 },
  separador: { height: 1, backgroundColor: cores.borda },
});
