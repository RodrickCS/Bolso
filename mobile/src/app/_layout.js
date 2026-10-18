import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ProvedorSessao, useSessao } from "../lib/sessao";
import { cores } from "../lib/tema";

const comCabecalho = { headerShown: true, headerStyle: { backgroundColor: cores.fundo }, headerShadowVisible: false };

function Rotas() {
  const { logado, carregando } = useSessao();
  if (carregando) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
      <Stack.Protected guard={logado}>
        <Stack.Screen name="(abas)" />
        <Stack.Screen name="orcamentos" options={{ ...comCabecalho, title: "Orçamentos" }} />
        <Stack.Screen name="lancamento" options={{ ...comCabecalho, title: "Lançamento" }} />
        <Stack.Screen name="contas" options={{ ...comCabecalho, title: "Contas e cartões" }} />
        <Stack.Screen name="produtos" options={{ ...comCabecalho, title: "Preços dos produtos" }} />
        <Stack.Screen name="produto" options={{ ...comCabecalho, title: "Produto" }} />
        <Stack.Screen name="qrcode" options={{ ...comCabecalho, title: "Ler QR Code do cupom" }} />
        <Stack.Screen name="perguntar" options={{ ...comCabecalho, title: "Pergunte ao Bolso" }} />
        <Stack.Screen name="fixos" options={{ ...comCabecalho, title: "Gastos fixos" }} />
      </Stack.Protected>
      <Stack.Protected guard={!logado}>
        <Stack.Screen name="entrar" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Layout() {
  return (
    <ProvedorSessao>
      <StatusBar style="dark" />
      <Rotas />
    </ProvedorSessao>
  );
}
