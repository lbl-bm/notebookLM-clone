# NotebookLM Clone - 开发上下文

## 项目概述

NotebookLM Clone：AI 知识库管理工具。用户上传文档 (PDF/URL/文本)，基于 RAG 进行多文档对话。

**技术栈**: Next.js + Supabase (Postgres + pgvector) + Prisma + Tailwind

---

## 当前进度

### ✅ P1.1a 混合检索 - 已完成，可部署

Dense (pgvector) + Sparse (tsvector) + RRF 融合检索，预期 P@5 从 65% 提升到 ~78%。

**部署只需一步**:
```bash
npm run db:push   # 执行 migration.sql，添加 content_tsv 列 + GIN 索引 + hybrid_search() 函数
```

**主要文件**:
- `lib/rag/hybrid-retrieval.ts` — 混合检索入口，使用 `hybridSearch()` 替换现有单路检索
- `lib/config/feature-flags.ts` — 特性开关，当前设置 100% 用户启用
- `prisma/migrations/20260326_add_hybrid_fts_retrieval/migration.sql` — DB 迁移

**集成方式** (在 Chat API 里替换检索调用):
```typescript
import { hybridSearch } from '@/lib/rag/hybrid-retrieval';

// 替换原有的 match_document_chunks 调用
const result = await hybridSearch(notebookId, queryText, queryEmbedding, { topK: 10 });
const chunks = result.results; // 兼容原有 chunk 结构
```

---

## 后续开发任务

### P1.2 — 置信度评分 + 拒答机制 (2-3d)

目标：幻觉率从 ~20% 降到 ~10%，低置信时拒答。

**需新建**: `lib/rag/confidence.ts`

评分维度：
- `relevance_score` — 最高向量相似度
- `coverage_score` — topK chunks 的平均相似度
- `consistency_score` — chunks 间内容一致性
- `source_diversity_score` — 来源文档数量

决策逻辑：
```
≥ 0.8 → 正常回答
0.6-0.8 → 保守回答 ("根据现有资料...")
< 0.6 → 拒答 ("当前文档中没有足够信息")
```

集成点：`app/api/chat/route.ts` 返回 `confidenceScore`，前端在引用旁展示。

---

### P1.3 — Embedding 缓存 (2-3d)

目标：减少重复 embedding API 调用，降低成本 40-50%。

**需新建**: `lib/cache/embedding-cache.ts`

- Query embedding: 内存缓存，TTL 24h，Key = SHA256(queryText)
- Document embedding: 已存 Postgres，无需重复调用

注意：先确认 `lib/processing/embedding.ts` 现在是否已有缓存逻辑。

---

### P1.4 — 数据库优化 (1-2d)

1. **PgBouncer 连接池**: 在 `.env.local` 的 `DATABASE_URL` 加 `?pgbouncer=true`
2. **HNSW 索引**: 替换现有 IVFFlat，提升向量检索速度
   ```sql
   CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```
3. **补充索引**:
   ```sql
   CREATE INDEX idx_document_chunks_source_id ON document_chunks(source_id);
   CREATE INDEX idx_messages_notebook_id ON messages(notebook_id);
   ```

---

### P2 — RLS 安全加固 (当有多用户需求时)

目前应用层通过 `ownerId` 做访问控制，足以支持单用户 MVP。

需要 RLS 的前提：支持 Notebook 分享给其他用户。届时参考：
```sql
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON notebooks FOR ALL
  USING (auth.uid() = owner_id);
-- 同样应用到 sources, messages, artifacts, document_chunks
```

---

## 已知问题 / 注意事项

- `lib/rag/hybrid-retrieval.ts` 中的 `EMBEDDING_DIM` 从 `@/lib/config` 导入，确认该值与实际模型维度 (1024) 一致
- `match_document_chunks` RPC 函数（旧有单路检索）不要删，作为降级备选
- `lib/rag/fusion.ts` 是早期存在的 fusion 实现，与 P1.1a 有重叠，后续可合并清理
- `IMPLEMENTATION.md` 描述了自适应 Chunk 切分（自适应策略：高密度 400 tokens，中等 800，低密度 1200），这个功能**已实现但未记录在此**，后续优化 chunking 时参考

---

## 项目架构快速参考

```
app/
  api/
    chat/route.ts         ← RAG 对话主入口
    notebooks/            ← Notebook CRUD
    sources/              ← 文档上传处理
lib/
  rag/
    retriever.ts          ← 现有检索逻辑（待集成 hybrid-retrieval）
    hybrid-retrieval.ts   ← P1.1a 新增：混合检索
    confidence.ts         ← P1.2 待新建：置信度评分
    fusion.ts             ← 早期 RRF 实现，可参考
    prompt.ts             ← LLM prompt 模板
  config/
    feature-flags.ts      ← 特性开关
  db/
    prisma.ts             ← Prisma client
  processing/
    embedding.ts          ← Embedding 生成
prisma/
  schema.prisma           ← 数据模型
  migrations/             ← DB 迁移文件
```
