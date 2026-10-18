import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { cores } from "../../lib/tema";

// Ícone cheio na aba ativa, contornado nas outras
function icone(nome) {
  return function IconeAba({ color, size, focused }) {
    return <Ionicons name={focused ? nome : `${nome}-outline`} size={size} color={color} />;
  };
}

// "Adicionar" é a ação principal do app: um botão verde redondo, saltado acima da barra
function BotaoAdicionar({ onPress, onLongPress, accessibilityState }) {
  return (
    <View style={estilos.adicionarArea}>
      <Pressable
        onPress={(e) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.(e);
        }}
        onLongPress={onLongPress}
        style={({ pressed }) => [estilos.adicionar, pressed && { transform: [{ scale: 0.95 }] }]}
        accessibilityRole="button"
        accessibilityLabel="Adicionar gasto"
        accessibilityState={accessibilityState}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </Pressable>
    </View>
  );
}

export default function LayoutAbas() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.marca,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarStyle: { borderTopColor: cores.borda, backgroundColor: cores.superficie },
        headerStyle: { backgroundColor: cores.fundo },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700" },
        sceneStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Início", headerShown: false, tabBarIcon: icone("home") }} />
      <Tabs.Screen name="gastos" options={{ title: "Gastos", tabBarIcon: icone("list") }} />
      <Tabs.Screen
        name="adicionar"
        options={{ title: "Adicionar", tabBarLabel: () => null, tabBarButton: (props) => <BotaoAdicionar {...props} /> }}
      />
      <Tabs.Screen
        name="perguntar"
        options={{
          title: "Pergunte ao Bolso",
          tabBarLabel: "Assistente",
          tabBarIcon: icone("chatbubble-ellipses"),
          tabBarHideOnKeyboard: true,
        }}
      />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarIcon: icone("person-circle") }} />
    </Tabs>
  );
}

const estilos = StyleSheet.create({
  adicionarArea: { flex: 1, alignItems: "center" },
  adicionar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -20,
    backgroundColor: cores.marca,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: cores.fundo,
    shadowColor: cores.marca,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
