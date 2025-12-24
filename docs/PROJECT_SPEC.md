# NotebookLM-like 知识库产品（一期 MVP）可执行规格说明

> 本文档面向“两个前端（全栈）并行开发”的落地执行：明确 **最终希望实现的效果**、**技术栈与版本**、**一期必须交付的核心能力**、**与竞品差异化亮点**，并给出 **数据模型 / API 契约 / 关键工程约束**，确保可以直接开工。

## 1. 项目背景与目标

### 1.1 背景

在探索 AI Agent / Workflow 与前端工程集成的过程中，我们选择“个人/团队知识库”作为可演示且可深度交互的数据源与应用场景，目标是构建一个可运行、可展示、可扩展的 AI 应用原型。

### 1.2 产品目标（What to build）

- **Notebook（对话空间）**：用户围绕一组选定资料创建专属对话空间，所有回答必须基于知识库。
- **知识源导入**：支持上传与链接导入；导入后自动解析、切分、向量化。
- **RAG 问答 + 引文高亮**：答案必须返回可追溯引用（段落/页码/时间戳），并在 UI 中高亮展示。
- **多模态导出（一期做“雏形”）**：将 Notebook / 知识库输出成至少 2 种结构化产物（如“大纲 / 测验”）。
- **Agent/Workflow（一期做“可扩展底座 + 预设动作”）**：先用“预设动作按钮 + Prompt 模板库”跑通，后续可平滑演进到可视化 Workflow 编排。

### 1.3 一期非目标（What NOT to build）

- 多人实时协作编辑与共享权限体系（放二期）
- 完整的可视化 Workflow 编辑器（一期仅做“可配置/可插拔”的动作编排底座）
- 全量多模态（视频全流程/图片理解）一次性做完（一期先保证 PDF/网页链路最稳）

## 2. 一期 MVP：最终希望实现的效果（用户可见）

### 2.1 首页 / Notebook 列表（对应你给的“第一张图”）

- **精选笔记本**（可选）：展示置顶/推荐的 Notebook 卡片。
- **最近打开**：显示最近访问的 Notebook。
- **新建 Notebook**：创建后进入 Notebook 详情页。

**验收标准**
- 支持创建/删除/重命名 Notebook
- 最近打开按时间排序

### 2.2 Notebook 详情页三栏布局（对应你给的“第二、三张图”）

- **左栏 Sources（知识源）**
  - 列表：已导入/可选择的素材（文件/网页）
  - 导入入口：上传文件、粘贴链接、（一期可选）AI 搜索
  - 素材选择：支持“导入到本 Notebook”的勾选/全选
- **中栏 Chat（对话）**
  - 流式对话（SSE/ReadableStream）
  - 提示：进入 Notebook 自动生成 3-5 个建议问题
  - 输出渲染：Markdown、代码高亮、Mermaid（至少支持渲染）
  - **引用高亮**：答案段落对应引用块（chunk）高亮展示，可点击后在左栏看到来源
- **右栏 Studio（动作/产物）**
  - 预设动作按钮：思维导图 / 大纲 / 测验（一期至少 2 个）
  - Prompt 模板库：可保存/复用提示词，支持一键运行生成产物
  - 产物列表：每次运行生成一个 Artifact，可回看/复制

**验收标准**
- Chat 的每条 AI 消息必须携带 citations（无引用则标记“未找到依据”并拒答或提示补充资料）
- 点击引用可定位到来源（至少定位到 chunk 文本 + 元信息：页码/链接）
- Studio 至少提供 2 个可产出结构化内容的动作（JSON/Markdown）

## 3. 技术选型（含明确版本）与兼容性结论

> 结论：**Supabase + Prisma** 作为数据库方案；向量检索使用 **pgvector + SQL/RPC**（不强依赖 Prisma 对 vector 的支持）。

### 3.1 版本矩阵（推荐锁定）

| 模块 | 选择 | 推荐版本（锁定） | 备注 |
|---|---|---:|---|
| Node.js | 运行时 | **20 LTS**（要求 ≥ 18.17） | Next.js 14 要求 Node ≥ 18.17 |
| Next.js | 全栈框架 | **14.2.35** | App Router 稳定，生态对 React 18 更友好 |
| React / ReactDOM | UI 框架 | **18.2.0** | 与 Next.js 14 peerDependencies 对齐 |
| TypeScript | 类型系统 | **5.9.3** | 与 Next.js 14/React 18 组合稳定 |
| Vercel AI SDK | 流式 UI / hooks | **ai 4.3.19** | 覆盖 `useChat`/流式；避免 v5/v6 的大版本迁移成本 |
| Zod | 入参校验 | **3.25.76** | 与 AI SDK v4 的 peerDependencies 匹配 |
| LangChain.js | RAG/Agent 框架 | **langchain 1.2.3** | 用于检索/链路组装；Workflow 二期可引入 LangGraph |
| Supabase JS | Supabase SDK | **@supabase/supabase-js 2.89.0** | 客户端/服务端调用 |
| Supabase SSR | Next SSR 适配 | **@supabase/ssr 0.8.0** | Cookie 会话管理 |
| Prisma | ORM | **prisma 7.2.0** + **@prisma/client 7.2.0** | 管业务表与迁移；向量表推荐 SQL 迁移 |
| Postgres | 数据库 | Supabase 托管 Postgres（版本由 Supabase 提供） | 作为 pgvector 基础 |
| pgvector | 向量扩展 | Supabase Extension（建议 **≥ 0.6**） | 0.6+ HNSW 构建更快；索引最大支持 2000 维向量 |
| Tailwind CSS | 样式框架 | **3.4.1** | 原子化 CSS，与 Next.js 14 完美集成；快速构建响应式 UI |
| shadcn/ui | 基础组件库 | **0.8.0** | 基于 Radix UI + Tailwind，提供可复用的无样式组件 |
| ant-design X | AI 对话组件库 | **@2.1.1** | 专为 AI 应用优化，提供 Chat/Message/Bubble 等对话 UI 组件 |
| shadcn/UI | 无样式组件库 |  | 能快速搭建美观、一致且可访问的界面 |
| framer-motion | 动画库 | **10.16.4** | 平滑的 UI 过渡与加载动画 |
| zustand | 状态管理 | **4.4.1** | 轻量级状态管理，用于 Notebook/Chat/Studio 状态 |
| lucide-react | 图标库 | **0.292.0** | 现代化 SVG 图标库，与 Tailwind 无缝集成 |

### 3.2 为什么用 Next.js 14，而不是更新版本？

- **升级到 Next.js 15 会强制引入 React 19**，并带来表单相关 hook 迁移（如 `useFormState` → `useActionState`）等升级成本（官方升级文档明确说明 Next 15 需要 React 19）。
- 你的一期目标是“快速交付可演示原型”，核心风险在 RAG/解析/引文对齐，不在框架追新。选 **Next 14 + React 18** 能显著降低依赖不兼容与迁移成本，让团队把时间花在产品差异化上。

### 3.3 Supabase + Prisma 关键兼容性与工程约束（必须遵守）

**连接池（必须）**
- Prisma 官方建议：在 Supabase（Supavisor / 类 PgBouncer）场景下，运行时使用 **pooler 连接串**（`DATABASE_URL`），并追加 `?pgbouncer=true`；CLI（迁移/Introspect）使用 **直连串**（`DIRECT_URL`）。

**向量能力（推荐 SQL 迁移 + RPC）**
- 业务表：Prisma 管理（Notebook、Source、Message、Artifact 等）。
- 向量表：建议用 SQL 迁移创建（`vector` 类型 + HNSW 索引 + 检索函数），并通过 Prisma `$queryRaw` 或 Supabase RPC 调用。

### 3.4 模型调用技术选型（智谱清言 Embedding-3 + GLM-4.7）

> 一句话定位：**Embedding-3 = 知识库“记忆引擎”**（向量化与检索）；**GLM-4.7 = “思考与交互引擎”**（回答生成/总结/大纲/测验/思维导图）。

#### 3.4.1 选型结论

- **Embedding**：智谱清言 **Embedding-3**
  - **向量维度（官方）**：默认 **2048**，支持自定义 `dimensions` 为 **256 / 512 / 1024 / 2048**；结合 pgvector “索引维度 ≤ 2000”的约束，建议 **从 1024 维开始**（精度/成本/性能平衡）。
- **生成模型**：智谱清言 **GLM-4.7**
  - 用于：Notebook RAG 问答、Studio 动作（大纲/测验/思维导图）、对话建议问题生成等。

#### 3.4.2 Embedding-3 与项目需求的匹配度分析（你提供内容整理入档）

| 你的项目需求 | Embedding-3 提供的能力 | 匹配度与说明 |
|---|---|---|
| 知识库核心（文档向量化与检索） | 高精度语义搜索：适用于专业领域知识库构建；支持 256–2048 维度可调 | ⭐⭐⭐⭐⭐ 完美匹配：领域适应性对知识库质量帮助大 |
| 处理多样化文档（PDF/Word/网页） | 文本输入：模态为纯文本，需要先做文本抽取 | ⭐⭐⭐⭐ 高度匹配：行业标准做法（前置解析库） |
| 控制成本 | 价格：0.5 元/百万 Tokens（以官方计费为准） | ⭐⭐⭐⭐⭐ 完美匹配：大规模导入成本关键 |
| 智能交互与 Agent | 不支持：仅生成向量，不负责理解/生成/规划 | 完全不匹配：必须由 GLM-4.7 负责生成与推理 |

#### 3.4.3 集成架构（Embedding-3 与 GLM-4.7 如何协作）

**Indexing（入库链路）**
- 上传/链接 → 文本抽取 → Chunk 切分 → **调用 Embedding-3** 得到向量 → 写入 Supabase pgvector（`document_chunks`）→ 建立索引

**Retrieval + Generation（问答链路）**
- 用户问题 → **调用 Embedding-3**（query embedding）→ pgvector RPC 检索 topK chunks → 组装“基于证据回答”的 prompt → **调用 GLM-4.7 流式生成** → 返回 `answer + citations`

#### 3.4.4 在 Next.js API 中调用智谱（可执行落地建议）

**环境变量（服务端使用）**
- `ZHIPU_API_KEY`：智谱 API Key（严禁下发到浏览器）
- `ZHIPU_BASE_URL`：默认 `https://open.bigmodel.cn/api`（下方会拼接 `/paas/v4/...`）
- `ZHIPU_EMBEDDING_MODEL`：默认 `embedding-3`
- `ZHIPU_CHAT_MODEL`：默认 `glm-4.7`
- `EMBEDDING_DIM`：默认 `1024`（与你的向量表维度一致）

**同一 Key / 同一 SDK，靠 `model` 参数切换模型**
- 你提供的 SDK 示例（Python）表明：Embedding-3 与 GLM-4.7 **共用同一 API Key**，只需在调用时传不同的 `model` 即可。

**Embedding-3（文档向量化 / query 向量）**
- 在处理文件上传/解析的 API 路由中（如 `POST /api/sources/:id/ingest`）：
  - 先解析文本（PDF：`pdf-parse`；Word：`mammoth`；网页：抓取 + `readability`/自定义提取）
  - 按 token/段落切 chunk
  - 对 chunk **批量调用** `POST {ZHIPU_BASE_URL}/paas/v4/embeddings`
  - 将向量与 chunk 元数据写入 `document_chunks`

**GLM-4.7（RAG 问答/Studio 动作）**
- 在 `POST /api/chat`、`POST /api/actions/:type` 中：
  - 先检索 topK chunks（pgvector RPC）
  - 构造“必须基于证据回答”的 system prompt，并把 chunks 作为上下文输入
  - 调用智谱 Chat 接口进行生成（路径与字段以智谱官方文档为准；建议在代码中把 path 做成可配置）
  - 通过 Vercel AI SDK 的 Route Handler 把生成结果流式返回给前端 `useChat`

**Embedding-3 OpenAPI 关键约束（来自你提供的文档）**
- **鉴权**：HTTP `Authorization: Bearer ${ZHIPU_API_KEY}`
- **Endpoint**：`POST /paas/v4/embeddings`
- **Request Body**
  - `model`: `embedding-3`
  - `input`: string 或 string[]
  - `dimensions`（可选）：`256 | 512 | 1024 | 2048`
- **限制**
  - 单条请求：`embedding-3` **最多 3072 tokens**
  - 数组输入：**最多 64 条**

**实现建议（强烈建议照做，避免踩限制）**
- **chunk 大小建议**：将每个 chunk 控制在 **~600–1200 tokens** 区间（宁可多切一点），避免接近 3072 tokens 上限带来的失败与重试成本。
- **批量策略**：`input` 用数组批量发（≤ 64 条），降低 QPS 和网络开销。
- **维度一致性**：`dimensions` 必须与 `document_chunks.embedding vector(D)` 的 **D 完全一致**（建议一期固定 1024）。

**工程建议（必须做）**
- **批量与限流**：Embedding 建议批量（减少 QPS），并实现退避重试（429/5xx）。
- **缓存**：对相同 chunk 计算哈希，避免重复 embedding；对 query embedding 可做短 TTL 缓存。
- **一致性**：`EMBEDDING_DIM` 必须与 `vector(D)` 的 D 一致；一旦上线不要随意改维度（会导致老数据不可用）。

#### 3.4.5 LangChain.js 接入策略（Embedding-3 自定义封装）

LangChain.js 未必原生支持 Embedding-3，建议：
- 自定义一个 `Embeddings` 封装智谱 embeddings 调用（实现 `embedQuery` / `embedDocuments`）
- Retriever 侧仍使用你的 pgvector RPC（LangChain 只做“链路编排”，向量检索仍走 SQL/RPC，性能更稳）

## 4. 核心功能点（一期必达）与差异化亮点

### 4.1 一期必达核心能力（MVP Scope）

**A. 知识源导入**
- 上传：PDF（必做）、可选 Word（docx）、图片 OCR（可选）
- 链接：网页链接抓取（必做）；视频链接（一期可仅做“保存链接 + 可选字幕抓取”）

**B. 解析与向量化**
- 文本抽取 → Chunk 切分（按 token/段落）→ **Embedding-3 向量化（建议 1024 维起步）** → 存入 pgvector
- 支持按 Notebook 过滤检索（多 Notebook 隔离）

**C. Notebook 内 RAG 问答**
- 流式输出
- 每条回答返回 citations
- 引文高亮展示（chunk 级别）

**D. Studio 动作（至少 2 个）**
- “总结（生成要点）”
- “生成大纲（分层结构）”或“生成测验（Q/A 列表）”

### 4.2 差异化亮点（对比 NotebookLM 的优势方向，一期先做“可展示版本”）

**1) Agent/Workflow 可扩展底座（一期可展示）**
- 不是把能力固化在几个按钮：按钮只是“动作配置”的一种 UI。
- 动作通过统一的 `Action API` 执行：后续可直接扩展为可视化 Workflow 编排，而无需重写底层。

**2) RAG 链路可视化（一期做 Lite 版）**
- 在 UI 里展示：用户问题 → 检索到的 chunks（含相似度）→ 最终回答
- 目标：让“可追溯性”从引用高亮升级为“可解释的检索过程”

**3) 更严格的“基于知识库回答”策略**
- 支持“找不到依据则拒答/提示补充资料”
- 降低幻觉，提高可信度（对 ToB 演示尤其重要）

## 5. 数据模型（建议稿）

> 目标：支撑“Notebook-Source-Chunk-Message-Artifact”的最小闭环，并为二期协作/权限预留字段。

### 5.1 Prisma 管理的业务表（建议）

- `User`：由 Supabase Auth 提供（你可以只保存 `user_id` 引用，不做用户表）
- `Notebook`
  - `id (uuid)`
  - `ownerId (uuid)`（对应 Supabase user id）
  - `title`
  - `createdAt / updatedAt / lastOpenedAt`
- `Source`
  - `id (uuid)`
  - `notebookId (uuid)`
  - `type`：`file | url | video`
  - `title`
  - `status`：`pending | processing | ready | failed`
  - `storagePath`（上传文件）
  - `url`（链接）
  - `meta`（jsonb：页数、mime、抓取信息等）
- `Message`
  - `id (uuid)`
  - `notebookId`
  - `role`：`user | assistant | system`
  - `content`
  - `citations`（jsonb，见 6.2）
  - `createdAt`
- `Artifact`
  - `id (uuid)`
  - `notebookId`
  - `type`：`summary | outline | quiz | custom`
  - `input`（jsonb：prompt、source 选择等）
  - `content`（markdown/json）
  - `createdAt`
- `PromptTemplate`
  - `id (uuid)`
  - `ownerId`
  - `name`
  - `template`（含变量占位）

### 5.2 SQL 管理的向量表（建议）

`document_chunks`（SQL 迁移创建）
- `id bigserial`
- `notebook_id uuid`
- `source_id uuid`
- `chunk_index int`
- `content text`
- `metadata jsonb`（页码/段落号/URL#hash/视频时间戳等）
- `embedding vector(D)`（D 与 embedding 模型一致，且 **≤ 2000** 以支持索引）

向量索引：优先 **HNSW**（Supabase 官方建议默认使用 HNSW）。

## 6. API 契约（前后端并行开发的“协议”）

### 6.1 统一约定

- 所有 API 都必须在服务端做 `ownerId` 校验（Prisma 连接通常是 service role/数据库用户，默认绕过 RLS，必须靠应用层保证隔离）。
- 所有 AI 输出必须包含 `citations` 字段（可以为空，但需同时返回 `answerMode: "no_evidence"` 并提示用户补充资料）。

### 6.2 引用结构（Citations JSON）

```json
{
  "citations": [
    {
      "chunkId": 123,
      "sourceId": "uuid",
      "notebookId": "uuid",
      "score": 0.82,
      "locator": { "page": 5, "startChar": 120, "endChar": 340 },
      "excerpt": "被引用的原文片段（可选）"
    }
  ],
  "answerMode": "grounded" 
}
```

### 6.3 关键接口（一期）

- `POST /api/notebooks`：创建 Notebook
- `GET /api/notebooks`：列表（含最近打开）
- `POST /api/notebooks/:id/open`：记录最近打开
- `POST /api/sources/upload`：上传文件并创建 Source（返回 sourceId）
- `POST /api/sources/url`：创建 URL Source（返回 sourceId）
- `POST /api/sources/:id/ingest`：触发解析/向量化（返回 jobId 或直接返回状态）
- `GET /api/sources/:id`：获取导入状态、元信息、可展示摘要
- `POST /api/chat`：RAG 问答（流式），返回 `content + citations`
- `POST /api/actions/:type`：运行预设动作（summary/outline/quiz）

## 7. pgvector 落地规范（必须按这个做）

### 7.1 扩展与索引建议

- 启用：`create extension if not exists vector;`
- 索引：优先 HNSW（对数据增量更鲁棒），operator class 与距离运算符一致（推荐 cosine：`vector_cosine_ops` + `<=>`）。

### 7.2 检索 RPC（示例）

> 真实实现以你的 embedding 维度为准（建议从 **1024** 起步；Embedding-3 支持 256–2048，且 pgvector 索引维度要求 ≤ 2000）。

```sql
create or replace function public.match_document_chunks(
  p_notebook_id uuid,
  p_query_embedding vector(1024),
  p_match_count int default 8
)
returns table (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.document_chunks c
  where c.notebook_id = p_notebook_id
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;
```

## 8. 关键架构风险与解决方案（必读）

> **重要提示**：以下风险点必须在开发前明确解决方案，否则会在后期造成数据损坏、用户体验问题或技术债务。

### 8.1 向量维度一致性风险 🔴 P0

**风险描述**
- Embedding-3 默认 2048 维，但 pgvector 索引限制 ≤ 2000 维
- 如果代码中 `EMBEDDING_DIM` 与数据库 `vector(D)` 不一致，会导致写入失败或检索错误
- 后期改维度会导致所有老数据失效

**强制约束（必须执行）**

1. **环境变量锁定**
```bash
# .env
EMBEDDING_DIM=1024  # 必须与数据库 schema 一致
```

2. **代码启动时断言检查**
```typescript
// lib/config.ts
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '1024');
const EXPECTED_DIM = 1024; // 与 migration 中的维度一致

if (EMBEDDING_DIM !== EXPECTED_DIM) {
  throw new Error(
    `EMBEDDING_DIM (${EMBEDDING_DIM}) must match database vector dimension (${EXPECTED_DIM})`
  );
}
```

3. **数据库 Migration 明确维度**
```sql
-- migrations/xxx_create_vector_table.sql
CREATE TABLE document_chunks (
  id BIGSERIAL PRIMARY KEY,
  notebook_id UUID NOT NULL,
  source_id UUID NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1024) NOT NULL,  -- 明确写死，不要用变量
  embedding_model TEXT DEFAULT 'embedding-3',  -- 记录模型版本
  embedding_dim INT DEFAULT 1024,  -- 记录维度（为未来升级留后路）
  content_hash TEXT,  -- 用于去重
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embedding ON document_chunks 
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX idx_content_hash ON document_chunks(content_hash);
```

4. **调用 Embedding API 时强制指定维度**
```typescript
// lib/embeddings.ts
const response = await fetch(`${ZHIPU_BASE_URL}/paas/v4/embeddings`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ZHIPU_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'embedding-3',
    input: texts,
    dimensions: EMBEDDING_DIM  // 强制指定
  })
});
```

---

### 8.2 文件解析链路错误恢复机制 🔴 P0

**风险描述**
- PDF 解析失败（损坏文件、加密 PDF、扫描件无文本）
- Embedding API 429/5xx 错误（限流、服务故障）
- 网络中断导致部分 chunks 未写入
- 用户看到"处理中"状态但实际已失败

**解决方案**

1. **增强 Source 表字段**
```typescript
// prisma/schema.prisma
model Source {
  id            String   @id @default(uuid())
  notebookId    String
  type          String   // 'file' | 'url' | 'video'
  title         String
  status        String   // 'pending' | 'processing' | 'ready' | 'failed'
  storagePath   String?
  url           String?
  meta          Json?
  
  // 新增字段
  processingLog Json?    // 记录每个阶段的状态
  lastProcessedChunkIndex Int @default(0)  // 断点续传
  retryCount    Int      @default(0)
  errorMessage  String?  // 失败原因
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

2. **处理日志结构**
```typescript
// types/processing.ts
interface ProcessingLog {
  stages: {
    upload?: { status: 'success' | 'failed', timestamp: string, error?: string };
    parse?: { status: 'success' | 'failed', pages?: number, error?: string };
    chunk?: { status: 'success' | 'failed', chunks?: number, error?: string };
    embed?: { 
      status: 'success' | 'partial' | 'failed', 
      success: number, 
      failed: number, 
      errors?: string[] 
    };
    index?: { status: 'success' | 'failed', error?: string };
  };
}
```

3. **断点续传实现**
```typescript
// lib/ingest.ts
async function ingestSource(sourceId: string) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  
  // 从上次中断的地方继续
  const startIndex = source.lastProcessedChunkIndex || 0;
  const chunks = await parseAndChunk(source);
  
  for (let i = startIndex; i < chunks.length; i++) {
    try {
      const embedding = await getEmbedding(chunks[i].content);
      await saveChunk(sourceId, i, chunks[i], embedding);
      
      // 更新进度
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastProcessedChunkIndex: i + 1 }
      });
    } catch (error) {
      // 记录错误但继续处理
      await logProcessingError(sourceId, i, error);
    }
  }
}
```

4. **指数退避重试策略**
```typescript
// lib/retry.ts
const RETRY_DELAYS = [1000, 5000, 15000, 60000]; // ms
const MAX_RETRIES = 4;

async function withRetry<T>(
  fn: () => Promise<T>,
  context: { sourceId: string; operation: string }
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // 429 或 5xx 才重试
      if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`, context);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // 其他错误直接抛出
      }
    }
  }
  
  throw lastError;
}
```

---

### 8.3 Citations 跨 Source 去重 🟡 P1

**风险描述**
- 用户上传同一文档的不同版本（v1.pdf, v2.pdf）
- 同一段落被引用多次，UI 显示重复引用
- 浪费 Embedding API 调用（相同内容重复向量化）

**解决方案**

1. **内容哈希去重**
```typescript
// lib/chunking.ts
import crypto from 'crypto';

function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

async function saveChunkWithDedup(
  sourceId: string,
  chunkIndex: number,
  content: string,
  metadata: any
) {
  const contentHash = hashContent(content);
  
  // 检查是否已存在相同内容
  const existing = await prisma.$queryRaw`
    SELECT id, embedding 
    FROM document_chunks 
    WHERE content_hash = ${contentHash}
    LIMIT 1
  `;
  
  if (existing.length > 0) {
    // 复用已有 embedding
    await prisma.document_chunks.create({
      data: {
        sourceId,
        chunkIndex,
        content,
        contentHash,
        embedding: existing[0].embedding,  // 复用
        metadata
      }
    });
    return { reused: true };
  }
  
  // 新内容，需要 embedding
  const embedding = await getEmbedding(content);
  await prisma.document_chunks.create({
    data: {
      sourceId,
      chunkIndex,
      content,
      contentHash,
      embedding,
      metadata
    }
  });
  return { reused: false };
}
```

2. **检索时去重**
```typescript
// lib/retrieval.ts
function deduplicateCitations(chunks: Chunk[]): Chunk[] {
  const seen = new Map<string, Chunk>();
  
  for (const chunk of chunks) {
    const hash = chunk.content_hash;
    if (!seen.has(hash) || chunk.similarity > seen.get(hash)!.similarity) {
      seen.set(hash, chunk);
    }
  }
  
  return Array.from(seen.values());
}
```

---

### 8.4 流式输出 Citations 时序问题 🟡 P1

**风险描述**
- Vercel AI SDK 流式返回文本，但 citations 需要在生成完成后才能确定
- 用户看到答案但引用延迟出现（体验割裂）
- AI 生成中途失败，citations 可能丢失

**解决方案：双阶段流式**

```typescript
// app/api/chat/route.ts
import { StreamingTextResponse } from 'ai';

export async function POST(req: Request) {
  const { messages, notebookId } = await req.json();
  const lastMessage = messages[messages.length - 1].content;
  
  // 1. 检索相关 chunks
  const relevantChunks = await retrieveChunks(notebookId, lastMessage);
  
  // 2. 构造 prompt
  const prompt = buildRAGPrompt(lastMessage, relevantChunks);
  
  // 3. 调用 GLM-4.7 流式生成
  const stream = await callGLM4Stream(prompt);
  
  // 4. 包装流，在结束时追加 citations
  const enhancedStream = new ReadableStream({
    async start(controller) {
      // 流式输出文本
      for await (const chunk of stream) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      
      // 文本结束后，追加 citations（使用特殊分隔符）
      const citationsPayload = JSON.stringify({
        type: 'citations',
        data: relevantChunks.map(chunk => ({
          chunkId: chunk.id,
          sourceId: chunk.source_id,
          score: chunk.similarity,
          locator: chunk.metadata.locator,
          excerpt: chunk.content.substring(0, 200)
        })),
        answerMode: relevantChunks.length > 0 ? 'grounded' : 'no_evidence'
      });
      
      controller.enqueue(new TextEncoder().encode(`\n\n__CITATIONS__${citationsPayload}`));
      controller.close();
    }
  });
  
  return new StreamingTextResponse(enhancedStream);
}
```

**前端处理**
```typescript
// components/ChatPanel.tsx
const { messages, append } = useChat({
  api: '/api/chat',
  onFinish: (message) => {
    // 解析 citations
    const parts = message.content.split('__CITATIONS__');
    if (parts.length === 2) {
      const textContent = parts[0];
      const citations = JSON.parse(parts[1]);
      
      // 更新消息（移除 citations 标记）
      updateMessage(message.id, {
        content: textContent,
        citations: citations.data,
        answerMode: citations.answerMode
      });
    }
  }
});
```

---

### 8.5 Supabase Storage 文件管理策略 🟡 P1

**风险描述**
- 文件命名冲突（多用户上传同名文件）
- 权限泄露（其他用户访问不属于自己的文件）
- 存储泄漏（删除 Source 后文件未清理）

**解决方案**

1. **文件路径规范**
```typescript
// lib/storage.ts
function getStoragePath(
  ownerId: string,
  notebookId: string,
  sourceId: string,
  originalFilename: string
): string {
  const ext = path.extname(originalFilename);
  const timestamp = Date.now();
  return `${ownerId}/${notebookId}/${sourceId}_${timestamp}${ext}`;
}
```

2. **Supabase Storage 配置**
```sql
-- 1. 创建 private bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('notebook-sources', 'notebook-sources', false);

-- 2. RLS 策略：只允许 owner 访问
CREATE POLICY "Users can only access their own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'notebook-sources' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can only upload to their own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'notebook-sources' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can only delete their own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'notebook-sources' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

3. **级联删除**
```typescript
// app/api/sources/[id]/route.ts
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sourceId = params.id;
  const ownerId = await getOwnerIdFromSession();
  
  // 1. 获取 Source 信息
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true }
  });
  
  // 2. 权限校验
  if (source.notebook.ownerId !== ownerId) {
    return new Response('Forbidden', { status: 403 });
  }
  
  // 3. 删除文件（如果存在）
  if (source.storagePath) {
    await supabase.storage
      .from('notebook-sources')
      .remove([source.storagePath]);
  }
  
  // 4. 删除 chunks
  await prisma.document_chunks.deleteMany({
    where: { sourceId }
  });
  
  // 5. 删除 Source 记录
  await prisma.source.delete({
    where: { id: sourceId }
  });
  
  return new Response(null, { status: 204 });
}
```

---

### 8.6 预处理队列（解耦上传与处理）🟢 P2

**风险描述**
- 大文件同步处理导致 API 超时（Next.js API Route 默认 60s）
- 无法并发处理多个文件
- 用户上传后需要等待，体验差

**解决方案（一期最简：伪异步）**

1. **创建处理队列表**
```sql
-- migrations/xxx_create_processing_queue.sql
CREATE TABLE processing_queue (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  priority INT DEFAULT 1,
  attempts INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_queue_status ON processing_queue(status, priority DESC, created_at);
```

2. **上传时写入队列**
```typescript
// app/api/sources/upload/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  
  // 1. 上传到 Storage
  const storagePath = await uploadToStorage(file);
  
  // 2. 创建 Source 记录
  const source = await prisma.source.create({
    data: {
      notebookId,
      type: 'file',
      title: file.name,
      status: 'pending',
      storagePath
    }
  });
  
  // 3. 写入队列（立即返回）
  await prisma.processing_queue.create({
    data: {
      sourceId: source.id,
      priority: 1
    }
  });
  
  return Response.json({ sourceId: source.id, status: 'pending' });
}
```

3. **Worker 轮询处理**
```typescript
// app/api/cron/process-queue/route.ts
export async function GET(req: Request) {
  // Vercel Cron Job 每分钟调用一次
  const jobs = await prisma.processing_queue.findMany({
    where: { status: 'pending' },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 5  // 每次处理 5 个
  });
  
  await Promise.all(jobs.map(async (job) => {
    try {
      await prisma.processing_queue.update({
        where: { id: job.id },
        data: { status: 'processing', startedAt: new Date() }
      });
      
      await ingestSource(job.sourceId);
      
      await prisma.processing_queue.update({
        where: { id: job.id },
        data: { status: 'completed', completedAt: new Date() }
      });
    } catch (error) {
      await prisma.processing_queue.update({
        where: { id: job.id },
        data: { 
          status: 'failed', 
          errorMessage: error.message,
          attempts: job.attempts + 1
        }
      });
    }
  }));
  
  return Response.json({ processed: jobs.length });
}
```

4. **前端轮询状态**
```typescript
// hooks/useSourceStatus.ts
export function useSourceStatus(sourceId: string) {
  const { data, error } = useSWR(
    `/api/sources/${sourceId}`,
    fetcher,
    { refreshInterval: 2000 }  // 每 2 秒轮询
  );
  
  return {
    status: data?.status,
    progress: data?.lastProcessedChunkIndex,
    error: data?.errorMessage
  };
}
```

---

### 8.7 混合检索（Hybrid Search）🟢 P2

**风险描述**
- 纯向量检索可能漏掉关键词匹配（如专有名词、代码片段）
- 用户问"第 5 页讲了什么"，向量检索可能找不到

**解决方案**

1. **增加全文检索索引**
```sql
-- migrations/xxx_add_fulltext_search.sql
ALTER TABLE document_chunks ADD COLUMN content_tsv tsvector;

-- 自动更新 tsvector
CREATE OR REPLACE FUNCTION update_content_tsv() RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tsvector_update BEFORE INSERT OR UPDATE
ON document_chunks FOR EACH ROW EXECUTE FUNCTION update_content_tsv();

-- 创建 GIN 索引
CREATE INDEX idx_content_fts ON document_chunks USING GIN(content_tsv);
```

2. **混合检索 RPC**
```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  p_notebook_id uuid,
  p_query_embedding vector(1024),
  p_query_text text,
  p_match_count int DEFAULT 8,
  p_vector_weight float DEFAULT 0.7,
  p_fts_weight float DEFAULT 0.3
)
RETURNS TABLE (
  id bigint,
  source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  vector_score float,
  fts_score float,
  combined_score float
)
LANGUAGE sql STABLE
AS $$
  WITH vector_results AS (
    SELECT 
      c.*,
      1 - (c.embedding <=> p_query_embedding) AS vector_score,
      0::float AS fts_score
    FROM document_chunks c
    WHERE c.notebook_id = p_notebook_id
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_match_count * 2
  ),
  fts_results AS (
    SELECT 
      c.*,
      0::float AS vector_score,
      ts_rank(c.content_tsv, plainto_tsquery('english', p_query_text)) AS fts_score
    FROM document_chunks c
    WHERE c.notebook_id = p_notebook_id 
      AND c.content_tsv @@ plainto_tsquery('english', p_query_text)
    ORDER BY fts_score DESC
    LIMIT p_match_count * 2
  ),
  combined AS (
    SELECT * FROM vector_results
    UNION ALL
    SELECT * FROM fts_results
  )
  SELECT DISTINCT ON (c.id)
    c.id,
    c.source_id,
    c.chunk_index,
    c.content,
    c.metadata,
    MAX(c.vector_score) AS vector_score,
    MAX(c.fts_score) AS fts_score,
    (MAX(c.vector_score) * p_vector_weight + MAX(c.fts_score) * p_fts_weight) AS combined_score
  FROM combined c
  GROUP BY c.id, c.source_id, c.chunk_index, c.content, c.metadata
  ORDER BY c.id, combined_score DESC
  LIMIT p_match_count;
$$;
```

---

### 8.8 Embedding 缓存策略 🟢 P2

**风险描述**
- 相同问题重复调用 Embedding API（浪费成本）
- 高频问题（如"这个文档讲了什么"）每次都重新 embedding

**解决方案**

1. **Query Embedding 缓存（使用 Vercel KV）**
```typescript
// lib/embeddings.ts
import { kv } from '@vercel/kv';
import crypto from 'crypto';

async function getQueryEmbedding(text: string): Promise<number[]> {
  const cacheKey = `embed:query:${crypto.createHash('md5').update(text).digest('hex')}`;
  
  // 1. 尝试从缓存读取
  const cached = await kv.get<number[]>(cacheKey);
  if (cached) {
    console.log('Cache hit for query embedding');
    return cached;
  }
  
  // 2. 调用 API
  const embedding = await callEmbeddingAPI(text);
  
  // 3. 写入缓存（1 小时过期）
  await kv.setex(cacheKey, 3600, embedding);
  
  return embedding;
}
```

2. **Chunk Embedding 去重（已在 8.3 中实现）**

---

## 9. 交付物清单（一期）

- 可登录（Supabase Auth）
- Notebook 列表 + Notebook 详情三栏布局
- PDF 上传 → 解析 → 向量化 → 可检索
- RAG 流式问答 + 引文高亮
- Studio 动作（至少 2 个）+ 产物列表
- RAG 链路可视化 Lite（检索结果面板）
- **架构风险缓解措施（8.1-8.5 必须实现，8.6-8.8 可选）**


