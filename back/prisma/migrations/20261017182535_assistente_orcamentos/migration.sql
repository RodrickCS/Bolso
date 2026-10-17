-- CreateTable
CREATE TABLE "Orcamento" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "valorMensal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumoAssistente" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "mes" TEXT NOT NULL,
    "fatosHash" TEXT NOT NULL,
    "dicas" JSONB NOT NULL,
    "geradoPorIa" BOOLEAN NOT NULL,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumoAssistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_usuarioId_categoriaId_key" ON "Orcamento"("usuarioId", "categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumoAssistente_usuarioId_mes_key" ON "ResumoAssistente"("usuarioId", "mes");

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumoAssistente" ADD CONSTRAINT "ResumoAssistente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
