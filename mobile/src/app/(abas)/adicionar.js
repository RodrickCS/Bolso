import Ionicons from "@expo/vector-icons/Ionicons";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Aviso, Botao, Campo, Cartao } from "../../componentes/ui";
import { aguardarDocumento, api } from "../../lib/api";
import { reais } from "../../lib/formato";
import { cores, espaco } from "../../lib/tema";

const TIPOS = [
  { valor: "CUPOM", rotulo: "Cupom" },
  { valor: "FATURA", rotulo: "Fatura" },
  { valor: "EXTRATO", rotulo: "Extrato" },
  { valor: "COMPROVANTE", rotulo: "Pix/Comprovante" },
  { valor: "CONTA_CONSUMO", rotulo: "Conta/Boleto" },
];

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

function Resultado({ documento }) {
  if (documento.status === "ERRO") return <Aviso mensagem={`Não deu para ler: ${documento.erro}`} />;
  const transacoes = documento.transacoes ?? [];
  return (
    <Cartao style={{ gap: espaco.p }}>
      <View style={estilos.resultadoTopo}>
        <Ionicons name="checkmark-circle" size={22} color={cores.marca} />
        <Text style={estilos.resultadoTitulo}>
          {transacoes.length === 1 ? "1 lançamento adicionado" : `${transacoes.length} lançamentos adicionados`}
        </Text>
      </View>
      {!!documento.observacao && <Text style={estilos.observacao}>{documento.observacao}</Text>}
      {transacoes.map((t) => (
        <View key={t.id} style={estilos.resultadoLinha}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.resultadoDescricao} numberOfLines={1}>{t.descricao}</Text>
            <Text style={estilos.resultadoCategoria}>
              {t.categoria?.nome ?? "Sem categoria"}
              {t.itens.length > 0 && ` · ${t.itens.length} itens`}
            </Text>
          </View>
          <Text style={estilos.resultadoValor}>{reais(t.valor)}</Text>
        </View>
      ))}
    </Cartao>
  );
}

export default function Adicionar() {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("CUPOM");
  const [lendo, setLendo] = useState(false);
  const [documento, setDocumento] = useState(null);
  const [erro, setErro] = useState(null);

  async function acompanhar(envio) {
    setErro(null);
    setDocumento(null);
    setLendo(true);
    try {
      const enviado = await envio();
      setDocumento(await aguardarDocumento(enviado.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setLendo(false);
    }
  }

  function enviarTexto() {
    if (!texto.trim()) return;
    acompanhar(async () => {
      const enviado = await api.enviarTexto(texto.trim());
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
    acompanhar(async () =>
      api.enviarArquivo({ base64: await fotoEmBase64(escolha.assets[0]), nome: "foto.jpg", mimeType: "image/jpeg" }, tipo),
    );
  }

  // Seletor do próprio expo-file-system: os arquivos que ele devolve o app tem permissão para ler
  async function usarArquivo() {
    const escolha = await File.pickFileAsync({
      mimeTypes: ["application/pdf", "text/csv", "text/comma-separated-values", "application/x-ofx", "application/octet-stream", "image/*"],
    });
    if (escolha.canceled) return;
    const arquivo = escolha.result;
    acompanhar(async () => {
      if (arquivo.size > LIMITE_ARQUIVO) throw new Error("Arquivo maior que 10 MB. Envie um arquivo menor.");
      return api.enviarArquivo({ base64: await arquivo.base64(), nome: arquivo.name, mimeType: arquivo.type }, tipo);
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.secao}>Digite um gasto</Text>
        <Campo
          placeholder="Ex: gastei 35 no uber ontem"
          value={texto}
          onChangeText={setTexto}
          onSubmitEditing={enviarTexto}
          returnKeyType="send"
          editable={!lendo}
        />
        <Botao titulo="Adicionar" icone="send" aoTocar={enviarTexto} desativado={lendo || !texto.trim()} />

        <Text style={[estilos.secao, { marginTop: espaco.m }]}>Ou envie um documento</Text>
        <View style={estilos.tipos}>
          {TIPOS.map((t) => (
            <Pressable
              key={t.valor}
              onPress={() => setTipo(t.valor)}
              style={[estilos.tipo, tipo === t.valor && estilos.tipoAtivo]}
              accessibilityRole="radio"
              accessibilityState={{ selected: tipo === t.valor }}
            >
              <Text style={[estilos.tipoTexto, tipo === t.valor && estilos.tipoTextoAtivo]}>{t.rotulo}</Text>
            </Pressable>
          ))}
        </View>
        <Botao titulo="Tirar foto" icone="camera-outline" aoTocar={() => usarFoto(true)} desativado={lendo} />
        <Botao titulo="Escolher da galeria" icone="images-outline" variante="secundario" aoTocar={() => usarFoto(false)} desativado={lendo} />
        <Botao titulo="Arquivo (PDF, CSV, OFX)" icone="document-outline" variante="secundario" aoTocar={usarArquivo} desativado={lendo} />

        {lendo && (
          <Cartao style={estilos.lendo}>
            <ActivityIndicator color={cores.marca} />
            <Text style={estilos.lendoTexto}>A IA está lendo... faturas podem levar alguns segundos.</Text>
          </Cartao>
        )}
        <Aviso mensagem={erro} />
        {documento && <Resultado documento={documento} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 12, paddingBottom: 40 },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  tipos: { flexDirection: "row", flexWrap: "wrap", gap: espaco.p },
  tipo: {
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.superficie,
  },
  tipoAtivo: { backgroundColor: cores.marca, borderColor: cores.marca },
  tipoTexto: { fontSize: 14, color: cores.texto },
  tipoTextoAtivo: { color: "#fff", fontWeight: "600" },
  lendo: { flexDirection: "row", alignItems: "center", gap: 12 },
  lendoTexto: { flex: 1, color: cores.textoSecundario },
  resultadoTopo: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  resultadoTitulo: { fontSize: 16, fontWeight: "700", color: cores.texto },
  observacao: { fontSize: 14, color: cores.textoSecundario },
  resultadoLinha: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  resultadoDescricao: { fontSize: 15, color: cores.texto },
  resultadoCategoria: { fontSize: 13, color: cores.textoSecundario },
  resultadoValor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
});
