import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "expo-router";
import { useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAvisos } from "../../componentes/avisos";
import { api } from "../../lib/api";
import { reais } from "../../lib/formato";
import { cores, espaco, raios, fonte, peso, entrelinha, componentes } from "../../lib/tema";

const SUGESTOES = [
  "Quanto gastei este mês?",
  "Gastei 25 no almoço hoje",
  "Onde mais gastei este mês?",
  "Quais são meus gastos fixos?",
  "Crie um orçamento de 800 para Mercado",
];

const BOAS_VINDAS = {
  id: 0,
  de: "bolso",
  texto:
    "Oi! Posso responder sobre seus gastos e também anotar, corrigir ou apagar lançamentos, mexer em orçamentos, contas e gastos fixos. O que você precisa?",
};

const SITUACAO = {
  PENDENTE: { icone: "help-circle", cor: cores.marca, texto: null },
  FEITA: { icone: "checkmark-circle", cor: cores.marca, texto: "Feito" },
  CANCELADA: { icone: "close-circle", cor: cores.textoSuave, texto: "Cancelado" },
  DESFEITA: { icone: "arrow-undo-circle", cor: cores.textoSuave, texto: "Desfeito" },
};

const ehApagar = (acao) => acao.tipo.startsWith("apagar_") || /^(Apagar|Remover)/.test(acao.resumo);

function Linhas({ linhas }) {
  if (!linhas?.length) return null;
  return (
    <View style={estilos.linhas}>
      {linhas.map((l, i) => (
        <View key={i} style={estilos.linha}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.linhaRotulo} numberOfLines={1}>{l.rotulo}</Text>
            {!!l.detalhe && <Text style={estilos.linhaDetalhe}>{l.detalhe}</Text>}
          </View>
          <Text style={estilos.linhaValor}>{reais(l.valor)}</Text>
        </View>
      ))}
    </View>
  );
}

function BotaoCartao({ titulo, aoTocar, variante = "secundario", desativado }) {
  const cor = variante === "perigo" ? cores.critico : variante === "primario" ? cores.sobreMarca : cores.marca;
  return (
    <Pressable
      onPress={aoTocar}
      disabled={desativado}
      style={({ pressed }) => [
        estilos.botaoCartao,
        variante === "primario" && { backgroundColor: cores.marca },
        variante === "perigo" && { backgroundColor: cores.criticoSuave },
        variante === "secundario" && { backgroundColor: cores.marcaSuave },
        (pressed || desativado) && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
    >
      <Text style={[estilos.botaoCartaoTexto, { color: cor }]}>{titulo}</Text>
    </Pressable>
  );
}

// Cartão de uma ação do assistente: o que vai mudar (ou mudou) e os botões
function CartaoAcao({ acao, aoMudar }) {
  const { toast } = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const visual = SITUACAO[acao.situacao];
  const visiveis = acao.detalhes.slice(0, 5);

  async function agir(fazer, mensagem) {
    setOcupado(true);
    try {
      const nova = await fazer(acao.id);
      aoMudar(nova);
      if (nova.situacao === "FEITA") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(mensagem);
    } catch (e) {
      toast(e.message, { tipo: "erro" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <View style={[estilos.cartao, acao.situacao === "PENDENTE" && estilos.cartaoPendente]}>
      <View style={estilos.cartaoTopo}>
        <Ionicons name={visual.icone} size={20} color={visual.cor} />
        <Text style={[estilos.cartaoResumo, acao.situacao === "CANCELADA" && estilos.riscado]}>{acao.resumo}</Text>
      </View>
      {visiveis.map((linha, i) => (
        <Text key={i} style={estilos.cartaoDetalhe} numberOfLines={1}>{linha}</Text>
      ))}
      {acao.detalhes.length > visiveis.length && (
        <Text style={estilos.cartaoDetalhe}>e mais {acao.detalhes.length - visiveis.length}</Text>
      )}

      {acao.situacao === "PENDENTE" ? (
        <View style={estilos.cartaoBotoes}>
          <BotaoCartao titulo="Cancelar" aoTocar={() => agir(api.cancelarAcao, "Cancelado")} desativado={ocupado} />
          <BotaoCartao
            titulo={ehApagar(acao) ? "Apagar" : "Confirmar"}
            variante={ehApagar(acao) ? "perigo" : "primario"}
            aoTocar={() => agir(api.confirmarAcao, ehApagar(acao) ? "Apagado" : "Feito")}
            desativado={ocupado}
          />
        </View>
      ) : (
        <View style={estilos.cartaoRodape}>
          <Text style={estilos.cartaoSituacao}>{visual.texto}</Text>
          {acao.podeDesfazer && (
            <Pressable onPress={() => agir(api.desfazerAcao, "Desfeito")} disabled={ocupado} hitSlop={10} accessibilityRole="button">
              <Text style={estilos.desfazer}>Desfazer</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Mensagem({ mensagem, aoMudarAcao }) {
  const minha = mensagem.de === "voce";
  return (
    <View style={{ gap: espaco.p }}>
      <View style={[estilos.bolha, minha ? estilos.bolhaMinha : estilos.bolhaBolso, mensagem.erro && estilos.bolhaErro]}>
        <Text style={[estilos.bolhaTexto, minha && estilos.bolhaTextoMinha, mensagem.erro && { color: cores.erro }]}>{mensagem.texto}</Text>
        <Linhas linhas={mensagem.linhas} />
      </View>
      {mensagem.acoes?.map((acao) => (
        <CartaoAcao key={acao.id} acao={acao} aoMudar={(nova) => aoMudarAcao(mensagem.id, nova)} />
      ))}
    </View>
  );
}

// O que a IA precisa lembrar da conversa: o texto de cada lado e como ficou cada cartão
function paraHistorico(mensagens) {
  return mensagens
    .filter((m) => m.id !== BOAS_VINDAS.id && !m.erro)
    .map((m) => {
      const cartoes = (m.acoes ?? []).map((a) => `[${a.resumo}: ${SITUACAO[a.situacao].texto ?? "aguardando confirmação"}]`);
      return { papel: m.de === "voce" ? "usuario" : "bolso", texto: [m.texto, ...cartoes].join("\n") };
    });
}

// Assistente do Bolso: conversa, consulta e age nos dados. Editar e apagar pedem confirmação no cartão.
export default function Perguntar() {
  const navegacao = useNavigation();
  const [mensagens, setMensagens] = useState([BOAS_VINDAS]);
  const [referencias, setReferencias] = useState("");
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const rolagem = useRef(null);

  useLayoutEffect(() => {
    navegacao.setOptions({
      headerRight: () =>
        mensagens.length > 1 ? (
          <Pressable
            onPress={() => {
              setMensagens([BOAS_VINDAS]);
              setReferencias("");
            }}
            hitSlop={10}
            style={{ marginRight: espaco.m }}
            accessibilityRole="button"
            accessibilityLabel="Começar uma nova conversa"
          >
            <Ionicons name="create-outline" size={22} color={cores.marca} />
          </Pressable>
        ) : null,
    });
  }, [navegacao, mensagens.length]);

  async function enviar(pedido = texto) {
    const limpo = pedido.trim();
    if (!limpo || pensando) return;
    setTexto("");
    const historico = paraHistorico(mensagens);
    setMensagens((atuais) => [...atuais, { id: Date.now(), de: "voce", texto: limpo }]);
    setPensando(true);
    try {
      const resposta = await api.conversar(limpo, historico, referencias);
      setReferencias(resposta.referencias ?? "");
      setMensagens((atuais) => [
        ...atuais,
        { id: Date.now() + 1, de: "bolso", texto: resposta.resposta, linhas: resposta.linhas, acoes: resposta.acoes },
      ]);
    } catch (e) {
      setMensagens((atuais) => [...atuais, { id: Date.now() + 1, de: "bolso", texto: e.message, erro: true }]);
    } finally {
      setPensando(false);
    }
  }

  function mudarAcao(mensagemId, nova) {
    setMensagens((atuais) =>
      atuais.map((m) => (m.id === mensagemId ? { ...m, acoes: m.acoes.map((a) => (a.id === nova.id ? nova : a)) } : m)),
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView
        ref={rolagem}
        contentContainerStyle={estilos.conversa}
        onContentSizeChange={() => rolagem.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {mensagens.map((m) => (
          <Mensagem key={m.id} mensagem={m} aoMudarAcao={mudarAcao} />
        ))}
        {pensando && (
          <View style={[estilos.bolha, estilos.bolhaBolso, estilos.pensando]}>
            <ActivityIndicator size="small" color={cores.marca} />
            <Text style={estilos.linhaDetalhe}>Pensando...</Text>
          </View>
        )}
        {mensagens.length === 1 && (
          <View style={estilos.sugestoes}>
            {SUGESTOES.map((s) => (
              <Pressable key={s} onPress={() => enviar(s)} style={({ pressed }) => [estilos.sugestao, pressed && { opacity: 0.6 }]}>
                <Text style={estilos.sugestaoTexto}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={estilos.barra}>
        <TextInput
          style={estilos.campo}
          value={texto}
          onChangeText={setTexto}
          placeholder="Pergunte ou peça algo"
          placeholderTextColor={cores.textoSuave}
          onSubmitEditing={() => enviar()}
          returnKeyType="send"
          maxLength={500}
          editable={!pensando}
        />
        <Pressable
          onPress={() => enviar()}
          disabled={!texto.trim() || pensando}
          style={({ pressed }) => [estilos.enviar, (!texto.trim() || pensando || pressed) && { opacity: 0.5 }]}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensagem"
        >
          <Ionicons name="arrow-up" size={22} color={cores.sobreMarca} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conversa: { padding: espaco.m, gap: espaco.pm, paddingBottom: espaco.g },
  bolha: { maxWidth: "88%", borderRadius: raios.g, paddingHorizontal: espaco.m, paddingVertical: espaco.p, gap: espaco.p },
  bolhaBolso: { alignSelf: "flex-start", backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda },
  bolhaMinha: { alignSelf: "flex-end", backgroundColor: cores.marca },
  bolhaErro: { backgroundColor: cores.erroSuave, borderColor: cores.erroSuave },
  bolhaTexto: { fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.texto },
  bolhaTextoMinha: { color: cores.sobreMarca },
  pensando: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  linhas: { gap: espaco.p, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: espaco.p },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.m },
  linhaRotulo: { fontSize: fonte.sm, color: cores.texto },
  linhaDetalhe: { fontSize: fonte.xs, color: cores.textoSecundario },
  linhaValor: { fontSize: fonte.sm, fontWeight: peso.medio, color: cores.texto, fontVariant: ["tabular-nums"] },
  cartao: {
    alignSelf: "flex-start",
    width: "88%",
    gap: espaco.xs,
    padding: espaco.pm,
    borderRadius: raios.m,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  cartaoPendente: { borderColor: cores.marca },
  cartaoTopo: { flexDirection: "row", alignItems: "flex-start", gap: espaco.p, marginBottom: espaco.xs },
  cartaoResumo: { flex: 1, fontSize: fonte.md, lineHeight: entrelinha.md, fontWeight: peso.medio, color: cores.texto },
  riscado: { textDecorationLine: "line-through", color: cores.textoSuave },
  cartaoDetalhe: { fontSize: fonte.sm, color: cores.textoSecundario, marginLeft: espaco.g + espaco.xs },
  cartaoBotoes: { flexDirection: "row", gap: espaco.p, marginTop: espaco.p },
  botaoCartao: { flex: 1, minHeight: componentes.toqueMinimo, borderRadius: raios.m, alignItems: "center", justifyContent: "center" },
  botaoCartaoTexto: { fontSize: fonte.md, fontWeight: peso.medio },
  cartaoRodape: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: espaco.xs },
  cartaoSituacao: { fontSize: fonte.sm, color: cores.textoSecundario },
  desfazer: { fontSize: fonte.md, fontWeight: peso.medio, color: cores.marca },
  sugestoes: { gap: espaco.p, marginTop: espaco.p },
  sugestao: {
    alignSelf: "flex-start",
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.marca,
    paddingHorizontal: espaco.m,
    paddingVertical: espaco.p,
  },
  sugestaoTexto: { fontSize: fonte.sm, color: cores.marca, fontWeight: peso.medio },
  barra: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    padding: espaco.p,
    paddingHorizontal: espaco.m,
    // Folga para o botão "+" da barra de abas, que fica saltado para cima
    paddingBottom: espaco.g,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  campo: {
    flex: 1,
    minHeight: componentes.toqueMinimo,
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.borda,
    paddingHorizontal: espaco.m,
    fontSize: fonte.md,
    color: cores.texto,
    backgroundColor: cores.fundo,
  },
  enviar: {
    width: componentes.toqueMinimo,
    height: componentes.toqueMinimo,
    borderRadius: raios.pilula,
    backgroundColor: cores.marca,
    alignItems: "center",
    justifyContent: "center",
  },
});
