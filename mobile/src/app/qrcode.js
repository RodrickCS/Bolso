import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { Resultado } from "../componentes/resultado";
import { Aviso, Botao, Cartao } from "../componentes/ui";
import { aguardarDocumento, api } from "../lib/api";
import { baixarPaginaNfce, pareceNfce } from "../lib/nfce";
import { cores, espaco, raios, fonte, peso, entrelinha } from "../lib/tema";

// Lê o QR Code do cupom fiscal (NFC-e). Os itens vêm da página da SEFAZ, não de uma foto.
export default function LerQrCode() {
  const { contaId } = useLocalSearchParams();
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [etapa, setEtapa] = useState("mirando");
  const [mensagem, setMensagem] = useState("");
  const [aviso, setAviso] = useState(null);
  const [documento, setDocumento] = useState(null);
  const [erro, setErro] = useState(null);
  // A câmera avisa o mesmo QR várias vezes por segundo: só o primeiro conta
  const ocupado = useRef(false);

  async function aoLer({ data }) {
    if (ocupado.current) return;
    ocupado.current = true;
    if (!pareceNfce(data)) {
      setAviso("Esse QR Code não é de cupom fiscal. Procure o QR Code impresso no fim do cupom.");
      setTimeout(() => (ocupado.current = false), 2500);
      return;
    }
    setAviso(null);
    setEtapa("lendo");
    try {
      setMensagem("Abrindo a nota no site da SEFAZ...");
      const pagina = await baixarPaginaNfce(data);
      setMensagem("Lendo os itens da nota...");
      const enviado = await api.enviarNfce(data, pagina, contaId ? Number(contaId) : undefined);
      setDocumento(await aguardarDocumento(enviado.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEtapa("pronto");
    }
  }

  function lerOutro() {
    setDocumento(null);
    setErro(null);
    setEtapa("mirando");
    ocupado.current = false;
  }

  if (!permissao) return <ActivityIndicator style={{ marginTop: espaco.ggg }} color={cores.marca} />;

  if (!permissao.granted) {
    return (
      <View style={estilos.conteudo}>
        <Cartao style={{ gap: espaco.pm }}>
          <Ionicons name="qr-code-outline" size={32} color={cores.marca} />
          <Text style={estilos.titulo}>O Bolso precisa da câmera</Text>
          <Text style={estilos.texto}>
            A câmera é usada só para ler o QR Code impresso no cupom fiscal. Nenhuma foto é guardada.
          </Text>
          {permissao.canAskAgain ? (
            <Botao titulo="Permitir câmera" icone="camera-outline" aoTocar={pedirPermissao} />
          ) : (
            <Botao titulo="Abrir configurações" icone="settings-outline" aoTocar={() => Linking.openSettings()} />
          )}
        </Cartao>
      </View>
    );
  }

  if (etapa === "mirando") {
    return (
      <View style={{ flex: 1, backgroundColor: cores.camera }}>
        <CameraView
          style={estilos.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={aoLer}
        />
        <View style={[estilos.sobreposicao, { pointerEvents: "none" }]}>
          <View style={estilos.moldura} />
          <Text style={estilos.dica}>Aponte para o QR Code no fim do cupom fiscal</Text>
        </View>
        {aviso && (
          <View style={estilos.avisoCamera}>
            <Aviso mensagem={aviso} />
          </View>
        )}
      </View>
    );
  }

  if (etapa === "lendo") {
    return (
      <View style={[estilos.conteudo, estilos.centro]}>
        <ActivityIndicator size="large" color={cores.marca} />
        <Text style={estilos.texto}>{mensagem}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Aviso mensagem={erro} />
      {documento && <Resultado documento={documento} />}
      <Botao titulo="Ler outro cupom" icone="qr-code-outline" aoTocar={lerOutro} />
      <Botao titulo="Concluir" variante="secundario" aoTocar={() => router.back()} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: espaco.pm },
  camera: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  centro: { flex: 1, alignItems: "center", justifyContent: "center", gap: espaco.m },
  titulo: { fontSize: fonte.lg, fontWeight: peso.forte, color: cores.texto },
  texto: { fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.textoSecundario, textAlign: "center" },
  // Posição explícita: StyleSheet.absoluteFillObject não existe mais nesta versão do React Native
  sobreposicao: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", gap: espaco.g },
  moldura: { width: 240, height: 240, borderWidth: 3, borderColor: cores.sobreEscuro, borderRadius: raios.xg },
  dica: {
    color: cores.sobreEscuro,
    fontSize: fonte.md,
    fontWeight: peso.medio,
    textAlign: "center",
    paddingHorizontal: espaco.m,
    paddingVertical: espaco.p,
    backgroundColor: cores.veuForte,
    borderRadius: raios.m,
    overflow: "hidden",
  },
  avisoCamera: { position: "absolute", left: espaco.m, right: espaco.m, bottom: espaco.g },
});
