import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { HistoricoEnvios } from "../../componentes/historico";
import { Resultado } from "../../componentes/resultado";
import { Aviso, Botao, Campo, Cartao, Opcoes, Rotulo } from "../../componentes/ui";
import { aguardarDocumento, api } from "../../lib/api";
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

export default function Adicionar() {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("CUPOM");
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
    acompanhar(async () =>
      api.enviarArquivo(
        { base64: await fotoEmBase64(escolha.assets[0]), nome: "foto.jpg", mimeType: "image/jpeg" },
        tipo,
        contaId ?? undefined,
      ),
    );
  }

  // Seletor do próprio expo-file-system: os arquivos que ele devolve o app tem permissão para ler.
  // Aceita qualquer tipo: no Android CSV e OFX chegam com tipos variados, e quem confere o formato é a API.
  async function usarArquivo() {
    const escolha = await File.pickFileAsync({ mimeTypes: ["*/*"] });
    if (escolha.canceled) return;
    const arquivo = escolha.result;
    acompanhar(async () => {
      if (arquivo.size > LIMITE_ARQUIVO) throw new Error("Arquivo maior que 10 MB. Envie um arquivo menor.");
      return api.enviarArquivo(
        { base64: await arquivo.base64(), nome: arquivo.name, mimeType: arquivo.type },
        tipo,
        contaId ?? undefined,
      );
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
        <Botao
          titulo="Preencher à mão (sem IA)"
          icone="create-outline"
          variante="secundario"
          aoTocar={() => router.push("/lancamento")}
        />

        {contas.length > 0 && (
          <>
            <Rotulo>Pagou com</Rotulo>
            <Opcoes
              opcoes={[{ valor: null, rotulo: "Não informar" }, ...contas.map((c) => ({ valor: c.id, rotulo: c.nome }))]}
              valor={contaId}
              aoMudar={setContaId}
            />
          </>
        )}

        <Text style={[estilos.secao, { marginTop: espaco.m }]}>Cupom fiscal</Text>
        <Botao
          titulo="Ler QR Code do cupom"
          icone="qr-code-outline"
          aoTocar={() => router.push(contaId ? `/qrcode?contaId=${contaId}` : "/qrcode")}
          desativado={lendo}
        />
        <Text style={estilos.ajuda}>Mais rápido e certeiro que a foto: os itens vêm direto da SEFAZ, quase sem gastar IA.</Text>

        <Text style={[estilos.secao, { marginTop: espaco.m }]}>Ou envie um documento</Text>
        <Opcoes opcoes={TIPOS} valor={tipo} aoMudar={setTipo} />
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
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  lendo: { flexDirection: "row", alignItems: "center", gap: 12 },
  lendoTexto: { flex: 1, color: cores.textoSecundario },
  ajuda: { fontSize: 13, lineHeight: 18, color: cores.textoSecundario },
});
