-- P1.1a: 改进 tsvector 全文检索支持
-- 目标: 为 document_chunks 表添加全文搜索能力
-- 步骤:
-- 1. 添加 content_tsv 列（存储式 tsvector，自动更新）
-- 2. 创建 GIN 索引用于快速全文检索
-- 3. 创建 RPC 函数支持混合检索

-- ============================================
-- Step 1: 添加 content_tsv 列（如果不存在）
-- ============================================

ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (
  to_tsvector('english', content)
) STORED;

-- ============================================
-- Step 2: 创建 GIN 索引加速全文检索
-- ============================================

-- ✅ GIN 索引用于 content_tsv
-- 注：tsvector_ops 是 GIN 对 tsvector 的默认操作符类，无需显式指定
CREATE INDEX IF NOT EXISTS idx_content_tsv_gin
ON document_chunks USING gin (content_tsv);

-- ============================================
-- Step 3: 创建混合检索 RPC 函数
-- ============================================

-- 完整的混合检索函数: Dense + Sparse + RRF 融合
-- ✅ 使用 CTE 而不是临时表，完全避免并发冲突问题
CREATE OR REPLACE FUNCTION public.hybrid_search(
  p_notebook_id uuid,
  p_query_embedding vector(1024) DEFAULT NULL,
  p_query_text text DEFAULT NULL,
  p_dense_topk int DEFAULT 20,
  p_sparse_topk int DEFAULT 20,
  p_threshold float DEFAULT 0.3,
  p_final_topk int DEFAULT 10,
  p_k int DEFAULT 60  -- RRF 参数
)
RETURNS TABLE (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  vector_score float,
  sparse_score float,
  combined_score float,
  dense_rank int,
  sparse_rank int
)
LANGUAGE sql STABLE
AS $$
  WITH dense_results AS (
    -- Dense 检索: 向量相似度
    SELECT
      dc.id,
      dc.source_id,
      dc.chunk_index,
      dc.content,
      dc.metadata,
      1 - (dc.embedding <=> p_query_embedding) as vector_score,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> p_query_embedding) as rank
    FROM document_chunks dc
    WHERE dc.notebook_id = p_notebook_id
      AND p_query_embedding IS NOT NULL
      AND (1 - (dc.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY dc.embedding <=> p_query_embedding
    LIMIT p_dense_topk
  ),
  sparse_results AS (
    -- Sparse 检索: 全文搜索
    SELECT
      dc.id,
      dc.source_id,
      dc.chunk_index,
      dc.content,
      dc.metadata,
      ts_rank(dc.content_tsv, plainto_tsquery('english', p_query_text)) as sparse_score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(dc.content_tsv, plainto_tsquery('english', p_query_text)) DESC
      ) as rank
    FROM document_chunks dc
    WHERE dc.notebook_id = p_notebook_id
      AND p_query_text IS NOT NULL
      AND p_query_text != ''
      AND dc.content_tsv @@ plainto_tsquery('english', p_query_text)
    ORDER BY ts_rank(dc.content_tsv, plainto_tsquery('english', p_query_text)) DESC
    LIMIT p_sparse_topk
  ),
  rrf_scores AS (
    -- Dense 路由的 RRF 分数
    SELECT
      d.id,
      d.source_id,
      d.chunk_index,
      d.content,
      d.metadata,
      d.vector_score,
      NULL::float as sparse_score,
      d.rank as dense_rank,
      NULL::int as sparse_rank,
      1.0 / (p_k + d.rank) as rrf_score
    FROM dense_results d

    UNION ALL

    -- Sparse 路由的 RRF 分数 (避免与 Dense 重复)
    SELECT
      s.id,
      s.source_id,
      s.chunk_index,
      s.content,
      s.metadata,
      NULL::float as vector_score,
      s.sparse_score,
      NULL::int as dense_rank,
      s.rank as sparse_rank,
      1.0 / (p_k + s.rank) as rrf_score
    FROM sparse_results s
    WHERE NOT EXISTS (SELECT 1 FROM dense_results d WHERE d.id = s.id)
  ),
  deduped AS (
    -- 按 id 聚合，处理既在 Dense 又在 Sparse 的结果
    SELECT
      id,
      source_id,
      chunk_index,
      content,
      metadata,
      MAX(vector_score) as vector_score,
      MAX(sparse_score) as sparse_score,
      MAX(dense_rank) as dense_rank,
      MAX(sparse_rank) as sparse_rank,
      SUM(rrf_score) as combined_score
    FROM rrf_scores
    GROUP BY id, source_id, chunk_index, content, metadata
  )
  SELECT
    d.id,
    d.source_id,
    d.chunk_index,
    d.content,
    d.metadata,
    d.vector_score,
    d.sparse_score,
    d.combined_score,
    d.dense_rank,
    d.sparse_rank
  FROM deduped d
  ORDER BY d.combined_score DESC
  LIMIT p_final_topk;
$$;

-- ============================================
-- Step 4: 创建专用的 Sparse Only 函数 (备用)
-- ============================================

CREATE OR REPLACE FUNCTION public.sparse_search_only(
  p_notebook_id uuid,
  p_query_text text,
  p_topk int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  ts_rank float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.source_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    ts_rank(dc.content_tsv, plainto_tsquery('english', p_query_text)) as ts_rank
  FROM document_chunks dc
  WHERE dc.notebook_id = p_notebook_id
    AND dc.content_tsv @@ plainto_tsquery('english', p_query_text)
  ORDER BY ts_rank DESC
  LIMIT p_topk;
$$;

-- ============================================
-- Step 5: 添加注释文档
-- ============================================

COMMENT ON FUNCTION hybrid_search IS
'混合检索函数: Dense (向量) + Sparse (全文) + RRF 融合
参数:
  - p_notebook_id: 笔记本 ID
  - p_query_embedding: 查询向量 (可选，用于 Dense 路由)
  - p_query_text: 查询文本 (可选，用于 Sparse 路由)
  - p_dense_topk: Dense 检索返回数 (默认 20)
  - p_sparse_topk: Sparse 检索返回数 (默认 20)
  - p_threshold: 向量相似度阈值 (默认 0.3)
  - p_final_topk: 最终返回数 (默认 10)
  - p_k: RRF 参数 (默认 60)
返回值: 融合后的检索结果，按 RRF 分数排序
';

COMMENT ON COLUMN document_chunks.content_tsv IS
'全文搜索向量 - 自动从 content 列生成，用于快速全文检索';

-- ============================================
-- Step 6: 性能优化建议
-- ============================================

-- 可选: 分析表以获得最优查询计划
-- ANALYZE document_chunks;

-- 可选: 设置 work_mem 以提高排序性能 (在 session 中执行)
-- SET work_mem TO '256MB';

-- ============================================
-- 验证脚本
-- ============================================

-- 验证 content_tsv 列
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'document_chunks' AND column_name = 'content_tsv';

-- 验证 GIN 索引
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'document_chunks' AND indexname LIKE '%tsv%';

-- 验证函数
-- SELECT proname FROM pg_proc WHERE proname IN ('hybrid_search', 'sparse_search_only');
