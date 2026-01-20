-- 混合检索迁移：添加全文检索索引
-- 对应 PROJECT_SPEC.md 第 8.7 节
-- 重要：使用 simple 分词器以支持中文

-- ============================================
-- 1. 添加 content_tsv 全文检索列（如果不存在）
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'document_chunks' AND column_name = 'content_tsv') THEN
    ALTER TABLE document_chunks ADD COLUMN content_tsv tsvector;
  END IF;
END $$;

-- ============================================
-- 2. 创建更新 content_tsv 的触发器函数
-- 使用 simple 分词器，支持中文按字符分词
-- ============================================
CREATE OR REPLACE FUNCTION update_document_chunks_content_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. 为已存在的行填充 content_tsv（如果为空）
-- ============================================
UPDATE document_chunks
SET content_tsv = to_tsvector('simple', content)
WHERE content_tsv IS NULL;

-- ============================================
-- 4. 创建触发器（如果不存在则删除重建）
-- ============================================
DROP TRIGGER IF EXISTS trigger_update_document_chunks_tsv ON document_chunks;
CREATE TRIGGER trigger_update_document_chunks_tsv
  BEFORE INSERT OR UPDATE OF content
  ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_document_chunks_content_tsv();

-- ============================================
-- 5. 创建 GIN 全文检索索引（如果不存在则删除重建）
-- ============================================
DROP INDEX IF EXISTS idx_document_chunks_content_fts;
CREATE INDEX idx_document_chunks_content_fts
  ON document_chunks USING GIN(content_tsv);

-- ============================================
-- 6. 为现有数据重建索引
-- ============================================
REINDEX INDEX idx_document_chunks_content_fts;

-- ============================================
-- 7. 注释
-- ============================================
COMMENT ON COLUMN document_chunks.content_tsv IS '全文检索 tsvector 列 - 使用 simple 分词器支持中文';

-- ============================================
-- 8. 添加混合检索 RPC 函数
-- ============================================
DROP FUNCTION IF EXISTS public.hybrid_search_chunks(
  p_notebook_id uuid,
  p_query_embedding vector(1024),
  p_query_text text,
  p_match_count int,
  p_vector_weight float,
  p_fts_weight float,
  p_threshold float
);

CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  p_notebook_id uuid,
  p_query_embedding vector(1024),
  p_query_text text,
  p_match_count int DEFAULT 8,
  p_vector_weight float DEFAULT 0.7,
  p_fts_weight float DEFAULT 0.3,
  p_threshold float DEFAULT 0.1
)
RETURNS TABLE (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float,
  vector_score float,
  fts_score float,
  combined_score float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.metadata,
    GREATEST(
      1 - (c.embedding <=> p_query_embedding),
      COALESCE(ts_rank(c.content_tsv, plainto_tsquery('simple', p_query_text)) / 10.0, 0)
    ) AS similarity,
    1 - (c.embedding <=> p_query_embedding) AS vector_score,
    COALESCE(ts_rank(c.content_tsv, plainto_tsquery('simple', p_query_text)), 0) AS fts_score,
    (
      (1 - (c.embedding <=> p_query_embedding)) * p_vector_weight +
      COALESCE(ts_rank(c.content_tsv, plainto_tsquery('simple', p_query_text)), 0) * p_fts_weight
    ) AS combined_score
  FROM document_chunks c
  WHERE c.notebook_id = p_notebook_id
    AND (
      1 - (c.embedding <=> p_query_embedding) > p_threshold
      OR c.content_tsv @@ plainto_tsquery('simple', p_query_text)
    )
  ORDER BY combined_score DESC
  LIMIT p_match_count;
$$;

COMMENT ON FUNCTION public.hybrid_search_chunks IS '混合检索函数 - 结合向量相似度和中文全文检索（simple 分词器）';
