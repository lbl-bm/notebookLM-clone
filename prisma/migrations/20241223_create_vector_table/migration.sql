-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable: document_chunks (向量表)
-- 🔴 架构风险 8.1: 向量维度必须明确为 1024
CREATE TABLE IF NOT EXISTS "document_chunks" (
    "id" BIGSERIAL NOT NULL,
    "notebook_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "embedding" vector(1024) NOT NULL,
    "embedding_model" TEXT DEFAULT 'embedding-3',
    "embedding_dim" INTEGER DEFAULT 1024,
    "content_hash" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: HNSW 向量索引（推荐使用 cosine 距离）
CREATE INDEX IF NOT EXISTS "idx_embedding_hnsw" ON "document_chunks" 
USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex: 其他索引
CREATE INDEX IF NOT EXISTS "idx_chunks_notebook_id" ON "document_chunks"("notebook_id");
CREATE INDEX IF NOT EXISTS "idx_chunks_source_id" ON "document_chunks"("source_id");
CREATE INDEX IF NOT EXISTS "idx_chunks_content_hash" ON "document_chunks"("content_hash");

-- CreateFunction: 向量检索 RPC
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  p_notebook_id uuid,
  p_query_embedding vector(1024),
  p_match_count int DEFAULT 8,
  p_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.notebook_id = p_notebook_id
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;

-- Comment
COMMENT ON TABLE "document_chunks" IS '文档向量表 - 使用 SQL 迁移管理（不通过 Prisma）';
COMMENT ON FUNCTION "match_document_chunks" IS 'RAG 检索函数 - 返回最相关的 chunks';
