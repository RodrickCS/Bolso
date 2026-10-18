import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PELO_TIPO } from "../lib/contas";
import { diaMes, reais } from "../lib/formato";
import { cores, espaco, raio } from "../lib/tema";
import { Cartao } from "./ui";
import { useAvisos } from "./avisos";

// Dicas do assistente e, embaixo, um campo que abre o chat "Pergunte ao Bolso"
export function CartaoAssistente({ assistente, carregando, aoPerguntar }) {
  return (
    <Cartao style={estilos.assistente}>
      <View style={estilos.assistenteTopo}>
        <View style={estilos.assistenteIcone}>
          <Ionicons name="sparkles" size={16} color={cores.marca} />
        </View>
        <Text style={estilos.assistenteTitulo}>Assistente do Bolso</Text>
      </View>
      {carregando ? (
        <View style={estilos.assistenteCarregando}>
          <ActivityIndicator color={cores.marca} size="small" />
          <Text style={estilos.textoSecundario}>Analisando seus gastos...</Text>
        </View>
      ) : assistente?.dicas?.length ? (
        assistente.dicas.map((dica, i) => (
          <View key={i} style={estilos.dica}>
            <Text style={estilos.marcador}>•</Text>
            <Text style={estilos.dicaTexto}>{dica}</Text>
          </View>
        ))
      ) : (
        <Text style={estilos.dicaTexto}>Pergunte sobre seus gastos: quanto foi no mercado, qual a maior compra, quanto sobrou.</Text>
      )}
      <Pressable
        onPress={aoPerguntar}
        style={({ pressed }) => [estilos.perguntar, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Pergunte ao Bolso"
      >
        <Text style={estilos.perguntarTexto} numberOfLines={1}>Pergunte ao Bolso...</Text>
        <View style={estilos.perguntarEnviar}>
          <Ionicons name="arrow-up" size={16} color="#fff" />
        </View>
      </Pressable>
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

const MENSAGEM_ORCAMENTO = {
  ok: "Você está no caminho certo!",
  alerta: "Perto do limite. Vale segurar um pouco.",
  estourado: "O orçamento do mês estourou.",
};

// Orçamento do mês: o total de todos os limites num medidor só e, embaixo, cada categoria
export function ListaOrcamentos({ orcamentos, aoEditar }) {
  const gasto = orcamentos.reduce((soma, o) => soma + o.gasto, 0);
  const limite = orcamentos.reduce((soma, o) => soma + o.limite, 0);
  const percentual = limite ? (gasto / limite) * 100 : 0;
  const situacao = percentual >= 100 ? "estourado" : percentual >= 80 ? "alerta" : "ok";
  const visual = SITUACOES[situacao];

  return (
    <Cartao style={{ gap: espaco.m }}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.secao}>Orçamento do mês</Text>
        <Pressable onPress={aoEditar} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.link}>{orcamentos.length ? "Editar" : "Definir"}</Text>
        </Pressable>
      </View>
      {orcamentos.length === 0 ? (
        <Text style={estilos.textoSecundario}>
          Defina um limite mensal por categoria e o Bolso avisa quando você estiver perto de estourar.
        </Text>
      ) : (
        <>
          <View style={{ gap: 8 }} accessible accessibilityLabel={`${reais(gasto)} de ${reais(limite)}, ${Math.round(percentual)}% usado`}>
            <View style={[estilos.linhaTopo, { alignItems: "flex-end" }]}>
              <Text style={estilos.orcamentoValor}>
                {reais(gasto)} <Text style={estilos.orcamentoLimite}>de {reais(limite)}</Text>
              </Text>
              <Text style={estilos.orcamentoPercentual}>{Math.round(percentual)}%</Text>
            </View>
            <View style={[estilos.trilho, estilos.trilhoGrande, { backgroundColor: visual.trilho }]}>
              <View style={[estilos.preenchimento, estilos.trilhoGrande, { width: `${Math.min(percentual, 100)}%`, backgroundColor: visual.cor }]} />
            </View>
            <View style={estilos.legenda}>
              <Ionicons name={visual.icone ?? "checkmark-circle"} size={16} color={visual.cor} />
              <Text style={estilos.orcamentoMensagem}>{MENSAGEM_ORCAMENTO[situacao]}</Text>
            </View>
          </View>
          {orcamentos.length > 1 && (
            <View style={estilos.categoriasOrcamento}>
              {orcamentos.map((item) => (
                <Medidor key={item.categoriaId} item={item} />
              ))}
            </View>
          )}
        </>
      )}
    </Cartao>
  );
}

// Contas e cartões com gasto no mês: a principal em destaque, as outras em cartões menores ao lado
export function ContasECartoes({ porConta, aoGerenciar }) {
  if (!porConta?.length) return null;
  const [principal, ...outras] = porConta;
  return (
    <View style={{ gap: 12 }}>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.secao}>Contas e cartões</Text>
        <Pressable onPress={aoGerenciar} hitSlop={10} accessibilityRole="button">
          <Text style={estilos.link}>Gerenciar</Text>
        </Pressable>
      </View>
      {/* Encosta nas bordas da tela: o cartão seguinte aparece cortado e mostra que dá para arrastar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -espaco.m }}
        contentContainerStyle={{ gap: 12, paddingHorizontal: espaco.m }}
      >
        <View style={estilos.contaPrincipal} accessible accessibilityLabel={`${principal.conta}: ${reais(principal.total)} gastos no mês`}>
          <View style={estilos.linhaTopo}>
            <Text style={estilos.contaPrincipalNome} numberOfLines={1}>{principal.conta}</Text>
            <Ionicons name={PELO_TIPO[principal.tipo]?.icone ?? "wallet-outline"} size={22} color="#fff" />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={estilos.contaPrincipalRotulo}>Gastos no mês</Text>
            <Text style={estilos.contaPrincipalValor} numberOfLines={1} adjustsFontSizeToFit>{reais(principal.total)}</Text>
          </View>
          <Text style={estilos.contaPrincipalRotulo}>{PELO_TIPO[principal.tipo]?.rotulo ?? "Conta"}</Text>
        </View>
        {outras.map((c) => (
          <View key={c.contaId} style={estilos.contaPequena} accessible accessibilityLabel={`${c.conta}: ${reais(c.total)} gastos no mês`}>
            <View style={estilos.contaIcone}>
              <Ionicons name={PELO_TIPO[c.tipo]?.icone ?? "wallet-outline"} size={18} color={cores.marca} />
            </View>
            <Text style={estilos.nome} numberOfLines={1}>{c.conta}</Text>
            <Text style={estilos.valor} numberOfLines={1}>{reais(c.total)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const ESTILO_ALERTA = {
  duplicada: { icone: "copy-outline", cor: cores.critico },
  cobrou_apos_cancelar: { icone: "alert-circle", cor: cores.critico },
  reajuste: { icone: "trending-up", cor: cores.alerta },
};

function BotaoTexto({ titulo, aoTocar }) {
  return (
    <Pressable onPress={aoTocar} hitSlop={8} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      <Text style={estilos.link}>{titulo}</Text>
    </Pressable>
  );
}

// Avisos que pedem uma ação. aoMarcar(chave, tipo) guarda a resposta; aoAbrir(id) abre um lançamento.
export function ListaAlertas({ alertas, aoMarcar, aoAbrir }) {
  if (!alertas?.length) return null;
  return (
    <>
      {alertas.map((a) => {
        const visual = ESTILO_ALERTA[a.tipo] ?? ESTILO_ALERTA.reajuste;
        // "reajuste:SPOTIFY:2026-10-03" -> "assinatura:SPOTIFY"
        const assinatura = a.tipo === "reajuste" ? `assinatura:${a.chave.split(":")[1]}` : null;
        return (
          <Cartao key={a.chave} style={estilos.alerta}>
            <Ionicons name={visual.icone} size={20} color={visual.cor} />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={estilos.alertaTexto}>{a.texto}</Text>
              <View style={estilos.alertaAcoes}>
                {a.tipo === "duplicada" && <BotaoTexto titulo="Ver a 2ª cobrança" aoTocar={() => aoAbrir(a.transacaoIds[1])} />}
                {assinatura && <BotaoTexto titulo="Vou cancelar" aoTocar={() => aoMarcar(assinatura, "cancelar")} />}
                <BotaoTexto titulo={a.tipo === "duplicada" ? "Está certo" : "Entendi"} aoTocar={() => aoMarcar(a.chave, "ok")} />
              </View>
            </View>
          </Cartao>
        );
      })}
    </>
  );
}

// Tocar numa assinatura abre as opções: vou cancelar, não é assinatura, desfazer
export function ListaAssinaturas({ dados, aoMarcar, aoDesmarcar }) {
  const { alerta } = useAvisos();
  if (!dados?.assinaturas.length) return null;

  function opcoes(a) {
    const chave = `assinatura:${a.chave}`;
    const botoes = [{ text: "Fechar", style: "cancel" }];
    if (a.marcacao === "cancelar") {
      botoes.push({ text: "Desisti de cancelar", onPress: () => aoDesmarcar(chave) });
    } else {
      botoes.push({ text: "Vou cancelar", onPress: () => aoMarcar(chave, "cancelar") });
    }
    botoes.push({ text: "Não é assinatura", style: "destructive", onPress: () => aoMarcar(chave, "ignorar") });
    alerta(
      a.nome,
      a.marcacao === "cancelar"
        ? "Marcada para cancelar. Se vier outra cobrança, o Bolso avisa."
        : `${reais(a.valorMensal)} por mês, ou ${reais(a.valorAnual)} por ano. Marque "Vou cancelar" e o Bolso avisa se ela cobrar de novo.`,
      botoes,
    );
  }

  return (
    <Cartao style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={estilos.secao}>Cobranças recorrentes</Text>
        <Text style={estilos.textoSecundario}>
          {reais(dados.totalMensal)} por mês
          {dados.totalAnual > 0 ? `, ${reais(dados.totalAnual)} por ano` : ""}. Toque numa cobrança para marcar o que
          você quer cancelar.
        </Text>
      </View>
      {dados.assinaturas.map((a) => (
        <Pressable key={a.chave} onPress={() => opcoes(a)} style={({ pressed }) => [estilos.linhaTopo, pressed && { opacity: 0.6 }]}>
          <View style={estilos.contaIconeLinha}>
            <Ionicons name="repeat" size={16} color={cores.textoSecundario} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[estilos.nome, !a.ativa && estilos.inativa]} numberOfLines={1}>{a.nome}</Text>
            <Text style={estilos.textoSecundario}>
              {a.marcacao === "cancelar"
                ? "Marcada para cancelar"
                : a.ativa
                  ? `${a.meses} meses seguidos`
                  : `Sem cobrança desde ${diaMes(a.ultimaCobranca)}`}
            </Text>
          </View>
          <Text style={[estilos.valor, !a.ativa && estilos.inativa]}>{reais(a.valorMensal)}</Text>
        </Pressable>
      ))}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  assistente: { gap: 12 },
  assistenteTopo: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  assistenteIcone: { width: 30, height: 30, borderRadius: 15, backgroundColor: cores.marcaSuave, alignItems: "center", justifyContent: "center" },
  assistenteTitulo: { fontSize: 16, fontWeight: "700", color: cores.texto },
  assistenteCarregando: { flexDirection: "row", alignItems: "center", gap: espaco.p },
  dica: { flexDirection: "row", gap: espaco.p },
  marcador: { color: cores.marca, fontSize: 15, lineHeight: 22 },
  dicaTexto: { flex: 1, fontSize: 15, lineHeight: 22, color: cores.texto },
  perguntar: {
    flexDirection: "row",
    alignItems: "center",
    gap: espaco.p,
    minHeight: 46,
    paddingLeft: espaco.m,
    paddingRight: 6,
    borderRadius: 999,
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  perguntarTexto: { flex: 1, fontSize: 15, color: cores.textoSuave },
  perguntarEnviar: { width: 34, height: 34, borderRadius: 17, backgroundColor: cores.marca, alignItems: "center", justifyContent: "center" },
  contaIconeLinha: { width: 34, height: 34, borderRadius: 17, backgroundColor: cores.fundo, alignItems: "center", justifyContent: "center" },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto },
  orcamentoValor: { fontSize: 20, fontWeight: "700", color: cores.texto, flexShrink: 1 },
  orcamentoLimite: { fontSize: 14, fontWeight: "400", color: cores.textoSecundario },
  orcamentoPercentual: { fontSize: 15, fontWeight: "600", color: cores.texto },
  orcamentoMensagem: { fontSize: 14, color: cores.texto },
  trilhoGrande: { height: 12, borderRadius: 6 },
  categoriasOrcamento: { gap: espaco.m, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: espaco.m },
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
  alerta: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  alertaTexto: { fontSize: 15, lineHeight: 21, color: cores.texto },
  alertaAcoes: { flexDirection: "row", flexWrap: "wrap", gap: espaco.m },
  contaPrincipal: { width: 220, minHeight: 132, borderRadius: raio * 1.5, padding: espaco.m, backgroundColor: "#0f5c3d", justifyContent: "space-between", gap: espaco.p },
  contaPrincipalNome: { fontSize: 15, fontWeight: "700", color: "#fff", flexShrink: 1 },
  contaPrincipalRotulo: { fontSize: 12, color: "#cfe9dc" },
  contaPrincipalValor: { fontSize: 22, fontWeight: "700", color: "#fff" },
  contaPequena: { width: 140, minHeight: 132, borderRadius: raio * 1.5, padding: espaco.m, backgroundColor: cores.superficie, borderWidth: 1, borderColor: cores.borda, gap: 6, justifyContent: "flex-end" },
  contaIcone: { width: 32, height: 32, borderRadius: 16, backgroundColor: cores.marcaSuave, alignItems: "center", justifyContent: "center", marginBottom: "auto" },
});
