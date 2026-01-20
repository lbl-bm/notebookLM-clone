-- 添加 TSV 列用于混合检索
ALTER TABLE "document_chunks" ADD COLUMN "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;

-- 创建 GIN 索引
CREATE INDEX "idx_content_tsv" ON "document_chunks" USING GIN ("content_tsv");

