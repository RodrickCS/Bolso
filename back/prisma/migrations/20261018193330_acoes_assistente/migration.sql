-- CreateEnum
CREATE TYPE "SituacaoAcao" AS ENUM ('PENDENTE', 'FEITA', 'CANCELADA', 'DESFEITA');

-- CreateTable
CREATE TABLE "AcaoAssistente" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "situacao" "SituacaoAcao" NOT NULL DEFAULT 'PENDENTE',
    "resumo" TEXT NOT NULL,
    "detalhes" JSONB NOT NULL,
    "dados" JSONB NOT NULL,
    "desfazer" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "AcaoAssistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcaoAssistente_usuarioId_criadoEm_idx" ON "AcaoAssistente"("usuarioId", "criadoEm");

-- AddForeignKey
ALTER TABLE "AcaoAssistente" ADD CONSTRAINT "AcaoAssistente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
