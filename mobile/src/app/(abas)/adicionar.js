import Ionicons from "@expo/vector-icons/Ionicons";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { HistoricoEnvios } from "../../componentes/historico";
import { Resultado } from "../../componentes/resultado";
import { Aviso, Cartao, Opcoes } from "../../componentes/ui";
import { aguardarDocumento, api } from "../../lib/api";
import { cores, espaco, raio } from "../../lib/tema";

const TIPOS = [
  { valor: "CUPOM", rotulo: "Cupom fiscal", detalhe: "Nota de mercado, loja, restaurante", icone: "receipt-outline" },
  { valor: "FATURA", rotulo: "Fatura do cartão", detalhe: "Todas as compras do mês", icone: "card-outline" },
  { valor: "EXTRATO", rotulo: "Extrato do banco", detalhe: "Entradas e saídas da conta", icone: "list-outline" },
  { valor: "COMPROVANTE", rotulo: "Pix ou comprovante", detalhe: "Transferência ou pagamento", icone: "swap-horizontal-outline" },
  { valor: "CONTA_CONSUMO", rotulo: "Conta ou boleto", detalhe: "Luz, água, internet, aluguel", icone: "document-text-outline" },
];

// Depois de escolher a foto ou o arquivo, pergunta o que ele é (a IA lê melhor sabendo o tipo)
function EscolherTipo({ visivel, ultimo, aoEscolher, aoCancelar }) {
  // Sem isso, no Android a folha fica atrás da barra de navegação
  const baixo = useSafeAreaInsets().bottom;
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoCancelar}>
      <Pressable style={estilos.fundoFolha} onPress={aoCancelar} accessibilityLabel="Cancelar" />
      <View style={[estilos.folha, { paddingBottom: baixo + espaco.m }]}>
        <Text style={estilos.folhaTitulo}>O que é este documento?</Text>
        {TIPOS.map((t) => (
          <Pressable
            key={t.valor}
            onPress={() => aoEscolher(t.valor)}
            style={({ pressed }) => [estilos.tipo, t.valor === ultimo && estilos.tipoUltimo, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
          >
            <Ionicons name={t.icone} size={22} color={cores.marca} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoRotulo}>{t.rotulo}</Text>
              <Text style={estilos.tipoDetalhe}>{t.detalhe}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable onPress={aoCancelar} style={estilos.cancelar} accessibilityRole="button">
          <Text style={estilos.cancelarTexto}>Cancelar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

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
      <Ionicons name={icone} size={26} color={destaque ? "#fff" : cores.marca} />
      <Text style={[estilos.atalhoTitulo, destaque && { color: "#fff" }]}>{titulo}</Text>
      <Text style={[estilos.atalhoDica, destaque && { color: "#e8f5ee" }]} numberOfLines={1}>{dica}</Text>
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
  const [texto, setTexto] = useState("");
  const [ultimoTipo, setUltimoTipo] = useState("CUPOM");
  // Foto ou arquivo escolhido, esperando a pessoa dizer o que é: (tipo) => Promise do envio
  const [aguardandoTipo, setAguardandoTipo] = useState(null);
  const [lendo, setLendo] = useState(false);
  const [documento, setDocumento] = useState(null);
  const [erro, setErro] = useState(null);
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState(null);
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
    } catch (e) {
      setErro(e.message);
    }
  }

  async function naoRepetir(transacao) {
    try {
      await api.repetirTransacao(transacao.id, false);
      setDocumento(await api.documento(documento.id));
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
      Alert.alert("Permissão necessária", daCamera ? "Libere a câmera nas configurações." : "Libere o acesso às fotos nas configurações.");
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
        <View style={estilos.campoTexto}>
          <TextInput
            style={estilos.entrada}
            placeholder="Ex: gastei 35 no uber ontem"
            placeholderTextColor={cores.textoSuave}
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={enviarTexto}
            returnKeyType="send"
            editable={!lendo}
            accessibilityLabel="Digite um gasto"
          />
          <Pressable
            onPress={enviarTexto}
            disabled={lendo || !texto.trim()}
            style={[estilos.enviar, (lendo || !texto.trim()) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Adicionar gasto"
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
        <Pressable onPress={() => router.push("/lancamento")} hitSlop={8} accessibilityRole="button" style={estilos.manual}>
          <Ionicons name="create-outline" size={16} color={cores.marca} />
          <Text style={estilos.manualTexto}>Preencher à mão, sem IA</Text>
        </Pressable>

        {contas.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={estilos.rotulo}>Pagou com</Text>
            <Opcoes
              opcoes={[{ valor: null, rotulo: "Não informar" }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]}
              valor={contaId}
              aoMudar={setContaId}
            />
          </View>
        )}

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

        <EscolherTipo
          visivel={Boolean(aguardandoTipo)}
          ultimo={ultimoTipo}
          aoEscolher={escolherTipo}
          aoCancelar={() => setAguardandoTipo(null)}
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
  conteudo: { padding: espaco.m, gap: 12, paddingBottom: 40 },
  rotulo: { fontSize: 14, fontWeight: "600", color: cores.textoSecundario, marginTop: espaco.p },
  campoTexto: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    minHeight: 52,
    paddingLeft: espaco.m,
    paddingRight: 6,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  entrada: { flex: 1, fontSize: 16, color: cores.texto, paddingVertical: 12 },
  enviar: { width: 40, height: 40, borderRadius: 20, backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" },
  manual: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  manualTexto: { fontSize: 14, fontWeight: "600", color: cores.marca },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  atalho: {
    flexBasis: "47%",
    flexGrow: 1,
    gap: 2,
    padding: 12,
    borderRadius: raio,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  atalhoDestaque: { backgroundColor: cores.marca, borderColor: cores.marca },
  atalhoTitulo: { fontSize: 15, fontWeight: "700", color: cores.texto, marginTop: 6 },
  atalhoDica: { fontSize: 12, color: cores.textoSecundario },
  lendo: { flexDirection: "row", alignItems: "center", gap: 12 },
  lendoTexto: { flex: 1, color: cores.textoSecundario },
  fundoFolha: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  folha: {
    backgroundColor: cores.superficie,
    borderTopLeftRadius: raio * 2,
    borderTopRightRadius: raio * 2,
    padding: espaco.m,
    gap: 4,
  },
  folhaTitulo: { fontSize: 17, fontWeight: "700", color: cores.texto, marginBottom: espaco.p },
  tipo: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, paddingHorizontal: espaco.p, borderRadius: raio },
  tipoUltimo: { backgroundColor: cores.marcaSuave },
  tipoRotulo: { fontSize: 15, fontWeight: "600", color: cores.texto },
  tipoDetalhe: { fontSize: 13, color: cores.textoSecundario },
  cancelar: { alignItems: "center", paddingVertical: 12, marginTop: espaco.p },
  cancelarTexto: { fontSize: 15, fontWeight: "600", color: cores.textoSecundario },
});
