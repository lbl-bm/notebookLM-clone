-- ✅ P1-3: 修复全文搜索语言配置
-- 重建 content_tsv 列使用 'simple' 分词器以支持多语言（特别是中文）

-- 步骤 1: 删除旧的 GENERATED 列和索引
DROP INDEX IF EXISTS idx_content_tsv;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS content_tsv;

-- 步骤 2: 重新创建使用 simple 分词器的列
-- simple 分词器支持所有语言（包括 CJK 字符），虽然没有语义分析但能保证基本可用
ALTER TABLE document_chunks 
ADD COLUMN content_tsv tsvector 
GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

-- 步骤 3: 重建 GIN 索引
CREATE INDEX idx_content_tsv ON document_chunks USING GIN (content_tsv);

-- Comment
COMMENT ON COLUMN document_chunks.content_tsv IS 'P1-3: 全文搜索向量，使用 simple 分词器支持多语言（中英文混合）';
