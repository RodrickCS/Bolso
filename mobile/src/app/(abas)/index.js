import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AreaMeses, Rosca, fatiasDoMes, iconeCategoria } from "../../componentes/graficos";
import { CartaoAssistente, ContasECartoes, ListaAlertas, ListaAssinaturas, ListaOrcamentos } from "../../componentes/painel";
import { CartaoPrecos } from "../../componentes/precos";
import { Aviso, Cartao, Vazio } from "../../componentes/ui";
import { api } from "../../lib/api";
import { diaMes, mesAtual, nomeDoMes, reais, somarMes } from "../../lib/formato";
import { saudacao } from "../../lib/saudacao";
import { useSessao } from "../../lib/sessao";
import { cores, espaco, raio } from "../../lib/tema";
import { useAvisos } from "../../componentes/avisos";

const percentualBR = (valor) => `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const soMes = (mes) => nomeDoMes(mes).split(" ")[0].toLowerCase();

// Topo: inicial do nome e a saudação do momento
function Cabecalho() {
  const { usuario } = useSessao();
  const { titulo, frase } = saudacao(usuario?.nome);
  const inicial = usuario?.nome?.trim()[0]?.toUpperCase() ?? "B";
  return (
    <View style={estilos.cabecalho}>
      <View style={estilos.avatar}>
        <Text style={estilos.avatarTexto}>{inicial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.saudacao} numberOfLines={1}>{titulo}</Text>
        <Text style={estilos.frase} numberOfLines={2}>{frase}</Text>
      </View>
    </View>
  );
}

function SeletorMes({ mes, aoMudar }) {
  return (
    <View style={estilos.seletor}>
      <Pressable onPress={() => aoMudar(somarMes(mes, -1))} hitSlop={12} style={estilos.seletorSeta} accessibilityLabel="Mês anterior">
        <Ionicons name="chevron-back" size={18} color={cores.textoSecundario} />
      </Pressable>
      <Text style={estilos.seletorTexto}>{nomeDoMes(mes)}</Text>
      <Pressable onPress={() => aoMudar(somarMes(mes, 1))} hitSlop={12} style={estilos.seletorSeta} accessibilityLabel="Próximo mês">
        <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
      </Pressable>
    </View>
  );
}

// Comparação com o mês anterior. No mês em andamento a conta seria injusta (mês pela metade
// contra mês inteiro), então mostra o total do mês passado como referência.
function Comparacao({ painel, emAndamento }) {
  const anterior = painel.historico.at(-2);
  if (!anterior?.despesas) return null;
  const nome = soMes(anterior.mes);

  if (emAndamento && painel.despesas < anterior.despesas) {
    return <Text style={estilos.comparacao}>Em {nome} inteiro foram {reais(anterior.despesas)}</Text>;
  }
  const variacao = ((painel.despesas - anterior.despesas) / anterior.despesas) * 100;
  const subiu = variacao > 0;
  const texto = emAndamento
    ? `Já passou ${nome} inteiro (${reais(anterior.despesas)})`
    : `${percentualBR(Math.abs(variacao))} ${subiu ? "a mais" : "a menos"} que ${nome}`;
  return (
    <View style={estilos.comparacaoLinha}>
      {/* Gastar mais é ruim: seta para cima em vermelho, para baixo em verde. O texto diz o mesmo. */}
      <Ionicons name={subiu ? "trending-up" : "trending-down"} size={16} color={subiu ? cores.critico : cores.marca} />
      <Text style={estilos.comparacao}>{texto}</Text>
    </View>
  );
}

function Mini({ icone, rotulo, valor }) {
  return (
    <View style={estilos.mini}>
      <View style={estilos.miniTopo}>
        <View style={estilos.miniIcone}>
          <Ionicons name={icone} size={14} color={cores.marca} />
        </View>
        <Text style={estilos.miniRotulo}>{rotulo}</Text>
      </View>
      <Text style={estilos.miniValor} numberOfLines={1} adjustsFontSizeToFit>{valor}</Text>
    </View>
  );
}

// Cartão principal: o gasto do mês em destaque, entradas e saldo, e a curva dos últimos 6 meses
function Destaque({ painel, mes }) {
  return (
    <Cartao style={estilos.destaque}>
      <Text style={estilos.destaqueRotulo}>Gastos de {soMes(mes)}</Text>
      <Text style={estilos.destaqueValor} numberOfLines={1} adjustsFontSizeToFit>{reais(painel.despesas)}</Text>
      <Comparacao painel={painel} emAndamento={mes === mesAtual()} />
      <View style={estilos.minis}>
        <Mini icone="arrow-down" rotulo="Entradas" valor={reais(painel.receitas)} />
        <Mini icone="wallet-outline" rotulo="Saldo" valor={reais(painel.saldo)} />
      </View>
      {painel.historico.some((h) => h.despesas > 0) && (
        <View style={estilos.grafico}>
          <Text style={estilos.graficoTitulo}>Gastos nos últimos 6 meses</Text>
          <AreaMeses historico={painel.historico} />
        </View>
      )}
    </Cartao>
  );
}

// Parte do todo: rosca com até 6 fatias e a legenda com nome e percentual de cada uma
function GastosPorCategoria({ painel, mes }) {
  const fatias = fatiasDoMes(painel.porCategoria, painel.despesas);
  return (
    <Cartao style={{ gap: espaco.m }}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.secao}>Gastos por categoria</Text>
        <Pressable onPress={() => router.push("/gastos")} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.link}>Ver tudo</Text>
        </Pressable>
      </View>
      {fatias.length === 0 ? (
        <Vazio icone="receipt-outline" texto="Nenhum gasto neste mês. Toque no + para adicionar um cupom, uma fatura ou digitar um gasto." />
      ) : (
        <View style={estilos.categorias}>
          <Rosca fatias={fatias} total={painel.despesas} legenda={soMes(mes)} tamanho={140} />
          <View style={estilos.legendaCategorias}>
            {fatias.map((f) => (
              <View
                key={f.chave}
                style={estilos.legendaLinha}
                accessible
                accessibilityLabel={`${f.nome}: ${reais(f.total)}, ${percentualBR(f.percentual)}`}
              >
                <View style={[estilos.ponto, { backgroundColor: f.cor }]} />
                <Text style={estilos.legendaNome} numberOfLines={1}>{f.nome}</Text>
                <Text style={estilos.legendaPercentual}>{Math.round(f.percentual)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Cartao>
  );
}

function TransacoesRecentes({ transacoes }) {
  // As cópias conciliadas (o mesmo gasto que veio de novo na fatura) não aparecem duas vezes
  const recentes = transacoes.filter((t) => !t.conciliadaComId).slice(0, 5);
  if (!recentes.length) return null;
  return (
    <Cartao style={{ gap: 12 }}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.secao}>Transações recentes</Text>
        <Pressable onPress={() => router.push("/gastos")} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.link}>Ver todas</Text>
        </Pressable>
      </View>
      {recentes.map((t) => {
        const receita = t.tipo === "RECEITA";
        return (
          <Pressable
            key={t.id}
            onPress={() => router.push(`/lancamento?id=${t.id}`)}
            style={({ pressed }) => [estilos.transacao, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <View style={[estilos.transacaoIcone, receita && { backgroundColor: cores.marcaSuave }]}>
              <Ionicons name={iconeCategoria(t.categoria?.nome)} size={18} color={receita ? cores.marca : cores.textoSecundario} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={estilos.transacaoNome} numberOfLines={1}>{t.descricao}</Text>
              <Text style={estilos.transacaoDetalhe} numberOfLines={1}>
                {[t.categoria?.nome, diaMes(t.data), t.conta?.nome].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <Text style={[estilos.transacaoValor, receita && { color: cores.marca }]}>
              {receita ? "+ " : "− "}
              {reais(t.valor)}
            </Text>
          </Pressable>
        );
      })}
    </Cartao>
  );
}

export default function Painel() {
  const { toast } = useAvisos();
  const topo = useSafeAreaInsets().top;
  const [mes, setMes] = useState(mesAtual());
  const [painel, setPainel] = useState(null);
  const [transacoes, setTransacoes] = useState([]);
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
      const [resumo, lista, listaOrcamentos, recorrentes, avisos] = await Promise.all([
        api.painel(mes),
        api.transacoes(mes),
        api.orcamentos(mes),
        api.assinaturas(mes),
        api.alertas(mes),
      ]);
      setPainel(resumo);
      setTransacoes(lista);
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

  // Ao trocar de mês, os dados do mês anterior não aparecem com o nome do novo
  const doMes = painel?.mes === mes ? painel : null;

  return (
    <ScrollView
      contentContainerStyle={[estilos.conteudo, { paddingTop: topo + espaco.m }]}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxarParaAtualizar} tintColor={cores.marca} />}
    >
      <Cabecalho />
      <SeletorMes mes={mes} aoMudar={setMes} />
      <Aviso mensagem={erro} />

      {!doMes ? (
        !erro && <ActivityIndicator style={{ marginTop: 48 }} color={cores.marca} />
      ) : (
        <>
          <Destaque painel={doMes} mes={mes} />
          <ListaAlertas alertas={alertas} aoMarcar={marcar} aoAbrir={(id) => router.push(`/lancamento?id=${id}`)} />
          <CartaoAssistente
            assistente={assistente?.mes === mes ? assistente : null}
            carregando={pensando && assistente?.mes !== mes}
            aoPerguntar={() => router.push("/perguntar")}
          />
          <GastosPorCategoria painel={doMes} mes={mes} />
          <ListaOrcamentos orcamentos={orcamentos} aoEditar={() => router.push("/orcamentos")} />
          <TransacoesRecentes transacoes={transacoes} />
          <ContasECartoes porConta={doMes.porConta} aoGerenciar={() => router.push("/contas")} />
          <ListaAssinaturas dados={assinaturas} aoMarcar={marcar} aoDesmarcar={desmarcar} />
          <CartaoPrecos dados={precos} aoTocar={() => router.push("/produtos")} />
        </>
      )}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 14, paddingBottom: 40 },
  cabecalho: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" },
  avatarTexto: { color: "#fff", fontSize: 18, fontWeight: "700" },
  saudacao: { fontSize: 18, fontWeight: "700", color: cores.texto },
  frase: { fontSize: 13, lineHeight: 18, color: cores.textoSecundario },
  seletor: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 4,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  seletorSeta: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  seletorTexto: { fontSize: 15, fontWeight: "600", color: cores.texto, minWidth: 140, textAlign: "center" },
  destaque: { gap: 6, borderRadius: raio * 1.5, paddingVertical: espaco.g },
  destaqueRotulo: { fontSize: 14, color: cores.textoSecundario },
  destaqueValor: { fontSize: 44, fontWeight: "700", color: cores.texto, letterSpacing: -0.5 },
  comparacaoLinha: { flexDirection: "row", alignItems: "center", gap: 6 },
  comparacao: { fontSize: 14, color: cores.textoSecundario },
  minis: { flexDirection: "row", gap: 10, marginTop: espaco.p },
  mini: { flex: 1, gap: 6, backgroundColor: cores.fundo, borderRadius: raio, padding: 12 },
  miniTopo: { flexDirection: "row", alignItems: "center", gap: 8 },
  miniIcone: { width: 26, height: 26, borderRadius: 13, backgroundColor: cores.marcaSuave, alignItems: "center", justifyContent: "center" },
  miniRotulo: { fontSize: 13, color: cores.textoSecundario },
  miniValor: { fontSize: 18, fontWeight: "700", color: cores.texto },
  grafico: { marginTop: espaco.m, gap: 4 },
  graficoTitulo: { fontSize: 13, fontWeight: "600", color: cores.textoSecundario },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: espaco.p },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  link: { fontSize: 15, fontWeight: "600", color: cores.marca },
  categorias: { flexDirection: "row", alignItems: "center", gap: espaco.m },
  legendaCategorias: { flex: 1, gap: 8 },
  legendaLinha: { flexDirection: "row", alignItems: "center", gap: 8 },
  ponto: { width: 10, height: 10, borderRadius: 5 },
  legendaNome: { flex: 1, fontSize: 14, color: cores.texto },
  legendaPercentual: { fontSize: 14, fontWeight: "600", color: cores.texto },
  transacao: { flexDirection: "row", alignItems: "center", gap: 12 },
  transacaoIcone: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.fundo, alignItems: "center", justifyContent: "center" },
  transacaoNome: { fontSize: 15, fontWeight: "600", color: cores.texto },
  transacaoDetalhe: { fontSize: 13, color: cores.textoSecundario },
  transacaoValor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
});
