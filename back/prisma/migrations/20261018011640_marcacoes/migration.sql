-- CreateTable
CREATE TABLE "Marcacao" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Marcacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Marcacao_usuarioId_chave_key" ON "Marcacao"("usuarioId", "chave");

-- AddForeignKey
ALTER TABLE "Marcacao" ADD CONSTRAINT "Marcacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
