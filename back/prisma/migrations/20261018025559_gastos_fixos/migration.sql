-- AlterEnum
ALTER TYPE "OrigemTransacao" ADD VALUE 'RECORRENTE';

-- AlterTable
ALTER TABLE "Transacao" ADD COLUMN     "recorrenciaId" INTEGER;

-- CreateTable
CREATE TABLE "Recorrencia" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "estabelecimento" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "dia" INTEGER NOT NULL,
    "proximaData" DATE NOT NULL,
    "categoriaId" INTEGER,
    "contaId" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadaPorIa" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recorrencia_ativa_proximaData_idx" ON "Recorrencia"("ativa", "proximaData");

-- CreateIndex
CREATE INDEX "Recorrencia_usuarioId_idx" ON "Recorrencia"("usuarioId");

-- AddForeignKey
ALTER TABLE "Transacao" ADD CONSTRAINT "Transacao_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "Recorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recorrencia" ADD CONSTRAINT "Recorrencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
