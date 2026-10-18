import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GraficoPreco, Variacao } from "../componentes/precos";
import { Aviso, Botao, Campo, Cartao } from "../componentes/ui";
import { api } from "../lib/api";
import { dataBR, diaMes, reais, semAcentos } from "../lib/formato";
import { cores, espaco, raios, fonte, peso, entrelinha } from "../lib/tema";

const quantidade = (q) => q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function Renomear({ produto, aoFechar, aoSalvar }) {
  const [nome, setNome] = useState(produto.nome);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await aoSalvar(nome.trim());
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={estilos.fundoModal}>
        <View style={estilos.modal}>
          <Text style={estilos.modalTitulo}>Renomear produto</Text>
          <Campo value={nome} onChangeText={setNome} autoFocus onSubmitEditing={salvar} returnKeyType="done" />
          <Aviso mensagem={erro} />
          <Botao titulo="Salvar" aoTocar={salvar} carregando={salvando} desativado={!nome.trim()} />
          <Botao titulo="Cancelar" variante="secundario" aoTocar={aoFechar} />
        </View>
      </View>
    </Modal>
  );
}

// Escolhe o produto que vai receber as compras deste (quando a IA deu dois nomes ao mesmo produto)
function Juntar({ produto, aoFechar, aoJuntar }) {
  const [outros, setOutros] = useState(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api
      .produtos()
      .then(({ produtos }) => setOutros(produtos.filter((p) => p.id !== produto.id)))
      .catch((e) => setErro(e.message));
  }, [produto.id]);

  async function escolher(destino) {
    setErro(null);
    try {
      await aoJuntar(destino);
    } catch (e) {
      setErro(e.message);
    }
  }

  const termo = semAcentos(busca.trim().toLowerCase());
  const lista = (outros ?? []).filter((p) => !termo || semAcentos(p.nome.toLowerCase()).includes(termo));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={estilos.fundoModal}>
        <View style={[estilos.modal, { maxHeight: "80%" }]}>
          <Text style={estilos.modalTitulo}>Juntar com outro produto</Text>
          <Text style={estilos.modalTexto}>
            As compras de &quot;{produto.nome}&quot; passam para o produto escolhido, e este nome deixa de existir.
          </Text>
          <Campo value={busca} onChangeText={setBusca} placeholder="Buscar produto" />
          <Aviso mensagem={erro} />
          {!outros && !erro && <ActivityIndicator color={cores.marca} />}
          <FlatList
            data={lista}
            keyExtractor={(p) => String(p.id)}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={estilos.separador} />}
            renderItem={({ item }) => (
              <Pressable onPress={() => escolher(item)} style={({ pressed }) => [estilos.opcaoJuntar, pressed && { opacity: 0.6 }]}>
                <Text style={estilos.texto} numberOfLines={1}>{item.nome}</Text>
                <Text style={estilos.secundario}>{item.compras === 1 ? "1 compra" : `${item.compras} compras`}</Text>
              </Pressable>
            )}
            ListEmptyComponent={outros && <Text style={estilos.secundario}>Nenhum outro produto encontrado.</Text>}
          />
          <Botao titulo="Cancelar" variante="secundario" aoTocar={aoFechar} />
        </View>
      </View>
    </Modal>
  );
}

function Indicador({ titulo, children }) {
  return (
    <Cartao style={estilos.indicador}>
      <Text style={estilos.secundario}>{titulo}</Text>
      {children}
    </Cartao>
  );
}

export default function Produto() {
  const { id } = useLocalSearchParams();
  const [produto, setProduto] = useState(null);
  const [erro, setErro] = useState(null);
  const [modal, setModal] = useState(null);

  useEffect(() => {
    api.produto(id).then(setProduto).catch((e) => setErro(e.message));
  }, [id]);

  async function renomear(nome) {
    setProduto(await api.renomearProduto(produto.id, nome));
    setModal(null);
  }

  async function juntar(destino) {
    await api.juntarProduto(produto.id, destino.id);
    setModal(null);
    router.replace(`/produto?id=${destino.id}`);
  }

  if (!produto) {
    return erro ? (
      <View style={estilos.conteudo}>
        <Aviso mensagem={erro} />
      </View>
    ) : (
      <ActivityIndicator style={{ marginTop: espaco.ggg }} color={cores.marca} />
    );
  }

  const varios = produto.porMercado.length >= 2;

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Stack.Screen options={{ title: produto.nome }} />

      {produto.compras > 0 && (
        <View style={estilos.indicadores}>
          <Indicador titulo="Último preço">
            <Text style={estilos.valor}>{reais(produto.ultimoPreco)}</Text>
            <Text style={estilos.secundario}>em {dataBR(produto.ultimaData)}</Text>
          </Indicador>
          <Indicador titulo="Desde a 1ª compra">
            {produto.variacao === null ? (
              <Text style={estilos.valor}>—</Text>
            ) : (
              <Variacao percentual={produto.variacao} tamanho={20} />
            )}
            <Text style={estilos.secundario}>
              {produto.variacao === null ? "precisa de 2 compras" : `era ${reais(produto.primeiroPreco)}`}
            </Text>
          </Indicador>
        </View>
      )}

      {produto.historico.length >= 2 && (
        <>
          <Text style={estilos.secao}>Preço ao longo do tempo</Text>
          <Cartao>
            <GraficoPreco historico={produto.historico} />
          </Cartao>
        </>
      )}

      {produto.porMercado.length > 0 && (
        <>
          <Text style={estilos.secao}>{varios ? "Onde está mais barato" : "Onde você compra"}</Text>
          <Cartao style={{ gap: espaco.pm }}>
            {produto.porMercado.map((m, i) => (
              <View key={m.estabelecimento} style={estilos.linha}>
                <View style={{ flex: 1, gap: espaco.xs }}>
                  <View style={estilos.mercado}>
                    <Text style={estilos.texto} numberOfLines={1}>{m.estabelecimento}</Text>
                    {varios && i === 0 && (
                      <View style={estilos.selo}>
                        <Ionicons name="pricetag" size={11} color={cores.marca} />
                        <Text style={estilos.seloTexto}>mais barato</Text>
                      </View>
                    )}
                  </View>
                  <Text style={estilos.secundario}>última compra em {dataBR(m.ultimaData)}</Text>
                </View>
                <Text style={estilos.texto}>{reais(m.ultimoPreco)}</Text>
              </View>
            ))}
          </Cartao>
        </>
      )}

      {produto.historico.length > 0 && (
        <>
          <Text style={estilos.secao}>Compras</Text>
          <Cartao style={{ gap: espaco.pm }}>
            {[...produto.historico].reverse().map((h, i) => (
              <View key={i} style={estilos.linha}>
                <View style={{ flex: 1, gap: espaco.xs }}>
                  <Text style={estilos.texto} numberOfLines={1}>{h.estabelecimento ?? "Sem nome"}</Text>
                  <Text style={estilos.secundario}>
                    {diaMes(h.data)} · {quantidade(h.quantidade)} × {reais(h.preco)}
                  </Text>
                </View>
                <Text style={estilos.texto}>{reais(h.precoTotal)}</Text>
              </View>
            ))}
          </Cartao>
        </>
      )}

      <Text style={estilos.ajuda}>
        O preço é por unidade, ou por quilo quando o cupom traz o peso. Se a IA deu dois nomes para o mesmo produto, junte os
        dois para o histórico ficar completo.
      </Text>
      <Botao titulo="Renomear" icone="create-outline" variante="secundario" aoTocar={() => setModal("renomear")} />
      <Botao titulo="Juntar com outro produto" icone="git-merge-outline" variante="secundario" aoTocar={() => setModal("juntar")} />

      {modal === "renomear" && <Renomear produto={produto} aoFechar={() => setModal(null)} aoSalvar={renomear} />}
      {modal === "juntar" && <Juntar produto={produto} aoFechar={() => setModal(null)} aoJuntar={juntar} />}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.pm, paddingBottom: espaco.ggg },
  indicadores: { flexDirection: "row", gap: espaco.pm },
  indicador: { flex: 1, gap: espaco.xs },
  valor: { fontSize: fonte.xl, fontWeight: peso.forte, color: cores.texto },
  secao: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto, marginTop: espaco.p },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.pm },
  mercado: { flexDirection: "row", alignItems: "center", gap: espaco.p, flexShrink: 1 },
  selo: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.xs,
    backgroundColor: cores.marcaSuave,
    borderRadius: raios.pilula,
    paddingHorizontal: espaco.p,
    paddingVertical: espaco.xs,
  },
  seloTexto: { fontSize: fonte.xs, fontWeight: peso.medio, color: cores.texto },
  texto: { fontSize: fonte.md, color: cores.texto, flexShrink: 1 },
  secundario: { fontSize: fonte.sm, color: cores.textoSecundario },
  ajuda: { fontSize: fonte.sm, lineHeight: entrelinha.sm, color: cores.textoSuave, marginTop: espaco.p },
  separador: { height: 1, backgroundColor: cores.borda },
  opcaoJuntar: { paddingVertical: espaco.pm, gap: espaco.xs },
  fundoModal: { flex: 1, backgroundColor: cores.veu, justifyContent: "center", padding: espaco.m },
  modal: { backgroundColor: cores.superficie, borderRadius: raios.m, padding: espaco.m, gap: espaco.pm },
  modalTitulo: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto },
  modalTexto: { fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.textoSecundario },
});
