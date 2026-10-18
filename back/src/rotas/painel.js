import { Router } from "express";
import { z } from "zod";
import { assincrono, validar } from "../lib/erros.js";
import { intervaloDoMes, parametroMes } from "../lib/meses.js";
import { prisma } from "../lib/prisma.js";
import { gerarLancamentosFixos } from "../servicos/recorrencias.js";

export const rotasPainel = Router();

const filtro = z.object({ mes: parametroMes });

// Resumo do mês. Transações conciliadas (cópias de um gasto que já veio da fatura) não entram na soma.
rotasPainel.get(
  "/painel",
  assincrono(async (req, res) => {
    const { mes } = validar(filtro, req.query);
    const { inicio, fim } = intervaloDoMes(mes);
    // O painel é a primeira tela: gera os gastos fixos que venceram enquanto o servidor dormia
    await gerarLancamentosFixos(req.usuarioId);
    const where = { usuarioId: req.usuarioId, data: { gte: inicio, lt: fim }, conciliadaComId: null };

    // Últimos 6 meses (até o mês escolhido), para o gráfico e a comparação com o mês anterior
    const inicioHistorico = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() - 5, 1));
    const [grupos, categorias, gruposConta, contas, porMes] = await Promise.all([
      prisma.transacao.groupBy({ by: ["tipo", "categoriaId"], where, _sum: { valor: true }, _count: true }),
      prisma.categoria.findMany({ where: { usuarioId: req.usuarioId } }),
      prisma.transacao.groupBy({ by: ["contaId"], where: { ...where, tipo: "DESPESA", contaId: { not: null } }, _sum: { valor: true } }),
      prisma.conta.findMany({ where: { usuarioId: req.usuarioId } }),
      prisma.$queryRaw`
        SELECT to_char(data, 'YYYY-MM') AS mes, tipo::text AS tipo, SUM(valor)::float AS total
        FROM "Transacao"
        WHERE "usuarioId" = ${req.usuarioId} AND "conciliadaComId" IS NULL
          AND data >= ${inicioHistorico} AND data < ${fim}
        GROUP BY 1, 2`,
    ]);
    const historico = Array.from({ length: 6 }, (_, i) => {
      const data = new Date(Date.UTC(inicioHistorico.getUTCFullYear(), inicioHistorico.getUTCMonth() + i, 1));
      const chave = data.toISOString().slice(0, 7);
      const valor = (tipo) => Math.round((porMes.find((l) => l.mes === chave && l.tipo === tipo)?.total ?? 0) * 100) / 100;
      return { mes: chave, despesas: valor("DESPESA"), receitas: valor("RECEITA") };
    });
    const nomePorId = new Map(categorias.map((c) => [c.id, c.nome]));

    const total = (tipo) =>
      grupos.filter((g) => g.tipo === tipo).reduce((soma, g) => soma + Number(g._sum.valor), 0);
    const despesas = total("DESPESA");
    const receitas = total("RECEITA");

    const porCategoria = grupos
      .filter((g) => g.tipo === "DESPESA")
      .map((g) => ({
        categoriaId: g.categoriaId,
        categoria: nomePorId.get(g.categoriaId) ?? "Sem categoria",
        total: Number(g._sum.valor),
        quantidade: g._count,
        percentual: despesas ? Math.round((Number(g._sum.valor) / despesas) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Gastos do mês por conta/cartão (num cartão de crédito, é o que vai pesar na fatura)
    const contaPorId = new Map(contas.map((c) => [c.id, c]));
    const porConta = gruposConta
      .filter((g) => contaPorId.has(g.contaId))
      .map((g) => ({
        contaId: g.contaId,
        conta: contaPorId.get(g.contaId).nome,
        tipo: contaPorId.get(g.contaId).tipo,
        total: Number(g._sum.valor),
      }))
      .sort((a, b) => b.total - a.total);

    res.json({
      mes,
      despesas: Math.round(despesas * 100) / 100,
      receitas: Math.round(receitas * 100) / 100,
      saldo: Math.round((receitas - despesas) * 100) / 100,
      porCategoria,
      porConta,
      historico,
    });
  }),
);

// Quanto dos créditos da API do Claude já foi usado
rotasPainel.get(
  "/uso-ia",
  assincrono(async (req, res) => {
    const { mes } = validar(filtro, req.query);
    const { inicio, fim } = intervaloDoMes(mes);
    const grupos = await prisma.usoIa.groupBy({
      by: ["tarefa"],
      where: { usuarioId: req.usuarioId, criadoEm: { gte: inicio, lt: fim } },
      _sum: { custoUsd: true, tokensEntrada: true, tokensSaida: true },
      _count: true,
    });
    const porTarefa = grupos.map((g) => ({
      tarefa: g.tarefa,
      chamadas: g._count,
      tokensEntrada: g._sum.tokensEntrada,
      tokensSaida: g._sum.tokensSaida,
      custoUsd: Number(g._sum.custoUsd),
    }));
    res.json({
      mes,
      custoUsd: Math.round(porTarefa.reduce((soma, t) => soma + t.custoUsd, 0) * 10000) / 10000,
      porTarefa,
    });
  }),
);
