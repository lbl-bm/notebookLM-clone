/*
  Warnings:

  - You are about to drop the `document_chunks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
-- DROP TABLE "document_chunks";


-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storagePath" TEXT,
    "url" TEXT,
    "meta" JSONB,
    "processingLog" JSONB,
    "lastProcessedChunkIndex" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "answerMode" TEXT,
    "metadata" JSONB,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT,
    "input" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "notebookId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT NOT NULL,
    "variables" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_queue" (
    "id" BIGSERIAL NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "processing_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notebooks_ownerId_idx" ON "notebooks"("ownerId");

-- CreateIndex
CREATE INDEX "notebooks_lastOpenedAt_idx" ON "notebooks"("lastOpenedAt");

-- CreateIndex
CREATE INDEX "sources_notebookId_idx" ON "sources"("notebookId");

-- CreateIndex
CREATE INDEX "sources_status_idx" ON "sources"("status");

-- CreateIndex
CREATE INDEX "messages_notebookId_idx" ON "messages"("notebookId");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "artifacts_notebookId_idx" ON "artifacts"("notebookId");

-- CreateIndex
CREATE INDEX "artifacts_createdAt_idx" ON "artifacts"("createdAt");

-- CreateIndex
CREATE INDEX "prompt_templates_ownerId_idx" ON "prompt_templates"("ownerId");

-- CreateIndex
CREATE INDEX "prompt_templates_notebookId_idx" ON "prompt_templates"("notebookId");

-- CreateIndex
CREATE INDEX "prompt_templates_isSystem_idx" ON "prompt_templates"("isSystem");

-- CreateIndex
CREATE INDEX "processing_queue_status_priority_createdAt_idx" ON "processing_queue"("status", "priority", "createdAt");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
