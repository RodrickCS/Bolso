import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { reais } from "../lib/formato";
import { cores, espaco } from "../lib/tema";
import { Aviso, Cartao } from "./ui";

// O que saiu de um envio: os lançamentos criados, ou o motivo de não ter dado para ler
export function Resultado({ documento }) {
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

const estilos = StyleSheet.create({
  resultadoTopo: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  resultadoTitulo: { fontSize: 16, fontWeight: "700", color: cores.texto },
  observacao: { fontSize: 14, color: cores.textoSecundario },
  resultadoLinha: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  resultadoDescricao: { fontSize: 15, color: cores.texto },
  resultadoCategoria: { fontSize: 13, color: cores.textoSecundario },
  resultadoValor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
});
