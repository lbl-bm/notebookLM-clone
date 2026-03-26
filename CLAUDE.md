# NotebookLM Clone - 开发上下文

## 项目概述

NotebookLM Clone：AI 知识库管理工具。用户上传文档 (PDF/URL/文本)，基于 RAG 进行多文档对话。

**技术栈**: Next.js + Supabase (Postgres + pgvector) + Prisma + Tailwind

---

## 当前进度

### ✅ P1.1 混合检索 — 已完成

`lib/db/vector-store.ts` 的 `hybridSearch()` 用 CTE 内联实现 Dense + Sparse 融合，`lib/rag/retriever.ts` 的 `hybridRetrieveChunks()` 完整调用并含 M2 增强（动态 topK、查询改写、MMR 重排）。`RAG_CONFIG.useHybridSearch = true` 默认开启。

**分词器**：`'simple'`（支持中英文混合）。所有全文搜索均用 `plainto_tsquery('simple', ...)` 查询，`content_tsv` 列也是 `simple` 生成。

**`lib/rag/hybrid-retrieval.ts`** 是我们新写的独立模块（RRF 方案），与现有的 vector-store inline 方案并行存在。两者逻辑相似，可后续合并或按需选择。

### ✅ P1.2 置信度评分 — 已完成

`lib/rag/retriever.ts` 中的 `calculateConfidence()` + `determineRetrievalDecision()` 已实现多维度置信度和拒答判定，Chat API 已集成。

### ✅ P1.3 Embedding 缓存 — 已完成

`lib/cache/embedding-cache.ts`：内存 LRU 缓存，500 条上限，TTL 24h，Key = SHA-256(text)，Float32Array 存储节省内存。已接入 `lib/ai/zhipu.ts` 的 `getEmbedding()`。

### ✅ P1.4 数据库优化 — 已完成

- HNSW 索引：`m=32, ef_construction=128`（`20260120120200` 迁移）
- PgBouncer：`lib/db/prisma.ts` 已配置 `pool max=1`，确保 `.env.local` 的 `DATABASE_URL` 指向 Supabase Transaction Pooler（端口 6543）
- 补充索引：`source_id`（`20260326_add_source_id_index` 迁移）

---

## 待执行：数据库迁移

以下迁移需在 Supabase 执行（直接跑 SQL，或 `npm run db:push`）：

```bash
# 1. hybrid_search RPC 函数（CTE 方案，simple 分词器）
prisma/migrations/20260326_add_hybrid_fts_retrieval/migration.sql

# 2. source_id 索引
prisma/migrations/20260326_add_source_id_index/migration.sql
```

---

## 后续开发任务

### P2 — RLS 安全加固（当有多用户需求时）

目前应用层通过 `ownerId` 做访问控制，足以支持单用户 MVP。

需要 RLS 的前提：支持 Notebook 分享给其他用户。届时：
```sql
ALTER TABLE notebooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_only" ON notebooks FOR ALL
  USING (auth.uid() = owner_id);
-- 同样应用到 sources, messages, artifacts, document_chunks
```

---

## 已知问题 / 注意事项

- `lib/rag/hybrid-retrieval.ts`（新 RRF 模块）与 `lib/db/vector-store.ts` 中的 inline hybrid 方案并存，两者功能重叠，后续可考虑合并
- `lib/rag/fusion.ts` 是早期的 RRF 实现，已被 retriever.ts 的 M2 管线使用，不要删
- `IMPLEMENTATION.md` 描述了自适应 Chunk 切分（高密度 400 tokens，中等 800，低密度 1200），优化 chunking 时参考
- Embedding 缓存仅覆盖查询阶段（`getEmbedding`），文档入库的 embedding 在 `lib/processing/embedding.ts` 里走单独的批处理逻辑，不经过缓存（因为文档 embedding 已存 DB，不会重复调用）

---

## 项目架构快速参考

```
app/
  api/
    chat/route.ts              ← RAG 对话主入口
    notebooks/                 ← Notebook CRUD
    sources/                   ← 文档上传处理
lib/
  ai/
    zhipu.ts                   ← Embedding + Chat API（含缓存）
  cache/
    embedding-cache.ts         ← P1.3 Query embedding 缓存
  rag/
    retriever.ts               ← 主检索逻辑（M1/M2 管线）
    hybrid-retrieval.ts        ← 独立 RRF 混合检索模块
    fusion.ts                  ← M2 多路融合
    confidence.ts              ← (不存在，逻辑在 retriever.ts)
    prompt.ts                  ← Prompt 模板
    query-rewriter.ts          ← M2 查询改写
    reranker.ts                ← M2 阶段二重排
  config/
    feature-flags.ts           ← 特性开关
  db/
    prisma.ts                  ← Prisma client（PgBouncer 配置）
    vector-store.ts            ← 向量检索（inline hybrid search）
  processing/
    embedding.ts               ← 文档入库 Embedding 批处理
prisma/
  schema.prisma                ← 数据模型
  migrations/                  ← DB 迁移文件
```
