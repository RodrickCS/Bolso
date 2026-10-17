import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { cores } from "../../lib/tema";

function icone(nome) {
  return function IconeAba({ color, size }) {
    return <Ionicons name={nome} size={size} color={color} />;
  };
}

export default function LayoutAbas() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.marca,
        tabBarInactiveTintColor: cores.textoSuave,
        headerStyle: { backgroundColor: cores.fundo },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700" },
        sceneStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Painel", tabBarIcon: icone("pie-chart-outline") }} />
      <Tabs.Screen name="gastos" options={{ title: "Gastos", tabBarIcon: icone("list-outline") }} />
      <Tabs.Screen name="adicionar" options={{ title: "Adicionar", tabBarIcon: icone("add-circle-outline") }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarIcon: icone("person-circle-outline") }} />
    </Tabs>
  );
}
