-- P1.4: 补充 source_id 索引
-- 优化按 source 过滤的向量检索场景（用户选择特定文档时）

CREATE INDEX IF NOT EXISTS idx_document_chunks_source_id
ON document_chunks (source_id);

COMMENT ON INDEX idx_document_chunks_source_id IS 'P1.4: source_id 过滤索引，优化选定文档检索场景';
