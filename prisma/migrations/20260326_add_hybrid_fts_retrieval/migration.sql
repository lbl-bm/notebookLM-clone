-- P1.1a: 修正并添加 hybrid_search RPC 函数
--
-- 注意：content_tsv 列已在 20260120050505 和 20260120120100 中建立
-- 且使用 'simple' 分词器（支持中英文混合）
-- 本迁移仅添加 hybrid_search RPC 函数，不重复创建列或索引

-- ✅ 使用 CTE 方案，避免临时表并发冲突
-- ✅ 使用 'simple' 分词器，与现有 content_tsv 列保持一致
CREATE OR REPLACE FUNCTION public.hybrid_search(
  p_notebook_id uuid,
  p_query_embedding vector(1024) DEFAULT NULL,
  p_query_text text DEFAULT NULL,
  p_dense_topk int DEFAULT 20,
  p_sparse_topk int DEFAULT 20,
  p_threshold float DEFAULT 0.3,
  p_final_topk int DEFAULT 10,
  p_k int DEFAULT 60
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
    SELECT
      dc.id,
      dc.source_id,
      dc.chunk_index,
      dc.content,
      dc.metadata,
      1 - (dc.embedding <=> p_query_embedding) AS vector_score,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> p_query_embedding) AS rank
    FROM document_chunks dc
    WHERE dc.notebook_id = p_notebook_id
      AND p_query_embedding IS NOT NULL
      AND (1 - (dc.embedding <=> p_query_embedding)) >= p_threshold
    ORDER BY dc.embedding <=> p_query_embedding
    LIMIT p_dense_topk
  ),
  sparse_results AS (
    SELECT
      dc.id,
      dc.source_id,
      dc.chunk_index,
      dc.content,
      dc.metadata,
      ts_rank(dc.content_tsv, plainto_tsquery('simple', p_query_text)) AS sparse_score,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(dc.content_tsv, plainto_tsquery('simple', p_query_text)) DESC
      ) AS rank
    FROM document_chunks dc
    WHERE dc.notebook_id = p_notebook_id
      AND p_query_text IS NOT NULL
      AND p_query_text != ''
      AND dc.content_tsv @@ plainto_tsquery('simple', p_query_text)
    ORDER BY ts_rank(dc.content_tsv, plainto_tsquery('simple', p_query_text)) DESC
    LIMIT p_sparse_topk
  ),
  rrf_scores AS (
    SELECT
      d.id, d.source_id, d.chunk_index, d.content, d.metadata,
      d.vector_score,
      NULL::float AS sparse_score,
      d.rank AS dense_rank,
      NULL::int AS sparse_rank,
      1.0 / (p_k + d.rank) AS rrf_score
    FROM dense_results d

    UNION ALL

    SELECT
      s.id, s.source_id, s.chunk_index, s.content, s.metadata,
      NULL::float AS vector_score,
      s.sparse_score,
      NULL::int AS dense_rank,
      s.rank AS sparse_rank,
      1.0 / (p_k + s.rank) AS rrf_score
    FROM sparse_results s
    WHERE NOT EXISTS (SELECT 1 FROM dense_results d WHERE d.id = s.id)
  ),
  deduped AS (
    SELECT
      id, source_id, chunk_index, content, metadata,
      MAX(vector_score) AS vector_score,
      MAX(sparse_score) AS sparse_score,
      MAX(dense_rank) AS dense_rank,
      MAX(sparse_rank) AS sparse_rank,
      SUM(rrf_score) AS combined_score
    FROM rrf_scores
    GROUP BY id, source_id, chunk_index, content, metadata
  )
  SELECT
    d.id, d.source_id, d.chunk_index, d.content, d.metadata,
    d.vector_score, d.sparse_score, d.combined_score,
    d.dense_rank, d.sparse_rank
  FROM deduped d
  ORDER BY d.combined_score DESC
  LIMIT p_final_topk;
$$;

COMMENT ON FUNCTION hybrid_search IS
'P1.1a: Dense (pgvector) + Sparse (tsvector simple) + RRF 融合检索
使用 simple 分词器以支持中英文混合内容。
参数: p_notebook_id, p_query_embedding (可选), p_query_text (可选),
      p_dense_topk, p_sparse_topk, p_threshold, p_final_topk, p_k(RRF)';
