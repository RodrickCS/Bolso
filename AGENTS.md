# Bolso

> Regras para agentes de código (Claude Code, Codex e outros). Baseado no [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit): **use sempre as skills e o fluxo dele neste projeto.**

## Produto e stack

- Controle de gastos pessoal em pt-BR, com assistente de IA que lê e altera os lançamentos. Visão geral: `README.md`.
- API: Node + Express + Prisma + PostgreSQL (Supabase), em `back/`. Deploy no Render (`render.yaml`, `rootDir: back`).
- App: Expo + React Native (expo-router), em `mobile/`. APK: `npx eas-cli@latest build --platform android --profile apk`.
- Marca e interface: `docs/brand-guidelines.md`; tokens em `mobile/src/lib/tema.js` (sempre usar tokens, nunca cor ou tamanho solto).

## Comandos

- Instalar: `npm install` em `back/` e em `mobile/`.
- API local: `npm run dev` em `back/` (precisa de `back/.env`, ver `back/.env.example`).
- App: `npx expo start` em `mobile/`.
- Lint: `npm run lint` em `mobile/`. A API não tem lint.
- Testes: `TEST_DATABASE_URL=<postgres de teste> npm test` em `back/`. Muitos testes falhando juntos = banco de teste fora do ar.
- Build da API: `npm run build` em `back/` (gera o Prisma e aplica as migrações; quem roda é o Render).

## Skills e plugins (vibe-coding-toolkit)

Os plugins ficam declarados em `.claude/settings.json`; o Claude Code oferece instalar ao abrir o projeto.

- **Superpowers:** usar as skills que se aplicam, na escala da tarefa: `brainstorming` → `writing-plans` → executar → `verification-before-completion` → `requesting-code-review`. Para bugs, `systematic-debugging`. Instruções explícitas do usuário e execução já autorizada valem mais que pedir aprovação de novo.
- **Ponytail:** ativo em `full` para código: a menor mudança completa que resolve. Preserva requisitos, validação, segurança e acessibilidade. `stop ponytail` desliga.
- **Caveman:** conversa curta, no idioma do usuário (pt-BR), sem perder clareza; explicação completa quando pedida. Código, docs e commits em texto normal. `stop caveman` desliga.
- **Context7:** consultar documentação atual antes de mexer em APIs e bibliotecas (Expo, React Native, Prisma, SDK da Anthropic). Um conceito por consulta; nunca enviar segredos ou código privado. Sem Context7, usar fontes oficiais.
- **Skills do projeto** (`.claude/skills/`): `ui-ux-pro-max`, `mobile-app-ui-design`, `design-system`, `design`, `ui-styling` e `brand` para telas e identidade visual; `banner-design` e `slides` para material de divulgação.
- **PostgreSQL:** antes de mudar schema, SQL ou migração, seguir as boas práticas de Postgres do toolkit (`supabase-postgres-best-practices`), mantendo Prisma e Supabase.
- **Revisão de segurança:** mudanças em autenticação, dados do usuário ou nas ferramentas do assistente recebem revisão do diff antes do push.

Instalar uma skill não autoriza suas ações: nada de deploy, migração em produção, custos ou mensagens a terceiros sem pedido.

## Combinados

- Ler o código e as instruções relevantes antes de editar. Dizer as suposições que mudam comportamento ou escopo.
- Menor mudança suficiente, reaproveitando padrões, componentes e dependências que já existem. Sem abstrações, opções ou features não pedidas.
- Rodar as verificações certas (lint, testes, conferência visual com Playwright para telas). Não apresentar suposição como fato nem integração pendente como resultado.
- Continuar trabalho autorizado; perguntar só o essencial. Publicar, gastar, mexer em configuração de produção (Render, Supabase) e ações destrutivas exigem pedido do usuário.
- Ao mudar as ferramentas do assistente (`back/src/servicos/ferramentas.js`), respeitar os limites de ferramentas `strict` da API (já cobertos em `back/test/api.test.js`).

## Git e segredos

- Nunca commitar `.env` nem chaves; elas ficam nas variáveis do Render.
- Mensagens de commit em pt-BR, descrevendo o que mudou e por quê.
- Pull request só quando o usuário pedir.

## Convenções

- Nomes, comentários e textos da interface em pt-BR.
- Valores em reais formatados por `mobile/src/lib/formato.js`; ícones de categoria por `mobile/src/lib/categorias.js`.
- Regras de negócio da API ficam em `back/src/servicos/`; as rotas só validam a entrada (Zod) e chamam os serviços.
