import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Aviso, Botao, Cartao } from "../../componentes/ui";
import { api } from "../../lib/api";
import { dolares, mesAtual, nomeDoMes } from "../../lib/formato";
import { useSessao } from "../../lib/sessao";
import { cores, espaco } from "../../lib/tema";

const ROTULO_TAREFA = {
  "extrair:CUPOM": "Cupons",
  "extrair:FATURA": "Faturas",
  "extrair:EXTRATO": "Extratos",
  "extrair:COMPROVANTE": "Comprovantes",
  "extrair:CONTA_CONSUMO": "Contas",
  "extrair:TEXTO": "Gastos por texto",
  categorizar: "Categorização",
};

export default function Perfil() {
  const { usuario, sair } = useSessao();
  const [uso, setUso] = useState(null);
  const [erro, setErro] = useState(null);
  const mes = mesAtual();

  useFocusEffect(
    useCallback(() => {
      api.usoIa(mes).then(setUso).catch((e) => setErro(e.message));
    }, [mes]),
  );

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Cartao style={{ gap: 2 }}>
        <Text style={estilos.nome}>{usuario?.nome}</Text>
        <Text style={estilos.email}>{usuario?.email}</Text>
      </Cartao>

      <Text style={estilos.secao}>Uso da IA em {nomeDoMes(mes).toLowerCase()}</Text>
      <Aviso mensagem={erro} />
      {uso && (
        <Cartao style={{ gap: espaco.p }}>
          <Text style={estilos.custo}>{dolares(uso.custoUsd)}</Text>
          <Text style={estilos.legenda}>usados dos seus créditos da API do Claude</Text>
          {uso.porTarefa.map((t) => (
            <View key={t.tarefa} style={estilos.linha}>
              <Text style={estilos.linhaTexto}>
                {ROTULO_TAREFA[t.tarefa] ?? t.tarefa} ({t.chamadas})
              </Text>
              <Text style={estilos.linhaValor}>{dolares(t.custoUsd)}</Text>
            </View>
          ))}
        </Cartao>
      )}

      <View style={{ marginTop: espaco.g }}>
        <Botao titulo="Sair" icone="log-out-outline" variante="secundario" aoTocar={sair} />
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: espaco.m, gap: 12 },
  nome: { fontSize: 18, fontWeight: "700", color: cores.texto },
  email: { fontSize: 14, color: cores.textoSecundario },
  secao: { fontSize: 17, fontWeight: "700", color: cores.texto, marginTop: espaco.p },
  custo: { fontSize: 32, fontWeight: "700", color: cores.texto, fontVariant: ["tabular-nums"] },
  legenda: { fontSize: 14, color: cores.textoSecundario, marginTop: -6 },
  linha: { flexDirection: "row", justifyContent: "space-between" },
  linhaTexto: { fontSize: 15, color: cores.texto },
  linhaValor: { fontSize: 15, color: cores.texto, fontVariant: ["tabular-nums"] },
});
