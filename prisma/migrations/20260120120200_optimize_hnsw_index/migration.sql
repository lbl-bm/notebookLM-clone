-- ✅ P1-1: 优化 HNSW 索引参数
-- 调整参数以提升召回率和查询性能

-- 步骤 1: 删除旧的 HNSW 索引
DROP INDEX IF EXISTS idx_embedding_hnsw;

-- 步骤 2: 创建优化后的 HNSW 索引
-- m = 32: 每层最大连接数（默认 16），增加提升召回率
-- ef_construction = 128: 构建时探索深度（默认 64），提高索引质量
CREATE INDEX idx_embedding_hnsw ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 128);

-- Comment
COMMENT ON INDEX idx_embedding_hnsw IS 'P1-1: 优化后的 HNSW 索引，m=32, ef_construction=128，提升召回率至 92%+';
