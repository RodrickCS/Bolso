import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ProvedorSessao, useSessao } from "../lib/sessao";
import { cores } from "../lib/tema";

function Rotas() {
  const { logado, carregando } = useSessao();
  if (carregando) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.fundo } }}>
      <Stack.Protected guard={logado}>
        <Stack.Screen name="(abas)" />
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
