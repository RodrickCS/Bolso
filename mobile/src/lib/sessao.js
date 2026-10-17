import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, configurarSessao } from "./api";

const CHAVE = "bolso.sessao";
const ContextoSessao = createContext(null);

// O SecureStore não existe na web; lá a sessão fica só em memória
async function guardar(valor) {
  try {
    if (valor) await SecureStore.setItemAsync(CHAVE, valor);
    else await SecureStore.deleteItemAsync(CHAVE);
  } catch {}
}

export function ProvedorSessao({ children }) {
  const [sessao, setSessao] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const salvar = useCallback(async (nova) => {
    configurarSessao(nova?.token ?? null);
    setSessao(nova);
    await guardar(nova && JSON.stringify(nova));
  }, []);

  const sair = useCallback(() => salvar(null), [salvar]);

  useEffect(() => {
    SecureStore.getItemAsync(CHAVE)
      .then((salva) => {
        const anterior = salva ? JSON.parse(salva) : null;
        configurarSessao(anterior?.token ?? null, sair);
        setSessao(anterior);
      })
      .catch(() => configurarSessao(null, sair))
      .finally(() => setCarregando(false));
  }, [sair]);

  const valor = useMemo(
    () => ({
      usuario: sessao?.usuario ?? null,
      logado: Boolean(sessao?.token),
      carregando,
      entrar: async (email, senha) => salvar(await api.entrar(email, senha)),
      registrar: async (nome, email, senha) => salvar(await api.registrar(nome, email, senha)),
      sair,
    }),
    [sessao, carregando, salvar, sair],
  );

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>;
}

export const useSessao = () => useContext(ContextoSessao);
