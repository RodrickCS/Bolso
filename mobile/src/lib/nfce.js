// Ajuda a ler o QR Code da NFC-e (cupom fiscal eletrônico) no celular

// Conferência rápida antes de chamar a API: link com a chave de acesso de 44 dígitos
export function pareceNfce(texto) {
  if (!/^https?:\/\//i.test(texto ?? "")) return false;
  try {
    return /\d{44}/.test(decodeURIComponent(texto));
  } catch {
    return false;
  }
}

function paraBase64(bytes) {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

const LIMITE_PAGINA = 3 * 1024 * 1024;

// Abre a página da nota pelo próprio celular: ele está no Brasil, e alguns sites da SEFAZ recusam servidores de fora.
// Tenta https primeiro (o Android bloqueia http em apps instalados). Se não der, devolve null e a API tenta sozinha.
export async function baixarPaginaNfce(url) {
  const enderecos = /^http:\/\//i.test(url) ? [url.replace(/^http:/i, "https:"), url] : [url];
  for (const endereco of enderecos) {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 15_000);
    try {
      const resposta = await fetch(endereco, { signal: controle.signal });
      if (!resposta.ok) continue;
      const bytes = new Uint8Array(await resposta.arrayBuffer());
      if (!bytes.length || bytes.length > LIMITE_PAGINA) return null;
      return { base64: paraBase64(bytes), tipo: resposta.headers.get("content-type") ?? "" };
    } catch {
      // tenta o próximo endereço
    } finally {
      clearTimeout(limite);
    }
  }
  return null;
}
