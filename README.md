# Bolso

Controle de gastos pessoais em que **a IA faz o trabalho chato**. Tire foto do cupom, envie o PDF da fatura ou o extrato do banco, ou só digite *"gastei 35 no uber ontem"*: o Bolso lê, separa as transações, categoriza e monta o painel do mês.

<p align="center">
  <img src="docs/painel.png" width="250" alt="Painel com alerta de cobrança em dobro, assinatura que aumentou e dicas do assistente" />
  <img src="docs/chat.png" width="250" alt="Pergunte ao Bolso respondendo onde a pessoa mais gastou, quanto recebeu e o mês com mais gasto em mercado" />
  <img src="docs/adicionar.png" width="250" alt="Tela de adicionar gasto por texto, QR Code do cupom, foto ou arquivo" />
</p>
<p align="center">
  <img src="docs/precos.png" width="250" alt="Inflação pessoal e preço de cada produto, com o mercado mais barato" />
  <img src="docs/produto.png" width="250" alt="Histórico de preço do café com gráfico e comparação entre mercados" />
  <img src="docs/assinaturas.png" width="250" alt="Gastos por categoria e cobranças recorrentes com total por ano" />
</p>

## O que ele faz

- **Lê qualquer comprovante de gasto:** cupom fiscal (foto, item por item), fatura de cartão em PDF (inclusive parcelas "3/10"), extrato CSV/OFX, print de Pix e contas de consumo.
- **Cupom fiscal pelo QR Code (NFC-e):** aponte a câmera para o QR Code do cupom e o Bolso busca a nota no site da SEFAZ: loja, data, total com desconto e cada item, com dados oficiais. O próprio código lê a página; a IA (Haiku) só dá nome padronizado aos itens nunca vistos e escolhe a categoria de uma loja nova, por cerca de US$ 0,0001. Itens e lojas já conhecidos não chamam a IA. A mesma nota lida duas vezes é recusada.
- **Gasto por texto:** frases simples são entendidas no próprio servidor, sem gastar créditos da IA; as mais complexas vão para a IA.
- **Memória de categorias:** quando você corrige a categoria de um lugar, o Bolso lembra e nunca mais pergunta.
- **Conciliação:** o mesmo gasto que chega pelo cupom e pela fatura é contado uma vez só. A fatura vale como valor oficial e o cupom guarda os itens. O mesmo arquivo enviado de novo é recusado antes de chegar na IA, sem gastar créditos; e uma fatura ou extrato baixado de novo, com linhas repetidas, não duplica nada.
- **Painel do mês** com gastos por categoria, entradas e saldo.
- **Assistente do mês:** compara com o mês anterior, prevê o fechamento, aponta gastos fora do padrão e orçamentos estourando. As contas são feitas em código; a IA (Haiku) só escreve as dicas, no máximo uma vez por dia, por menos de US$ 0,001 cada. Sem IA, o cartão mostra os mesmos fatos em texto pronto.
- **Pergunte ao Bolso:** um chat para perguntas como *"quanto gastei com Uber desde agosto?"* ou *"qual mês gastei mais com mercado?"*. A IA (Haiku) só traduz a pergunta em filtros (período, categoria, loja); as contas e a resposta são feitas em código com os seus lançamentos, então ela não inventa números. Cerca de US$ 0,0001 por pergunta, com limite de 40 por dia.
- **Alertas de cobrança (sem IA):** cobrança em dobro, assinatura que aumentou (com quanto custa a mais por ano) e assinatura que cobrou de novo depois de você marcar "Vou cancelar". As cobranças recorrentes mostram o total por ano, e dá para marcar "não é assinatura".
- **Gastos fixos que se repetem sozinhos:** ao ler um texto, comprovante ou boleto, a IA já diz se é um gasto fixo mensal (assinatura, aluguel, mensalidade), sem chamada extra. No dia do vencimento, o Bolso lança o gasto sozinho; quando a fatura chega, a cobrança real substitui o automático, mesmo com reajuste. Dá para desfazer ("Não repetir"), pausar e editar valor e dia. A previsão do fim do mês soma os fixos que ainda vão cair.
- **Orçamentos por categoria** com medidor e alerta a partir de 80%.
- **Cobranças recorrentes detectadas** (assinaturas, aluguel...), avisando quando uma parou de cobrar.
- **Custo da IA sob controle:** cada chamada à API do Claude é registrada, e o app mostra quanto dos créditos já foi usado no mês.
- **Inflação pessoal e preços:** cada item dos cupons vira um produto com histórico de preço. O Bolso mostra quanto cada um subiu desde a primeira compra, em qual mercado ele sai mais barato e um índice da sua inflação pessoal (a média das variações, com mais peso para o que você mais compra). Tudo calculado em código, sem gastar IA. Se a IA der dois nomes ao mesmo produto, dá para renomear ou juntar.
- **Contas e cartões:** cada lançamento pode ser ligado a um cartão ou conta, e o painel mostra quanto saiu de cada um no mês.
- **Edição completa e lançamento manual:** corrija valor, data, descrição, categoria e conta, ou lance um gasto à mão, sem IA.
- **Histórico de envios:** veja o que foi lido, o que deu erro, e apague um envio junto com os lançamentos dele se a leitura saiu errada.
- **Privacidade:** a foto ou o PDF original é apagado assim que é lido. Você pode exportar todos os lançamentos em planilha (CSV para Excel) e excluir a conta com tudo dentro.

## Arquitetura

```
App Expo (React Native) ──► API Node/Express ──► fila na tabela Documento
                                   │                        │
                                   │             API do Claude (visão + PDF,
                                   │             saída em JSON validada por schema)
                                   │                        │
                                   └──── Postgres (Supabase) via Prisma ◄──┘
                                         conciliação + memória de categorias
```

- **back/**: Node 20+, Express, Prisma, Zod e SDK `@anthropic-ai/sdk`. O upload responde na hora (202) e a leitura acontece em segundo plano, com uma fila simples feita na própria tabela `Documento` (`FOR UPDATE SKIP LOCKED`), sem precisar de Redis.
- **mobile/**: Expo SDK 58, Expo Router com abas, câmera, galeria e seletor de arquivos.

## Rodando localmente

### 1. Back-end

```bash
cd back
cp .env.example .env    # preencha DATABASE_URL, DIRECT_URL e JWT_SECRET
npm install
npx prisma migrate deploy
npm run dev
```

Com `IA_MOCK=true` (padrão do `.env.example`) a API devolve respostas prontas de `src/ia/mocks/`, e você desenvolve as telas **sem gastar créditos**. Para usar a IA de verdade, coloque sua `ANTHROPIC_API_KEY` e mude para `IA_MOCK=false`.

Serve qualquer Postgres. Para usar o Supabase: crie um projeto, clique em **Connect > ORMs > Prisma** e copie as duas URLs (pooler na porta 6543 para `DATABASE_URL` e conexão direta na porta 5432 para `DIRECT_URL`).

### 2. App

```bash
cd mobile
cp .env.example .env    # EXPO_PUBLIC_API_URL=http://IP-DO-SEU-PC:3000
npm install
npx expo start
```

Abra com o **Expo Go** no celular (escaneie o QR code). No celular, `localhost` é o próprio celular, então use o IP do computador na rede Wi-Fi.

### 3. Testes

```bash
cd back
npm test                                                  # testes unitários
TEST_DATABASE_URL=postgresql://... npm test               # + integração (use um banco só para testes: ele é apagado)
```

## Deploy (grátis)

1. **Banco:** projeto no [Supabase](https://supabase.com), plano gratuito.
2. **API:** no [Render](https://render.com), use **New > Blueprint** apontando para este repositório (o `render.yaml` já configura tudo) e preencha `DATABASE_URL`, `DIRECT_URL` e `ANTHROPIC_API_KEY`. As migrations rodam no build.
3. **App:** troque `EXPO_PUBLIC_API_URL` pela URL do Render.

No plano grátis o Render "dorme" depois de 15 minutos sem acesso e leva cerca de 1 minuto para acordar. Documentos enviados nesse meio-tempo ficam na fila e são lidos quando a API acorda.

## Gerando o APK (Android)

O APK é gerado na nuvem pelo [EAS Build](https://docs.expo.dev/build/setup/), sem precisar de Android Studio.

1. Na pasta `mobile`:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --platform android --profile apk
   ```
2. No fim, o terminal mostra um link e um QR code. Abra no celular, baixe o `.apk` e instale.

## Custos da IA

| Variável | Padrão | Uso |
|---|---|---|
| `IA_MODELO_DOCUMENTOS` | `claude-opus-5-5` | Cupons, faturas, extratos e comprovantes |
| `IA_MODELO_RAPIDO` | `claude-opus-5-5` | Gastos por texto e categorização. Para economizar: `claude-haiku-5-5` |

O que já está no código para gastar pouco:
- Cupons pelo QR Code: os itens vêm da SEFAZ e são lidos pelo código, sem a IA olhar foto.
- O mesmo arquivo (ou a mesma NFC-e) enviado de novo é recusado antes de chegar na IA.
- Cache de prompt: instruções e lista de produtos ficam no cache por 5 minutos, então vários cupons, faturas ou perguntas em sequência pagam só a parte nova. O custo registrado já conta gravação e leitura do cache.
- Fotos reduzidas para 1000 px no próprio celular antes do envio.
- Frases simples de lugares conhecidos não chamam a IA.
- Memória de categorias: um lançamento manual de um lugar já visto não chama a IA.
- Modo mock para desenvolvimento.
- Fallback automático no servidor da Anthropic, caso o modelo recuse uma requisição.

Lembre de definir um **limite de gasto mensal** no Claude Console.

## Estrutura

```
back/
  prisma/schema.prisma       modelos: Usuario, Conta, Categoria, Documento, Transacao, Item, Produto, RegraCategoria, UsoIa,
                             Orcamento, ResumoAssistente
  src/ia/                    cliente da API, schemas de saída, prompts e mocks
  src/servicos/              fila, importação, conciliação, memória de categorias, parser de texto,
                             análises do assistente (assinaturas, previsão, orçamentos), preços dos produtos
  src/rotas/                 auth, documentos, transações, painel, cadastros, assistente, produtos, dados
  test/                      unitários + integração
mobile/
  src/app/                   rotas (Expo Router): entrar, (abas)/painel, gastos, adicionar, perfil,
                             lançamento, contas, orçamentos, produtos, produto
  src/componentes/           peças das telas (painel, histórico de envios, gráfico de preço)
  src/lib/                   cliente da API, sessão, formatação, tema
```

## Próximos passos

- [x] Ler o QR Code da NFC-e direto da SEFAZ (dados oficiais) e usar a IA só para nomear itens novos e categorizar
- [x] Orçamentos por categoria com alertas
- [x] Detectar assinaturas e gastos recorrentes
- [x] Previsão do fim do mês (no assistente)
- [x] Inflação pessoal e comparação de preços entre mercados
- [x] Chat com os seus dados ("quanto gastei com transporte desde agosto?")
- [x] Alertas de cobrança em dobro, reajuste de assinatura e cancelamento não concluído
- [ ] Resumo semanal por notificação
