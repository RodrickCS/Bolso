import Ionicons from "@expo/vector-icons/Ionicons";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Folha } from "../../componentes/folha";
import { HistoricoEnvios } from "../../componentes/historico";
import { Resultado } from "../../componentes/resultado";
import { Aviso, Cartao } from "../../componentes/ui";
import { aguardarDocumento, api } from "../../lib/api";
import { PELO_TIPO } from "../../lib/contas";
import { cores, espaco, raios, fonte, peso, entrelinha } from "../../lib/tema";
import { useAvisos } from "../../componentes/avisos";

const TIPOS = [
  { valor: "CUPOM", rotulo: "Cupom fiscal", detalhe: "Nota de mercado, loja, restaurante", icone: "receipt-outline" },
  { valor: "FATURA", rotulo: "Fatura do cartão", detalhe: "Todas as compras do mês", icone: "card-outline" },
  { valor: "EXTRATO", rotulo: "Extrato do banco", detalhe: "Entradas e saídas da conta", icone: "list-outline" },
  { valor: "COMPROVANTE", rotulo: "Pix ou comprovante", detalhe: "Transferência ou pagamento", icone: "swap-horizontal-outline" },
  { valor: "CONTA_CONSUMO", rotulo: "Conta ou boleto", detalhe: "Luz, água, internet, aluguel", icone: "document-text-outline" },
];

// Atalho em grade: ícone, nome curto e uma dica
function Atalho({ icone, titulo, dica, aoTocar, destaque, desativado }) {
  return (
    <Pressable
      onPress={aoTocar}
      disabled={desativado}
      style={({ pressed }) => [estilos.atalho, destaque && estilos.atalhoDestaque, (pressed || desativado) && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}: ${dica}`}
    >
      <Ionicons name={icone} size={26} color={destaque ? cores.sobreMarca : cores.marca} />
      <Text style={[estilos.atalhoTitulo, destaque && { color: cores.sobreMarca }]}>{titulo}</Text>
      <Text style={[estilos.atalhoDica, destaque && { color: cores.sobreMarcaSuave }]} numberOfLines={1}>{dica}</Text>
    </Pressable>
  );
}

const LADO_MAXIMO = 1000;
const LIMITE_ARQUIVO = 10 * 1024 * 1024;

// Foto menor = menos tokens na API e upload mais rápido. 1000px ainda é legível para a IA.
// O base64 sai direto do editor de imagem: no Expo Go o app não tem permissão para ler o arquivo salvo.
async function fotoEmBase64(asset) {
  const tamanho = asset.width >= asset.height ? { width: LADO_MAXIMO } : { height: LADO_MAXIMO };
  const contexto = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > LADO_MAXIMO) contexto.resize(tamanho);
  const imagem = await contexto.renderAsync();
  const salva = await imagem.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return salva.base64;
}

export default function Adicionar() {
  const { alerta, toast } = useAvisos();
  const [texto, setTexto] = useState("");
  const [ultimoTipo, setUltimoTipo] = useState("CUPOM");
  // Foto ou arquivo escolhido, esperando a pessoa dizer o que é: (tipo) => Promise do envio
  const [aguardandoTipo, setAguardandoTipo] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [documento, setDocumento] = useState(null);
  const [erro, setErro] = useState(null);
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState(null);
  const [escolhendoConta, setEscolhendoConta] = useState(false);
  const [historico, setHistorico] = useState([]);

  const carregarHistorico = useCallback(() => api.documentos().then(setHistorico).catch(() => {}), []);

  useFocusEffect(
    useCallback(() => {
      carregarHistorico();
      api.contas().then(setContas).catch(() => {});
    }, [carregarHistorico]),
  );

  // Enquanto algum envio ainda estiver sendo lido, atualiza a lista sozinha
  const temPendente = historico.some((d) => d.status === "PENDENTE" || d.status === "PROCESSANDO");
  useEffect(() => {
    if (!temPendente) return;
    const intervalo = setInterval(carregarHistorico, 5000);
    return () => clearInterval(intervalo);
  }, [temPendente, carregarHistorico]);

  async function apagarEnvio(doc, comLancamentos) {
    try {
      await api.apagarDocumento(doc.id, comLancamentos);
      if (documento?.id === doc.id) setDocumento(null);
      await carregarHistorico();
      toast(comLancamentos ? "Envio e lançamentos apagados" : "Envio tirado da lista");
    } catch (e) {
      setErro(e.message);
    }
  }

  async function naoRepetir(transacao) {
    try {
      await api.repetirTransacao(transacao.id, false);
      setDocumento(await api.documento(documento.id));
      toast("Não vai mais repetir todo mês");
    } catch (e) {
      setErro(e.message);
    }
  }

  async function acompanhar(envio) {
    setErro(null);
    setDocumento(null);
    setLendo(true);
    try {
      const enviado = await envio();
      carregarHistorico();
      setDocumento(await aguardarDocumento(enviado.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setLendo(false);
      carregarHistorico();
    }
  }

  const contaEscolhida = contas.find((c) => c.id === contaId);

  function enviarTexto() {
    if (!texto.trim()) return;
    acompanhar(async () => {
      const enviado = await api.enviarTexto(texto.trim(), contaId ?? undefined);
      setTexto("");
      return enviado;
    });
  }

  async function usarFoto(daCamera) {
    const permissao = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      alerta("Permissão necessária", daCamera ? "Libere a câmera nas configurações." : "Libere o acesso às fotos nas configurações.");
      return;
    }
    const opcoes = { mediaTypes: ["images"], quality: 1 };
    const escolha = daCamera ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
    if (escolha.canceled) return;
    const foto = escolha.assets[0];
    setAguardandoTipo(() => async (tipo) =>
      api.enviarArquivo({ base64: await fotoEmBase64(foto), nome: "foto.jpg", mimeType: "image/jpeg" }, tipo, contaId ?? undefined),
    );
  }

  function escolherTipo(tipo) {
    const envio = aguardandoTipo;
    setAguardandoTipo(null);
    setUltimoTipo(tipo);
    acompanhar(() => envio(tipo));
  }

  // Seletor do próprio expo-file-system: os arquivos que ele devolve o app tem permissão para ler.
  // Aceita qualquer tipo: no Android CSV e OFX chegam com tipos variados, e quem confere o formato é a API.
  async function usarArquivo() {
    const escolha = await File.pickFileAsync({ mimeTypes: ["*/*"] });
    if (escolha.canceled) return;
    const arquivo = escolha.result;
    const envio = async (tipo) => {
      if (arquivo.size > LIMITE_ARQUIVO) throw new Error("Arquivo maior que 10 MB. Envie um arquivo menor.");
      return api.enviarArquivo({ base64: await arquivo.base64(), nome: arquivo.name, mimeType: arquivo.type }, tipo, contaId ?? undefined);
    };
    // CSV e OFX são sempre extrato; para PDF e imagem, pergunta o que é
    if (/\.(csv|ofx|qfx)$/i.test(arquivo.name ?? "")) acompanhar(() => envio("EXTRATO"));
    else setAguardandoTipo(() => envio);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        {/* Caixa de lançamento: texto, conta usada, lançamento à mão e enviar, tudo junto */}
        <View style={estilos.caixa}>
          <TextInput
            style={estilos.entrada}
            placeholder={"O que você gastou?\nEx: 35 no uber ontem"}
            placeholderTextColor={cores.textoSuave}
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={enviarTexto}
            submitBehavior="submit"
            returnKeyType="send"
            multiline
            editable={!lendo}
            accessibilityLabel="O que você gastou?"
          />
          <View style={estilos.barraCaixa}>
            {contas.length > 0 && (
              <Pressable
                onPress={() => setEscolhendoConta(true)}
                style={({ pressed }) => [estilos.pilula, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`Pagou com: ${contaEscolhida?.nome ?? "não informado"}`}
              >
                <Ionicons name={PELO_TIPO[contaEscolhida?.tipo]?.icone ?? "wallet-outline"} size={15} color={cores.textoSecundario} />
                <Text style={estilos.pilulaTexto} numberOfLines={1}>{contaEscolhida?.nome ?? "Pagou com"}</Text>
                <Ionicons name="chevron-down" size={14} color={cores.textoSecundario} />
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push("/lancamento")}
              style={({ pressed }) => [estilos.pilula, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Preencher à mão, sem IA"
            >
              <Ionicons name="create-outline" size={15} color={cores.textoSecundario} />
              <Text style={estilos.pilulaTexto}>À mão</Text>
            </Pressable>
            <Pressable
              onPress={enviarTexto}
              disabled={lendo || !texto.trim()}
              style={[estilos.enviar, (lendo || !texto.trim()) && estilos.enviarDesligado]}
              accessibilityRole="button"
              accessibilityLabel="Adicionar gasto"
            >
              <Ionicons name="arrow-up" size={18} color={cores.sobreMarca} />
            </Pressable>
          </View>
        </View>

        <Text style={estilos.rotulo}>Ou envie um documento</Text>
        <View style={estilos.grade}>
          <Atalho
            icone="qr-code-outline"
            titulo="QR Code"
            dica="Cupom fiscal"
            destaque
            desativado={lendo}
            aoTocar={() => router.push(contaId ? `/qrcode?contaId=${contaId}` : "/qrcode")}
          />
          <Atalho icone="camera-outline" titulo="Câmera" dica="Tirar foto" desativado={lendo} aoTocar={() => usarFoto(true)} />
          <Atalho icone="images-outline" titulo="Galeria" dica="Print ou foto salva" desativado={lendo} aoTocar={() => usarFoto(false)} />
          <Atalho icone="document-outline" titulo="Arquivo" dica="PDF, CSV ou OFX" desativado={lendo} aoTocar={usarArquivo} />
        </View>

        {lendo && (
          <Cartao style={estilos.lendo}>
            <ActivityIndicator color={cores.marca} />
            <Text style={estilos.lendoTexto}>A IA está lendo... faturas podem levar alguns segundos.</Text>
          </Cartao>
        )}
        <Aviso mensagem={erro} />
        {documento && <Resultado documento={documento} aoNaoRepetir={naoRepetir} />}

        <Folha
          visivel={Boolean(aguardandoTipo)}
          titulo="O que é este documento?"
          opcoes={TIPOS}
          selecionado={ultimoTipo}
          aoEscolher={escolherTipo}
          aoCancelar={() => setAguardandoTipo(null)}
        />
        <Folha
          visivel={escolhendoConta}
          titulo="Pagou com"
          opcoes={[
            { valor: null, rotulo: "Não informar", icone: "remove-circle-outline" },
            ...contas.map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: PELO_TIPO[c.tipo]?.rotulo, icone: PELO_TIPO[c.tipo]?.icone ?? "wallet-outline" })),
          ]}
          selecionado={contaId}
          aoEscolher={(id) => {
            setContaId(id);
            setEscolhendoConta(false);
          }}
          aoCancelar={() => setEscolhendoConta(false)}
        />

        <HistoricoEnvios
          documentos={historico}
          aoApagar={apagarEnvio}
          aoReenviarTexto={(doc) => acompanhar(() => api.enviarTexto(doc.texto, doc.contaId ?? undefined))}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.pm, paddingBottom: espaco.ggg },
  rotulo: { fontSize: fonte.sm, fontWeight: peso.medio, color: cores.textoSecundario, marginTop: espaco.p },
  caixa: {
    borderRadius: raios.m + 4,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
    padding: espaco.pm,
    gap: espaco.p,
  },
  entrada: { minHeight: 52, maxHeight: 120, fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.texto, textAlignVertical: "top", padding: 0 },
  barraCaixa: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  pilula: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.xs,
    height: 32,
    paddingHorizontal: espaco.p,
    borderRadius: raios.g,
    backgroundColor: cores.fundo,
    maxWidth: 160,
  },
  pilulaTexto: { fontSize: fonte.sm, fontWeight: peso.medio, color: cores.textoSecundario, flexShrink: 1 },
  enviar: {
    marginLeft: "auto",
    width: 36,
    height: 36,
    borderRadius: raios.pilula,
    backgroundColor: cores.marca,
    alignItems: "center",
    justifyContent: "center",
  },
  enviarDesligado: { backgroundColor: cores.textoSuave, opacity: 0.35 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: espaco.p },
  atalho: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: espaco.xs,
    padding: espaco.pm,
    borderRadius: raios.m,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  atalhoDestaque: { backgroundColor: cores.marca, borderColor: cores.marca },
  atalhoTitulo: { fontSize: fonte.md, fontWeight: peso.forte, color: cores.texto, marginTop: espaco.p },
  atalhoDica: { fontSize: fonte.xs, color: cores.textoSecundario },
  lendo: { flexDirection: "row", alignItems: "center", gap: espaco.pm },
  lendoTexto: { flex: 1, color: cores.textoSecundario },
});
