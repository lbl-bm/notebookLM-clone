-- ✅ P0-4: 添加唯一性约束防止数据重复
-- 确保同一 Source 的 chunk_index 不重复

-- 步骤 1: 清理现有重复数据
-- 保留每组 (source_id, chunk_index) 中 id 最小的记录
DELETE FROM document_chunks
WHERE id NOT IN (
  SELECT MIN(id)
  FROM document_chunks
  GROUP BY source_id, chunk_index
);

-- 步骤 2: 添加唯一索引
-- 这将防止未来插入重复的 (source_id, chunk_index) 组合
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_chunk_unique
ON document_chunks (source_id, chunk_index);

-- 步骤 3: 验证约束（注释掉的测试代码）
-- 以下代码用于测试约束是否生效，实际运行时保持注释状态
-- INSERT INTO document_chunks (notebook_id, source_id, chunk_index, content, content_hash, metadata, embedding, embedding_model, embedding_dim)
-- VALUES ('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 0, 'test', 'test_hash', '{}'::jsonb, '[0]'::vector, 'test', 1024);
-- 重复执行上面的语句应该失败（ON CONFLICT 生效）

-- Comment
COMMENT ON INDEX idx_source_chunk_unique IS 'P0-4: 确保 (source_id, chunk_index) 组合唯一，防止重复数据';
