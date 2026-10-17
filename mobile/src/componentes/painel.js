import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { PELO_TIPO } from "../lib/contas";
import { diaMes, reais } from "../lib/formato";
import { cores, espaco } from "../lib/tema";
import { Cartao } from "./ui";

export function CartaoAssistente({ assistente, carregando }) {
  if (!carregando && !assistente?.dicas?.length) return null;
  return (
    <Cartao style={estilos.assistente}>
      <View style={estilos.assistenteTopo}>
        <Ionicons name="sparkles" size={18} color={cores.marca} />
        <Text style={estilos.assistenteTitulo}>Assistente</Text>
      </View>
      {carregando ? (
        <View style={estilos.assistenteCarregando}>
          <ActivityIndicator color={cores.marca} size="small" />
          <Text style={estilos.textoSecundario}>Analisando seus gastos...</Text>
        </View>
      ) : (
        <>
          {assistente.dicas.map((dica, i) => (
            <View key={i} style={estilos.dica}>
              <Text style={estilos.marcador}>•</Text>
              <Text style={estilos.dicaTexto}>{dica}</Text>
            </View>
          ))}
          <Text style={estilos.rodape}>
            {assistente.geradoPorIa ? "Dicas escritas por IA a partir dos seus números" : "Resumo automático dos seus números"}
          </Text>
        </>
      )}
    </Cartao>
  );
}

const SITUACOES = {
  ok: { cor: cores.marca, trilho: cores.marcaSuave, icone: null },
  alerta: { cor: cores.alerta, trilho: cores.alertaSuave, icone: "warning" },
  estourado: { cor: cores.critico, trilho: cores.criticoSuave, icone: "alert-circle" },
};

// Medidor: preenchimento = quanto do orçamento já foi gasto; a situação vem com ícone e texto
function Medidor({ item }) {
  const situacao = SITUACOES[item.situacao];
  const restante = item.limite - item.gasto;
  const legenda =
    item.situacao === "estourado"
      ? `Passou ${reais(-restante)} do limite`
      : item.situacao === "alerta"
        ? `${Math.round(item.percentual)}% usado, restam ${reais(restante)}`
        : `Restam ${reais(restante)}`;
  return (
    <View style={estilos.medidor} accessible accessibilityLabel={`${item.categoria}: ${reais(item.gasto)} de ${reais(item.limite)}. ${legenda}`}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.nome} numberOfLines={1}>{item.categoria}</Text>
        <Text style={estilos.valor}>{reais(item.gasto)}</Text>
      </View>
      <View style={[estilos.trilho, { backgroundColor: situacao.trilho }]}>
        <View style={[estilos.preenchimento, { width: `${Math.min(item.percentual, 100)}%`, backgroundColor: situacao.cor }]} />
      </View>
      <View style={estilos.linhaTopo}>
        <View style={estilos.legenda}>
          {situacao.icone && <Ionicons name={situacao.icone} size={14} color={situacao.cor} />}
          <Text style={estilos.textoSecundario}>{legenda}</Text>
        </View>
        <Text style={estilos.textoSecundario}>de {reais(item.limite)}</Text>
      </View>
    </View>
  );
}

export function ListaOrcamentos({ orcamentos, aoEditar }) {
  return (
    <>
      <View style={estilos.cabecalho}>
        <Text style={estilos.secao}>Orçamentos</Text>
        <Pressable onPress={aoEditar} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.link}>{orcamentos.length ? "Editar" : "Definir"}</Text>
        </Pressable>
      </View>
      {orcamentos.length === 0 ? (
        <Text style={estilos.textoSecundario}>
          Defina um limite mensal por categoria e o Bolso avisa quando você estiver perto de estourar.
        </Text>
      ) : (
        <Cartao style={{ gap: espaco.m }}>
          {orcamentos.map((item) => (
            <Medidor key={item.categoriaId} item={item} />
          ))}
        </Cartao>
      )}
    </>
  );
}

// Quanto saiu de cada conta/cartão no mês
export function ListaContas({ porConta }) {
  if (!porConta?.length) return null;
  return (
    <>
      <Text style={[estilos.secao, { marginTop: espaco.p }]}>Por conta e cartão</Text>
      <Cartao style={{ gap: 12 }}>
        {porConta.map((c) => (
          <View key={c.contaId} style={estilos.linhaTopo}>
            <View style={estilos.contaNome}>
              <Ionicons name={PELO_TIPO[c.tipo]?.icone ?? "wallet-outline"} size={20} color={cores.marca} />
              <Text style={estilos.nome} numberOfLines={1}>{c.conta}</Text>
            </View>
            <Text style={estilos.valor}>{reais(c.total)}</Text>
          </View>
        ))}
      </Cartao>
    </>
  );
}

export function ListaAssinaturas({ dados }) {
  if (!dados?.assinaturas.length) return null;
  return (
    <>
      <View style={estilos.cabecalho}>
        <Text style={estilos.secao}>Cobranças recorrentes</Text>
        <Text style={estilos.valor}>{reais(dados.totalMensal)}/mês</Text>
      </View>
      <Cartao style={{ gap: 12 }}>
        {dados.assinaturas.map((a) => (
          <View key={a.chave} style={estilos.linhaTopo}>
            <View style={{ flex: 1 }}>
              <Text style={[estilos.nome, !a.ativa && estilos.inativa]} numberOfLines={1}>{a.nome}</Text>
              <Text style={estilos.textoSecundario}>
                {a.ativa ? `${a.meses} meses seguidos` : `Sem cobrança desde ${diaMes(a.ultimaCobranca)}`}
              </Text>
            </View>
            <Text style={[estilos.valor, !a.ativa && estilos.inativa]}>{reais(a.valorMensal)}</Text>
          </View>
        ))}
      </Cartao>
    </>
  );
}

const estilos = StyleSheet.create({
  assistente: { gap: 10, borderColor: cores.marcaSuave, backgroundColor: "#fbfefc" },
  assistenteTopo: { flexDirection: "row", alignItems: "center", gap: 6 },
  assistenteTitulo: { fontSize: 15, fontWeight: "700", color: cores.marca },
  assistenteCarregando: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  dica: { flexDirection: "row", gap: espaco.p },
  marcador: { color: cores.marca, fontSize: 15, lineHeight: 22 },
  dicaTexto: { flex: 1, fontSize: 15, lineHeight: 22, color: cores.texto },
  rodape: { fontSize: 12, color: cores.textoSuave },
  cabecalho: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: espaco.p },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  link: { fontSize: 15, fontWeight: "600", color: cores.marca },
  medidor: { gap: 6 },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: espaco.p },
  nome: { fontSize: 15, color: cores.texto, flexShrink: 1 },
  valor: { fontSize: 15, fontWeight: "600", color: cores.texto, fontVariant: ["tabular-nums"] },
  trilho: { height: 10, borderRadius: 4, overflow: "hidden" },
  preenchimento: { height: 10, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  legenda: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  textoSecundario: { fontSize: 13, color: cores.textoSecundario, fontWeight: "400" },
  inativa: { color: cores.textoSuave },
  contaNome: { flexDirection: "row", alignItems: "center", gap: espaco.p, flexShrink: 1 },
});
