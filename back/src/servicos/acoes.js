// Ações do assistente do chat. Criar algo novo acontece na hora e pode ser desfeito; editar e apagar viram
// uma proposta (PENDENTE) que só é executada quando o usuário toca em confirmar, por uma rota própria.
// A IA não tem como confirmar sozinha: ela só cria propostas.
import { ErroHttp } from "../lib/erros.js";
import { prisma } from "../lib/prisma.js";
import { dataDoDia } from "./importacao.js";
import { apagarLancamento, criarLancamento, definirRepeticao, editarLancamento } from "./lancamentos.js";
import { proximoVencimento } from "./recorrencias.js";

// Proposta velha não vale mais: os dados podem ter mudado desde então
export const VALIDADE_PROPOSTA_MS = 30 * 60 * 1000;
// Até quando dá para desfazer
export const PRAZO_DESFAZER_MS = 24 * 60 * 60 * 1000;
export const LIMITE_EM_LOTE = 50;

const iso = (data) => (data instanceof Date ? data.toISOString().slice(0, 10) : data);

// Cada tipo sabe executar seus dados e devolver como desfazer (null quando não dá)
const EXECUTORES = {
  async criar_lancamento(usuarioId, dados) {
    const criada = await criarLancamento(usuarioId, { ...dados, data: dataDoDia(dados.data) });
    const recorrenciaNova = criada.recorrencia && (await prisma.transacao.count({ where: { recorrenciaId: criada.recorrencia.id } })) === 1;
    return {
      resultado: { lancamentoId: criada.id, categoria: criada.categoria?.nome ?? null, repete: Boolean(criada.recorrencia?.ativa) },
      desfazer: { lancamentoId: criada.id, recorrenciaId: recorrenciaNova ? criada.recorrencia.id : null },
    };
  },

  async editar_lancamentos(usuarioId, { ids, mudancas, repetir }) {
    const atuais = await prisma.transacao.findMany({ where: { id: { in: ids }, usuarioId }, include: { recorrencia: true } });
    if (atuais.length !== ids.length) throw new ErroHttp(409, "Algum lançamento não existe mais. Peça de novo ao assistente.");
    const anteriores = atuais.map((t) => ({
      id: t.id,
      valor: Number(t.valor),
      descricao: t.descricao,
      data: iso(t.data),
      categoriaId: t.categoriaId,
      contaId: t.contaId,
      repetia: Boolean(t.recorrencia?.ativa),
    }));
    const campos = { ...mudancas, ...(mudancas.data && { data: dataDoDia(mudancas.data) }) };
    for (const id of ids) {
      if (Object.keys(campos).length) await editarLancamento(usuarioId, id, campos);
      if (repetir !== null && repetir !== undefined) await definirRepeticao(usuarioId, id, repetir);
    }
    return { desfazer: { anteriores } };
  },

  async apagar_lancamentos(usuarioId, { ids }) {
    for (const id of ids) await apagarLancamento(usuarioId, id);
    return { desfazer: null };
  },

  async criar_conta(usuarioId, { nome, tipo }) {
    const conta = await prisma.conta.create({ data: { usuarioId, nome, tipo } });
    return { resultado: { contaId: conta.id }, desfazer: { contaId: conta.id } };
  },

  async renomear_conta(usuarioId, { contaId, nome }) {
    const atual = await prisma.conta.findFirst({ where: { id: contaId, usuarioId } });
    if (!atual) throw new ErroHttp(409, "Essa conta não existe mais");
    await prisma.conta.update({ where: { id: contaId }, data: { nome } });
    return { desfazer: { contaId, nome: atual.nome } };
  },

  async apagar_conta(usuarioId, { contaId }) {
    const { count } = await prisma.conta.deleteMany({ where: { id: contaId, usuarioId } });
    if (!count) throw new ErroHttp(409, "Essa conta não existe mais");
    return { desfazer: null };
  },

  async criar_categoria(usuarioId, { nome, tipo }) {
    const existente = await prisma.categoria.findUnique({ where: { usuarioId_nome: { usuarioId, nome } } });
    if (existente) throw new ErroHttp(409, "Já existe uma categoria com esse nome");
    const categoria = await prisma.categoria.create({ data: { usuarioId, nome, tipo } });
    return { resultado: { categoriaId: categoria.id }, desfazer: { categoriaId: categoria.id } };
  },

  // valorMensal null remove o orçamento
  async definir_orcamento(usuarioId, { categoriaId, valorMensal }) {
    const atual = await prisma.orcamento.findUnique({ where: { usuarioId_categoriaId: { usuarioId, categoriaId } } });
    if (valorMensal === null) {
      await prisma.orcamento.deleteMany({ where: { usuarioId, categoriaId } });
    } else {
      await prisma.orcamento.upsert({
        where: { usuarioId_categoriaId: { usuarioId, categoriaId } },
        create: { usuarioId, categoriaId, valorMensal },
        update: { valorMensal },
      });
    }
    return { desfazer: { categoriaId, valorMensal: atual ? Number(atual.valorMensal) : null } };
  },

  // acao: pausar | retomar | editar | apagar
  async alterar_gasto_fixo(usuarioId, { recorrenciaId, acao, valor, dia }) {
    const atual = await prisma.recorrencia.findFirst({ where: { id: recorrenciaId, usuarioId } });
    if (!atual) throw new ErroHttp(409, "Esse gasto fixo não existe mais");
    if (acao === "apagar") {
      await prisma.recorrencia.delete({ where: { id: atual.id } });
      return { desfazer: null };
    }
    const novoDia = dia ?? atual.dia;
    const ativa = acao === "pausar" ? false : acao === "retomar" ? true : atual.ativa;
    // Mudou o dia ou voltou a valer: o próximo vencimento é recalculado a partir de hoje
    const recalcular = novoDia !== atual.dia || (ativa && !atual.ativa);
    await prisma.recorrencia.update({
      where: { id: atual.id },
      data: { ativa, dia: novoDia, ...(valor && { valor }), ...(recalcular && { proximaData: proximoVencimento(novoDia) }) },
    });
    return {
      desfazer: { recorrenciaId: atual.id, ativa: atual.ativa, valor: Number(atual.valor), dia: atual.dia, proximaData: iso(atual.proximaData) },
    };
  },

  // tipo da marcação: cancelar | ignorar; null tira a marcação
  async marcar_assinatura(usuarioId, { chave, tipo }) {
    const atual = await prisma.marcacao.findUnique({ where: { usuarioId_chave: { usuarioId, chave } } });
    await aplicarMarcacao(usuarioId, chave, tipo);
    return { desfazer: { chave, tipo: atual?.tipo ?? null } };
  },
};

async function aplicarMarcacao(usuarioId, chave, tipo) {
  if (tipo === null) {
    await prisma.marcacao.deleteMany({ where: { usuarioId, chave } });
  } else {
    await prisma.marcacao.upsert({
      where: { usuarioId_chave: { usuarioId, chave } },
      create: { usuarioId, chave, tipo },
      update: { tipo, criadoEm: new Date() },
    });
  }
}

// Volta ao estado anterior, a partir do que o executor guardou
const DESFAZEDORES = {
  async criar_lancamento(usuarioId, { lancamentoId, recorrenciaId }) {
    await prisma.transacao.deleteMany({ where: { id: lancamentoId, usuarioId } });
    if (recorrenciaId) await prisma.recorrencia.deleteMany({ where: { id: recorrenciaId, usuarioId } });
  },
  async editar_lancamentos(usuarioId, { anteriores }) {
    for (const a of anteriores) {
      const atual = await prisma.transacao.findFirst({ where: { id: a.id, usuarioId }, include: { recorrencia: true } });
      if (!atual) continue;
      await prisma.transacao.update({
        where: { id: a.id },
        data: { valor: a.valor, descricao: a.descricao, data: dataDoDia(a.data), categoriaId: a.categoriaId, contaId: a.contaId },
      });
      if (Boolean(atual.recorrencia?.ativa) !== a.repetia) await definirRepeticao(usuarioId, a.id, a.repetia);
    }
  },
  async criar_conta(usuarioId, { contaId }) {
    await prisma.conta.deleteMany({ where: { id: contaId, usuarioId } });
  },
  async renomear_conta(usuarioId, { contaId, nome }) {
    await prisma.conta.updateMany({ where: { id: contaId, usuarioId }, data: { nome } });
  },
  async criar_categoria(usuarioId, { categoriaId }) {
    await prisma.categoria.deleteMany({ where: { id: categoriaId, usuarioId } });
  },
  async definir_orcamento(usuarioId, { categoriaId, valorMensal }) {
    await EXECUTORES.definir_orcamento(usuarioId, { categoriaId, valorMensal });
  },
  async alterar_gasto_fixo(usuarioId, { recorrenciaId, ativa, valor, dia, proximaData }) {
    await prisma.recorrencia.updateMany({
      where: { id: recorrenciaId, usuarioId },
      data: { ativa, valor, dia, proximaData: dataDoDia(proximaData) },
    });
  },
  async marcar_assinatura(usuarioId, { chave, tipo }) {
    await aplicarMarcacao(usuarioId, chave, tipo);
  },
};

// O que o app mostra no cartão do chat
export function cartaoDaAcao(acao) {
  const desfazivel =
    acao.situacao === "FEITA" && acao.desfazer !== null && Date.now() - (acao.concluidaEm ?? acao.criadoEm).getTime() < PRAZO_DESFAZER_MS;
  return {
    id: acao.id,
    tipo: acao.tipo,
    situacao: acao.situacao,
    resumo: acao.resumo,
    detalhes: acao.detalhes,
    podeDesfazer: desfazivel,
  };
}

// Criar: executa na hora e guarda como desfazer
export async function executarAgora(usuarioId, tipo, { resumo, detalhes, dados }) {
  const { resultado, desfazer } = await EXECUTORES[tipo](usuarioId, dados);
  const acao = await prisma.acaoAssistente.create({
    data: { usuarioId, tipo, situacao: "FEITA", resumo, detalhes, dados, desfazer: desfazer ?? undefined, concluidaEm: new Date() },
  });
  return { acao, resultado };
}

// Editar e apagar: só registra a proposta
export function proporAcao(usuarioId, tipo, { resumo, detalhes, dados }) {
  return prisma.acaoAssistente.create({ data: { usuarioId, tipo, resumo, detalhes, dados } });
}

// Troca a situação só se ela ainda for a esperada: dois toques no botão não executam duas vezes
async function trocarSituacao(usuarioId, id, de, para) {
  const { count } = await prisma.acaoAssistente.updateMany({
    where: { id: Number(id) || 0, usuarioId, situacao: de },
    data: { situacao: para, concluidaEm: new Date() },
  });
  return count === 1;
}

async function acaoDoUsuario(usuarioId, id) {
  const acao = await prisma.acaoAssistente.findFirst({ where: { id: Number(id) || 0, usuarioId } });
  if (!acao) throw new ErroHttp(404, "Ação não encontrada");
  return acao;
}

export async function confirmarAcao(usuarioId, id) {
  const acao = await acaoDoUsuario(usuarioId, id);
  if (acao.situacao !== "PENDENTE") throw new ErroHttp(409, "Essa ação já foi resolvida");
  if (Date.now() - acao.criadoEm.getTime() > VALIDADE_PROPOSTA_MS) {
    await trocarSituacao(usuarioId, acao.id, "PENDENTE", "CANCELADA");
    throw new ErroHttp(410, "Essa proposta expirou. Peça de novo ao assistente.");
  }
  if (!(await trocarSituacao(usuarioId, acao.id, "PENDENTE", "FEITA"))) throw new ErroHttp(409, "Essa ação já foi resolvida");
  try {
    const { desfazer } = await EXECUTORES[acao.tipo](usuarioId, acao.dados);
    return prisma.acaoAssistente.update({ where: { id: acao.id }, data: { desfazer: desfazer ?? undefined } });
  } catch (erro) {
    // Não deu certo: volta a ficar pendente para o usuário ver o erro e tentar de novo ou cancelar
    await prisma.acaoAssistente.update({ where: { id: acao.id }, data: { situacao: "PENDENTE", concluidaEm: null } });
    throw erro;
  }
}

export async function cancelarAcao(usuarioId, id) {
  await acaoDoUsuario(usuarioId, id);
  if (!(await trocarSituacao(usuarioId, id, "PENDENTE", "CANCELADA"))) throw new ErroHttp(409, "Essa ação já foi resolvida");
  return acaoDoUsuario(usuarioId, id);
}

export async function desfazerAcao(usuarioId, id) {
  const acao = await acaoDoUsuario(usuarioId, id);
  if (!cartaoDaAcao(acao).podeDesfazer) throw new ErroHttp(409, "Essa ação não pode mais ser desfeita");
  if (!(await trocarSituacao(usuarioId, acao.id, "FEITA", "DESFEITA"))) throw new ErroHttp(409, "Essa ação já foi desfeita");
  try {
    await DESFAZEDORES[acao.tipo](usuarioId, acao.desfazer);
  } catch (erro) {
    await prisma.acaoAssistente.update({ where: { id: acao.id }, data: { situacao: "FEITA", concluidaEm: acao.concluidaEm } });
    throw erro;
  }
  return acaoDoUsuario(usuarioId, id);
}

// Confere que todos os lançamentos são do usuário, para a proposta já nascer válida
export async function lancamentosDoUsuario(usuarioId, ids) {
  const unicos = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unicos.length) throw new ErroHttp(400, "Nenhum lançamento informado");
  if (unicos.length > LIMITE_EM_LOTE) throw new ErroHttp(400, `No máximo ${LIMITE_EM_LOTE} lançamentos por vez`);
  const encontrados = await prisma.transacao.findMany({
    where: { id: { in: unicos }, usuarioId },
    include: { categoria: { select: { nome: true } }, conta: { select: { nome: true } } },
    orderBy: [{ data: "desc" }, { id: "desc" }],
  });
  const faltando = unicos.filter((id) => !encontrados.some((t) => t.id === id));
  if (faltando.length) throw new ErroHttp(404, `Lançamentos não encontrados: ${faltando.join(", ")}`);
  return encontrados;
}
