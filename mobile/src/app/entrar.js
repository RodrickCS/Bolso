import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Aviso, Botao, Campo } from "../componentes/ui";
import { useSessao } from "../lib/sessao";
import { cores, espaco } from "../lib/tema";

export default function Entrar() {
  const { entrar, registrar } = useSessao();
  const [cadastro, setCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      if (cadastro) await registrar(nome, email, senha);
      else await entrar(email, senha);
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={estilos.conteudo}>
        <Text style={estilos.logo}>Bolso</Text>
        <Text style={estilos.subtitulo}>Todos os seus gastos organizados por IA</Text>

        <View style={estilos.formulario}>
          {cadastro && <Campo placeholder="Seu nome" value={nome} onChangeText={setNome} autoComplete="name" />}
          <Campo
            placeholder="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Campo
            placeholder={cadastro ? "Senha (mínimo 8 caracteres)" : "Senha"}
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoComplete={cadastro ? "new-password" : "current-password"}
          />
          <Aviso mensagem={erro} />
          <Botao titulo={cadastro ? "Criar conta" : "Entrar"} aoTocar={enviar} carregando={enviando} />
        </View>

        <Pressable onPress={() => { setCadastro(!cadastro); setErro(null); }} hitSlop={8}>
          <Text style={estilos.alternar}>
            {cadastro ? "Já tenho conta. Entrar" : "Ainda não tenho conta. Criar agora"}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flex: 1, justifyContent: "center", padding: espaco.g, gap: espaco.m },
  logo: { fontSize: 40, fontWeight: "800", color: cores.marca },
  subtitulo: { fontSize: 16, color: cores.textoSecundario, marginBottom: espaco.p },
  formulario: { gap: 12 },
  alternar: { color: cores.marca, fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: espaco.p },
});
