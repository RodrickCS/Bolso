-- DropIndex
DROP INDEX "Documento_usuarioId_idx";

-- AlterTable
ALTER TABLE "Documento" ADD COLUMN     "hashConteudo" TEXT;

-- CreateIndex
CREATE INDEX "Documento_usuarioId_hashConteudo_idx" ON "Documento"("usuarioId", "hashConteudo");
