import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { cores, espaco } from "../lib/tema";
import { Cartao } from "./ui";
import { useAvisos } from "./avisos";

const ROTULO_TIPO = {
  TEXTO: "Texto",
  CUPOM: "Cupom",
  FATURA: "Fatura",
  EXTRATO: "Extrato",
  COMPROVANTE: "Comprovante",
  CONTA_CONSUMO: "Conta/Boleto",
};

// Cupom lido pelo QR Code chega como a página da SEFAZ
const rotulo = (documento) => (documento.mimeType === "text/html" ? "Cupom (QR Code)" : ROTULO_TIPO[documento.tipo]);

const quando = (iso) => {
  const data = new Date(iso);
  const dois = (n) => String(n).padStart(2, "0");
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
};

function Situacao({ documento }) {
  if (documento.status === "PRONTO") return <Ionicons name="checkmark-circle" size={20} color={cores.marca} />;
  if (documento.status === "ERRO") return <Ionicons name="alert-circle" size={20} color={cores.critico} />;
  return <ActivityIndicator size="small" color={cores.marca} />;
}

function descricao(documento) {
  if (documento.status === "PENDENTE" || documento.status === "PROCESSANDO") return "Lendo...";
  if (documento.status === "ERRO") return documento.erro ?? "Não deu para ler";
  const n = documento._count?.transacoes ?? 0;
  return n === 1 ? "1 lançamento" : `${n} lançamentos`;
}

// Lista dos últimos envios, com o que aconteceu em cada um. Tocar abre as ações.
export function HistoricoEnvios({ documentos, aoReenviarTexto, aoApagar }) {
  const { alerta } = useAvisos();
  if (!documentos?.length) return null;

  function abrirAcoes(documento) {
    if (documento.status === "PROCESSANDO") return;
    const titulo = `${rotulo(documento)} de ${quando(documento.criadoEm)}`;
    const temLancamentos = (documento._count?.transacoes ?? 0) > 0;
    const botoes = [{ text: "Cancelar", style: "cancel" }];
    if (documento.status === "ERRO" && documento.tipo === "TEXTO") {
      botoes.push({ text: "Tentar de novo", onPress: () => aoReenviarTexto(documento) });
    }
    if (temLancamentos) {
      botoes.push({ text: "Tirar só da lista", onPress: () => aoApagar(documento, false) });
      botoes.push({ text: "Apagar com os lançamentos", style: "destructive", onPress: () => aoApagar(documento, true) });
    } else {
      botoes.push({ text: "Tirar da lista", style: "destructive", onPress: () => aoApagar(documento, false) });
    }
    const mensagem = temLancamentos
      ? "Se a leitura saiu errada, apague o envio junto com os lançamentos e envie de novo."
      : documento.erro ?? undefined;
    alerta(titulo, mensagem, botoes);
  }

  return (
    <>
      <Text style={estilos.secao}>Últimos envios</Text>
      <Cartao style={{ gap: 2 }}>
        {documentos.map((d) => (
          <Pressable key={d.id} onPress={() => abrirAcoes(d)} style={({ pressed }) => [estilos.linha, pressed && { opacity: 0.6 }]}>
            <Situacao documento={d} />
            <View style={{ flex: 1 }}>
              <Text style={estilos.titulo} numberOfLines={1}>
                {rotulo(d)}
                {d.texto ? `: “${d.texto}”` : ""}
              </Text>
              <Text style={[estilos.subtitulo, d.status === "ERRO" && estilos.subtituloErro]} numberOfLines={2}>
                {quando(d.criadoEm)} · {descricao(d)}
              </Text>
            </View>
            <Ionicons name="ellipsis-horizontal" size={18} color={cores.textoSuave} />
          </Pressable>
        ))}
      </Cartao>
    </>
  );
}

const estilos = StyleSheet.create({
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto, marginTop: espaco.m },
  linha: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  titulo: { fontSize: 15, color: cores.texto },
  subtitulo: { fontSize: 13, color: cores.textoSecundario },
  subtituloErro: { color: cores.erro },
});
