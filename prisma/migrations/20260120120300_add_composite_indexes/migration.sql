-- ✅ P1-2: 添加复合索引优化过滤查询
-- ✅ P1-4: 添加时间索引支持时间范围查询

-- P1-2: notebook_id 作为前导列的复合索引
-- 优化按 Notebook 过滤的向量检索场景
CREATE INDEX IF NOT EXISTS idx_notebook_embedding 
ON document_chunks (notebook_id);

-- 说明：由于 pgvector HNSW 索引不支持多列复合，这里使用单列索引
-- 查询优化器会组合使用 idx_notebook_embedding 和 idx_embedding_hnsw

-- P1-4: 时间索引（降序）
-- 支持按时间范围查询、数据清理、统计分析
CREATE INDEX IF NOT EXISTS idx_chunks_created_at 
ON document_chunks (created_at DESC);

-- Comment
COMMENT ON INDEX idx_notebook_embedding IS 'P1-2: Notebook 过滤索引，优化多租户场景查询性能';
COMMENT ON INDEX idx_chunks_created_at IS 'P1-4: 时间范围索引，支持数据清理和统计查询';
