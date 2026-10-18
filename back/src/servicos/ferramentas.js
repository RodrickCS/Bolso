// Ferramentas do assistente do chat. A IA escolhe qual chamar; quem executa é este código, sempre com o
// usuário logado. Consultar e criar acontecem na hora; editar e apagar só registram uma proposta, que o
// usuário confirma num botão do app (rotas/conversa.js). Cada ferramenta devolve um texto para a IA ler.
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { executarAgora, lancamentosDoUsuario, proporAcao, LIMITE_EM_LOTE } from "./acoes.js";
import { reais } from "./analise.js";
import { assinaturasDetectadas, statusOrcamentos } from "./assistente.js";
import { dataDoDia } from "./importacao.js";
import { hojeISO, normalizarEstabelecimento, semAcentos } from "./texto.js";

const iso = (data) => data.toISOString().slice(0, 10);
const mesAtualISO = () => hojeISO().slice(0, 7);
const diaMes = (data) => `${iso(data).slice(8, 10)}/${iso(data).slice(5, 7)}`;
const comparavel = (texto) => semAcentos(String(texto ?? "").toLowerCase().trim());
const TIPOS_CONTA = { CREDITO: "cartão de crédito", CORRENTE: "conta corrente", POUPANCA: "poupança", DINHEIRO: "dinheiro" };

// "Uber · 17/10 · R$ 23,15"
export const linhaLancamento = (t) => `${t.descricao} · ${diaMes(t.data)} · ${reais(Number(t.valor))}`;

// Erro que a IA lê e corrige (nome de categoria errado, id que não existe...)
class ErroDeUso extends Error {}

function acharPorNome(lista, nome, oQue) {
  const alvo = comparavel(nome);
  const exato = lista.find((item) => comparavel(item.nome) === alvo);
  if (exato) return exato;
  const parecidos = lista.filter((item) => comparavel(item.nome).includes(alvo) || alvo.includes(comparavel(item.nome)));
  if (parecidos.length === 1) return parecidos[0];
  throw new ErroDeUso(`${oQue} "${nome}" não encontrada. Opções: ${lista.map((item) => item.nome).join(", ")}`);
}

function dataValida(texto, campo) {
  if (texto === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || !dataDoDia(texto)) throw new ErroDeUso(`${campo}: use AAAA-MM-DD`);
  return texto;
}

function valorValido(valor, campo = "valor") {
  if (valor === null) return null;
  if (!(valor > 0) || valor > 10_000_000) throw new ErroDeUso(`${campo} precisa ser maior que zero`);
  return Math.round(valor * 100) / 100;
}

const nulo = (esquema, descricao) => esquema.nullable().describe(descricao);

// ctx: { usuarioId, acoes: [] (cartões para o app), citados: Map (lançamentos que apareceram, para a próxima mensagem) }
export function criarFerramentas(ctx) {
  const { usuarioId } = ctx;
  const citar = (lista) => {
    for (const t of lista) ctx.citados.set(t.id, `#${t.id} ${linhaLancamento(t)}${t.categoria?.nome ? ` (${t.categoria.nome})` : ""}`);
  };
  const categorias = () => prisma.categoria.findMany({ where: { usuarioId }, orderBy: { nome: "asc" } });
  const contas = () => prisma.conta.findMany({ where: { usuarioId }, orderBy: { nome: "asc" } });

  async function registrar(promessa) {
    const acao = await promessa;
    ctx.acoes.push(acao);
    return acao;
  }

  return [
    {
      nome: "consultar_lancamentos",
      descricao:
        "Busca gastos e entradas do usuário. Use para responder perguntas (quanto, onde, quando, maiores) e para achar os ids " +
        "antes de editar ou apagar. Sem período, usa o mês atual (ou os últimos 6 meses se agrupar por mês).",
      esquema: z.strictObject({
        inicio: nulo(z.string(), "Data inicial AAAA-MM-DD, ou null"),
        fim: nulo(z.string(), "Data final AAAA-MM-DD (inclusive), ou null para hoje"),
        tipo: z.enum(["DESPESA", "RECEITA", "AMBOS"]).describe("DESPESA para gastos (padrão), RECEITA para entradas"),
        categorias: z.array(z.string()).describe("Nomes de categorias para filtrar; lista vazia para todas"),
        busca: nulo(z.string(), "Texto para procurar na descrição ou loja (ex.: uber, ifood), ou null"),
        conta: nulo(z.string(), "Nome da conta ou cartão para filtrar, ou null"),
        agrupar: z.enum(["nenhum", "categoria", "mes", "estabelecimento"]).describe("Como somar os resultados"),
        ordenar: z.enum(["recentes", "maiores"]).describe("Ordem da lista de lançamentos"),
      }),
      async executar(f) {
        const hoje = hojeISO();
        let inicio = dataValida(f.inicio, "inicio");
        let fim = dataValida(f.fim, "fim") ?? hoje;
        if (!inicio) {
          const base = dataDoDia(hoje);
          const voltar = f.agrupar === "mes" ? 5 : 0;
          inicio = iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - voltar, 1)));
        }
        if (fim < inicio) [inicio, fim] = [fim, inicio];
        const todas = await categorias();
        const ids = f.categorias.map((nome) => acharPorNome(todas, nome, "Categoria").id);
        const conta = f.conta ? acharPorNome(await contas(), f.conta, "Conta") : null;
        const busca = f.busca?.trim().slice(0, 60);
        const lista = await prisma.transacao.findMany({
          where: {
            usuarioId,
            conciliadaComId: null,
            data: { gte: dataDoDia(inicio), lte: dataDoDia(fim) },
            ...(f.tipo !== "AMBOS" && { tipo: f.tipo }),
            ...(ids.length && { categoriaId: { in: ids } }),
            ...(conta && { contaId: conta.id }),
            ...(busca && {
              OR: [
                { descricao: { contains: busca, mode: "insensitive" } },
                { estabelecimento: { contains: busca, mode: "insensitive" } },
              ],
            }),
          },
          include: { categoria: { select: { nome: true } }, conta: { select: { nome: true } }, recorrencia: { select: { ativa: true } } },
          orderBy: f.ordenar === "maiores" ? [{ valor: "desc" }] : [{ data: "desc" }, { id: "desc" }],
          take: 2000,
        });
        const total = Math.round(lista.reduce((soma, t) => soma + Number(t.valor), 0) * 100) / 100;
        const resposta = { periodo: `${inicio} a ${fim}`, quantidade: lista.length, total };

        if (f.agrupar !== "nenhum") {
          const chave = {
            categoria: (t) => t.categoria?.nome ?? "Sem categoria",
            mes: (t) => iso(t.data).slice(0, 7),
            estabelecimento: (t) => t.estabelecimento ?? normalizarEstabelecimento(t.descricao) ?? t.descricao,
          }[f.agrupar];
          const grupos = new Map();
          for (const t of lista) {
            const g = grupos.get(chave(t)) ?? { nome: chave(t), total: 0, vezes: 0 };
            g.total = Math.round((g.total + Number(t.valor)) * 100) / 100;
            g.vezes += 1;
            grupos.set(g.nome, g);
          }
          resposta.grupos = [...grupos.values()].sort((a, b) => (f.agrupar === "mes" ? a.nome.localeCompare(b.nome) : b.total - a.total)).slice(0, 20);
        }
        const mostrados = lista.slice(0, 30);
        citar(mostrados);
        resposta.lancamentos = mostrados.map((t) => ({
          id: t.id,
          data: iso(t.data),
          descricao: t.descricao,
          valor: Number(t.valor),
          tipo: t.tipo,
          categoria: t.categoria?.nome ?? null,
          conta: t.conta?.nome ?? null,
          todo_mes: Boolean(t.recorrencia?.ativa),
        }));
        if (lista.length > mostrados.length) resposta.observacao = `Mostrando ${mostrados.length} de ${lista.length}. Refine a busca para ver outros.`;
        return JSON.stringify(resposta);
      },
    },

    {
      nome: "consultar_cadastros",
      descricao:
        "Lista contas e cartões, categorias, orçamentos do mês (com quanto já foi gasto), gastos fixos (com id) e " +
        "assinaturas detectadas (com chave). Use antes de mexer em qualquer um deles.",
      esquema: z.strictObject({}),
      async executar() {
        const mes = mesAtualISO();
        const [listaContas, listaCategorias, orcamentos, fixos, assinaturas] = await Promise.all([
          contas(),
          categorias(),
          statusOrcamentos(usuarioId, mes),
          prisma.recorrencia.findMany({ where: { usuarioId }, orderBy: { dia: "asc" } }),
          assinaturasDetectadas(usuarioId, mes),
        ]);
        return JSON.stringify({
          contas: listaContas.map((c) => ({ nome: c.nome, tipo: TIPOS_CONTA[c.tipo] })),
          categorias: listaCategorias.map((c) => ({ nome: c.nome, tipo: c.tipo })),
          orcamentos: orcamentos.map((o) => ({ categoria: o.categoria, limite: o.limite, gasto_no_mes: o.gasto })),
          gastos_fixos: fixos.map((r) => ({ id: r.id, descricao: r.descricao, valor: Number(r.valor), dia: r.dia, ativo: r.ativa })),
          assinaturas: assinaturas.map((a) => ({ chave: a.chave, nome: a.nome, valor_mensal: a.valorMensal, marcacao: a.marcacao ?? null })),
        });
      },
    },

    {
      nome: "criar_lancamento",
      descricao:
        "Registra um gasto ou entrada novo. Acontece na hora (o usuário pode desfazer). Para vários gastos numa frase, " +
        "chame uma vez para cada.",
      esquema: z.strictObject({
        tipo: z.enum(["DESPESA", "RECEITA"]).describe("DESPESA para gasto, RECEITA para entrada"),
        valor: z.number().describe("Valor em reais, positivo"),
        descricao: z.string().describe("Onde ou com o quê, curto: Uber, Padaria, Salário"),
        data: nulo(z.string(), "AAAA-MM-DD; null para hoje"),
        categoria: nulo(z.string(), "Nome exato de uma categoria do usuário; null para o Bolso escolher sozinho"),
        conta: nulo(z.string(), "Nome da conta ou cartão usado; null se não foi dito"),
        repetir_todo_mes: nulo(z.boolean(), "true se o usuário disse que repete todo mês; null para o Bolso decidir"),
      }),
      async executar(f) {
        const valor = valorValido(f.valor);
        const data = dataValida(f.data, "data") ?? hojeISO();
        const descricao = f.descricao.trim().slice(0, 120);
        if (!descricao) throw new ErroDeUso("descricao vazia");
        const categoria = f.categoria ? acharPorNome(await categorias(), f.categoria, "Categoria") : null;
        const conta = f.conta ? acharPorNome(await contas(), f.conta, "Conta") : null;
        const dados = {
          tipo: f.tipo,
          valor,
          descricao,
          data,
          ...(categoria && { categoriaId: categoria.id }),
          ...(conta && { contaId: conta.id }),
          ...(f.repetir_todo_mes !== null && { repetir: f.repetir_todo_mes }),
        };
        const { acao, resultado } = await executarAgora(usuarioId, "criar_lancamento", {
          resumo: `${f.tipo === "RECEITA" ? "Entrada" : "Gasto"} adicionado`,
          detalhes: [],
          dados,
        });
        const criada = await prisma.transacao.findUnique({ where: { id: resultado.lancamentoId }, include: { categoria: true, conta: true } });
        const detalhes = [`${linhaLancamento(criada)}${criada.categoria ? ` · ${criada.categoria.nome}` : ""}${criada.conta ? ` · ${criada.conta.nome}` : ""}`];
        if (resultado.repete) detalhes.push("Repete todo mês");
        ctx.acoes.push(await prisma.acaoAssistente.update({ where: { id: acao.id }, data: { detalhes, dados: { ...dados, lancamentoId: criada.id } } }));
        citar([criada]);
        return `Criado #${criada.id}: ${detalhes.join(" · ")}. O usuário vê um cartão com opção de desfazer.`;
      },
    },

    {
      nome: "editar_lancamentos",
      descricao:
        `Muda um ou mais lançamentos (até ${LIMITE_EM_LOTE}) pelos ids. Campos null ficam como estão. Não executa: cria uma ` +
        "proposta que o usuário confirma num botão. Mudar a categoria também ensina o Bolso para os próximos dessa loja.",
      esquema: z.strictObject({
        ids: z.array(z.number()).describe("Ids dos lançamentos, vindos de consultar_lancamentos"),
        valor: nulo(z.number(), "Novo valor, ou null"),
        descricao: nulo(z.string(), "Nova descrição, ou null"),
        data: nulo(z.string(), "Nova data AAAA-MM-DD, ou null"),
        categoria: nulo(z.string(), "Nova categoria (nome exato), ou null"),
        conta: nulo(z.string(), "Nova conta ou cartão (nome), ou null"),
        repetir_todo_mes: nulo(z.boolean(), "true para virar gasto fixo, false para parar de repetir, null para não mexer"),
      }),
      async executar(f) {
        const lista = await lancamentosDoUsuario(usuarioId, f.ids);
        const mudancas = {};
        const partes = [];
        if (f.valor !== null) (mudancas.valor = valorValido(f.valor)), partes.push(`valor para ${reais(mudancas.valor)}`);
        if (f.descricao?.trim()) (mudancas.descricao = f.descricao.trim().slice(0, 120)), partes.push(`descrição para "${mudancas.descricao}"`);
        if (f.data !== null) (mudancas.data = dataValida(f.data, "data")), partes.push(`data para ${mudancas.data.split("-").reverse().join("/")}`);
        if (f.categoria !== null) {
          const categoria = acharPorNome(await categorias(), f.categoria, "Categoria");
          mudancas.categoriaId = categoria.id;
          partes.push(`categoria para ${categoria.nome}`);
        }
        if (f.conta !== null) {
          const conta = acharPorNome(await contas(), f.conta, "Conta");
          mudancas.contaId = conta.id;
          partes.push(`conta para ${conta.nome}`);
        }
        if (f.repetir_todo_mes !== null) partes.push(f.repetir_todo_mes ? "repetir todo mês" : "parar de repetir");
        if (!partes.length) throw new ErroDeUso("nenhuma mudança informada");
        if (f.repetir_todo_mes && lista.some((t) => t.tipo !== "DESPESA")) throw new ErroDeUso("só gastos podem repetir todo mês");

        const quantos = lista.length === 1 ? "1 lançamento" : `${lista.length} lançamentos`;
        const acao = await registrar(
          proporAcao(usuarioId, "editar_lancamentos", {
            resumo: `Mudar ${partes.join(", ")} em ${quantos}`,
            detalhes: lista.map(linhaLancamento),
            dados: { ids: lista.map((t) => t.id), mudancas, repetir: f.repetir_todo_mes },
          }),
        );
        citar(lista);
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa tocar em confirmar no cartão. ${acao.resumo}.`;
      },
    },

    {
      nome: "apagar_lancamentos",
      descricao: `Apaga um ou mais lançamentos (até ${LIMITE_EM_LOTE}) pelos ids. Não executa: cria uma proposta que o usuário confirma. Não dá para desfazer depois.`,
      esquema: z.strictObject({ ids: z.array(z.number()).describe("Ids dos lançamentos, vindos de consultar_lancamentos") }),
      async executar(f) {
        const lista = await lancamentosDoUsuario(usuarioId, f.ids);
        const total = lista.reduce((soma, t) => soma + Number(t.valor), 0);
        const acao = await registrar(
          proporAcao(usuarioId, "apagar_lancamentos", {
            resumo: `Apagar ${lista.length === 1 ? "1 lançamento" : `${lista.length} lançamentos`}, total ${reais(total)}`,
            detalhes: lista.map(linhaLancamento),
            dados: { ids: lista.map((t) => t.id) },
          }),
        );
        citar(lista);
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa tocar em apagar no cartão. ${acao.resumo}.`;
      },
    },

    {
      nome: "criar_conta",
      descricao: "Cadastra uma conta ou cartão novo. Acontece na hora (o usuário pode desfazer).",
      esquema: z.strictObject({
        nome: z.string().describe("Nome, ex.: Nubank, Itaú, Carteira"),
        tipo: z.enum(["CREDITO", "CORRENTE", "POUPANCA", "DINHEIRO"]),
      }),
      async executar(f) {
        const nome = f.nome.trim().slice(0, 60);
        if (!nome) throw new ErroDeUso("nome vazio");
        if ((await contas()).some((c) => comparavel(c.nome) === comparavel(nome))) throw new ErroDeUso(`Já existe a conta ${nome}`);
        const { acao } = await executarAgora(usuarioId, "criar_conta", {
          resumo: "Conta adicionada",
          detalhes: [`${nome} · ${TIPOS_CONTA[f.tipo]}`],
          dados: { nome, tipo: f.tipo },
        });
        ctx.acoes.push(acao);
        return `Conta ${nome} criada.`;
      },
    },

    {
      nome: "alterar_conta",
      descricao:
        "Renomeia ou apaga uma conta ou cartão. Não executa: cria uma proposta que o usuário confirma. Apagar mantém os " +
        "lançamentos, que só ficam sem conta.",
      esquema: z.strictObject({
        conta: z.string().describe("Nome atual da conta"),
        acao: z.enum(["renomear", "apagar"]),
        novo_nome: nulo(z.string(), "Novo nome quando acao é renomear; senão null"),
      }),
      async executar(f) {
        const conta = acharPorNome(await contas(), f.conta, "Conta");
        if (f.acao === "renomear") {
          const nome = f.novo_nome?.trim().slice(0, 60);
          if (!nome) throw new ErroDeUso("informe novo_nome");
          const acao = await registrar(
            proporAcao(usuarioId, "renomear_conta", {
              resumo: `Renomear a conta ${conta.nome} para ${nome}`,
              detalhes: [],
              dados: { contaId: conta.id, nome },
            }),
          );
          return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa confirmar.`;
        }
        const usos = await prisma.transacao.count({ where: { contaId: conta.id } });
        const acao = await registrar(
          proporAcao(usuarioId, "apagar_conta", {
            resumo: `Apagar a conta ${conta.nome}`,
            detalhes: [usos ? `${usos} lançamentos continuam, só ficam sem conta` : "Nenhum lançamento usa essa conta"],
            dados: { contaId: conta.id },
          }),
        );
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa confirmar.`;
      },
    },

    {
      nome: "criar_categoria",
      descricao: "Cria uma categoria nova. Acontece na hora (o usuário pode desfazer). Antes, confira se já não existe uma parecida.",
      esquema: z.strictObject({
        nome: z.string().describe("Nome da categoria, ex.: Academia"),
        tipo: z.enum(["DESPESA", "RECEITA"]),
      }),
      async executar(f) {
        const nome = f.nome.trim().slice(0, 40);
        if (!nome) throw new ErroDeUso("nome vazio");
        if ((await categorias()).some((c) => comparavel(c.nome) === comparavel(nome))) throw new ErroDeUso(`Já existe a categoria ${nome}`);
        const { acao } = await executarAgora(usuarioId, "criar_categoria", {
          resumo: "Categoria criada",
          detalhes: [`${nome} · ${f.tipo === "RECEITA" ? "entradas" : "gastos"}`],
          dados: { nome: nome.charAt(0).toUpperCase() + nome.slice(1), tipo: f.tipo },
        });
        ctx.acoes.push(acao);
        return `Categoria ${nome} criada.`;
      },
    },

    {
      nome: "definir_orcamento",
      descricao:
        "Define ou remove o limite mensal de uma categoria. Um orçamento novo é criado na hora; mudar ou remover um que já " +
        "existe vira proposta para o usuário confirmar.",
      esquema: z.strictObject({
        categoria: z.string().describe("Nome da categoria"),
        valor_mensal: nulo(z.number(), "Limite por mês em reais; null para remover o orçamento"),
      }),
      async executar(f) {
        const categoria = acharPorNome(await categorias(), f.categoria, "Categoria");
        const valorMensal = valorValido(f.valor_mensal, "valor_mensal");
        const atual = await prisma.orcamento.findUnique({ where: { usuarioId_categoriaId: { usuarioId, categoriaId: categoria.id } } });
        const dados = { categoriaId: categoria.id, valorMensal };
        if (!atual) {
          if (valorMensal === null) throw new ErroDeUso(`${categoria.nome} não tem orçamento`);
          const { acao } = await executarAgora(usuarioId, "definir_orcamento", {
            resumo: "Orçamento criado",
            detalhes: [`${categoria.nome} · ${reais(valorMensal)} por mês`],
            dados,
          });
          ctx.acoes.push(acao);
          return `Orçamento de ${categoria.nome} criado: ${reais(valorMensal)} por mês.`;
        }
        const resumo =
          valorMensal === null
            ? `Remover o orçamento de ${categoria.nome} (${reais(Number(atual.valorMensal))} por mês)`
            : `Mudar o orçamento de ${categoria.nome} de ${reais(Number(atual.valorMensal))} para ${reais(valorMensal)} por mês`;
        const acao = await registrar(proporAcao(usuarioId, "definir_orcamento", { resumo, detalhes: [], dados }));
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa confirmar.`;
      },
    },

    {
      nome: "alterar_gasto_fixo",
      descricao:
        "Pausa, retoma, edita (valor ou dia) ou apaga um gasto fixo pelo id de consultar_cadastros. Não executa: cria uma " +
        "proposta que o usuário confirma. Apagar mantém os lançamentos que ele já fez.",
      esquema: z.strictObject({
        id: z.number().describe("Id do gasto fixo"),
        acao: z.enum(["pausar", "retomar", "editar", "apagar"]),
        valor: nulo(z.number(), "Novo valor mensal quando acao é editar; senão null"),
        dia: nulo(z.number(), "Novo dia do vencimento (1 a 31) quando acao é editar; senão null"),
      }),
      async executar(f) {
        const fixo = await prisma.recorrencia.findFirst({ where: { id: Number(f.id) || 0, usuarioId } });
        if (!fixo) throw new ErroDeUso(`Gasto fixo ${f.id} não encontrado; use consultar_cadastros`);
        const valor = f.acao === "editar" ? valorValido(f.valor, "valor") : null;
        const dia = f.acao === "editar" && f.dia !== null ? f.dia : null;
        if (dia !== null && !(Number.isInteger(dia) && dia >= 1 && dia <= 31)) throw new ErroDeUso("dia vai de 1 a 31");
        if (f.acao === "editar" && valor === null && dia === null) throw new ErroDeUso("informe valor ou dia");
        const resumo = {
          pausar: `Pausar o gasto fixo ${fixo.descricao}`,
          retomar: `Voltar a lançar ${fixo.descricao} todo mês`,
          apagar: `Apagar o gasto fixo ${fixo.descricao}`,
          editar: `Mudar ${fixo.descricao}: ${[valor && `valor para ${reais(valor)}`, dia && `todo dia ${dia}`].filter(Boolean).join(", ")}`,
        }[f.acao];
        const acao = await registrar(
          proporAcao(usuarioId, "alterar_gasto_fixo", {
            resumo,
            detalhes: f.acao === "apagar" ? ["Os lançamentos que ele já fez continuam"] : [],
            dados: { recorrenciaId: fixo.id, acao: f.acao, valor, dia },
          }),
        );
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa confirmar.`;
      },
    },

    {
      nome: "marcar_assinatura",
      descricao:
        'Marca uma assinatura detectada (chave de consultar_cadastros): "vou_cancelar" faz o Bolso avisar se cobrar de novo, ' +
        '"nao_e_assinatura" tira da lista, "desmarcar" desfaz a marcação. Vira proposta para o usuário confirmar.',
      esquema: z.strictObject({
        chave: z.string().describe("Chave da assinatura"),
        acao: z.enum(["vou_cancelar", "nao_e_assinatura", "desmarcar"]),
      }),
      async executar(f) {
        const assinatura = (await assinaturasDetectadas(usuarioId, mesAtualISO())).find((a) => a.chave === f.chave);
        if (!assinatura) throw new ErroDeUso(`Assinatura ${f.chave} não encontrada; use consultar_cadastros`);
        const tipo = { vou_cancelar: "cancelar", nao_e_assinatura: "ignorar", desmarcar: null }[f.acao];
        const resumo = {
          vou_cancelar: `Marcar ${assinatura.nome} como "vou cancelar" (o Bolso avisa se cobrar de novo)`,
          nao_e_assinatura: `Tirar ${assinatura.nome} das cobranças recorrentes`,
          desmarcar: `Desfazer a marcação de ${assinatura.nome}`,
        }[f.acao];
        const acao = await registrar(
          proporAcao(usuarioId, "marcar_assinatura", { resumo, detalhes: [], dados: { chave: `assinatura:${assinatura.chave}`, tipo } }),
        );
        return `Proposta #${acao.id} criada e AINDA NÃO FEITA: o usuário precisa confirmar.`;
      },
    },
  ];
}

// Roda uma ferramenta: erros de uso voltam como texto para a IA corrigir; o resto sobe
export async function rodarFerramenta(ferramenta, entrada) {
  try {
    return { texto: await ferramenta.executar(ferramenta.esquema.parse(entrada)), erro: false };
  } catch (erro) {
    if (erro instanceof ErroDeUso || erro instanceof z.ZodError || erro.status === 400 || erro.status === 404 || erro.status === 409) {
      return { texto: `Erro: ${erro.message}`, erro: true };
    }
    throw erro;
  }
}
