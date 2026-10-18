import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogoBolso } from "../componentes/logo";
import { Aviso, Botao, Campo, Rotulo } from "../componentes/ui";
import { useSessao } from "../lib/sessao";
import { cores, espaco, fonte, peso, entrelinha, componentes } from "../lib/tema";

export default function Entrar() {
  const { entrar, registrar } = useSessao();
  const [cadastro, setCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
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
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <LogoBolso tamanho={72} />
            <Text style={estilos.titulo}>{cadastro ? "Crie sua conta" : "Bem-vindo ao Bolso"}</Text>
            <Text style={estilos.subtitulo}>
              Mande uma foto do cupom, a fatura ou só escreva o gasto. A IA organiza tudo para você.
            </Text>
          </View>

          <View style={estilos.formulario}>
            {cadastro && (
              <View>
                <Rotulo>Nome</Rotulo>
                <Campo placeholder="Como quer ser chamado" value={nome} onChangeText={setNome} autoComplete="name" textContentType="name" />
              </View>
            )}
            <View>
              <Rotulo>E-mail</Rotulo>
              <Campo
                placeholder="voce@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
            <View>
              <Rotulo>Senha</Rotulo>
              <View>
                <Campo
                  placeholder={cadastro ? "Mínimo de 8 caracteres" : "Sua senha"}
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry={!verSenha}
                  autoCapitalize="none"
                  autoComplete={cadastro ? "new-password" : "current-password"}
                  textContentType={cadastro ? "newPassword" : "password"}
                  returnKeyType="go"
                  onSubmitEditing={enviar}
                  style={{ paddingRight: componentes.toqueMinimo + espaco.p }}
                />
                <Pressable
                  onPress={() => setVerSenha(!verSenha)}
                  style={estilos.olho}
                  accessibilityRole="button"
                  accessibilityLabel={verSenha ? "Esconder senha" : "Mostrar senha"}
                >
                  <Ionicons name={verSenha ? "eye-off-outline" : "eye-outline"} size={22} color={cores.textoSecundario} />
                </Pressable>
              </View>
            </View>
            <Aviso mensagem={erro} />
            <View style={{ marginTop: espaco.p }}>
              <Botao titulo={cadastro ? "Criar conta" : "Entrar"} aoTocar={enviar} carregando={enviando} />
            </View>
          </View>

          <Pressable
            onPress={() => {
              setCadastro(!cadastro);
              setErro(null);
            }}
            style={estilos.alternar}
            accessibilityRole="button"
          >
            <Text style={estilos.alternarTexto}>
              {cadastro ? "Já tem conta? " : "Ainda não tem conta? "}
              <Text style={estilos.alternarLink}>{cadastro ? "Entrar" : "Criar agora"}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: "center", padding: espaco.g, gap: espaco.g },
  marca: { gap: espaco.pm },
  titulo: { fontSize: fonte.xxl, fontWeight: peso.forte, color: cores.texto, marginTop: espaco.p },
  subtitulo: { fontSize: fonte.md, lineHeight: entrelinha.md, color: cores.textoSecundario },
  formulario: { gap: espaco.xs },
  olho: { position: "absolute", right: 4, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
  alternar: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: espaco.p },
  alternarTexto: { fontSize: fonte.md, color: cores.textoSecundario },
  alternarLink: { color: cores.marca, fontWeight: peso.medio },
});
