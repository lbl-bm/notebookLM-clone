# NotebookLM Clone（个人/团队知识库原型）

本仓库实现一个类似 NotebookLM 的原型产品：支持把资料导入到 Notebook，经过处理与向量化后，在同一 Notebook 内进行基于证据的对话（带引用），并在 Studio 中生成结构化产物（如测验、思维导图等）。

## 功能概览

- Notebook 管理：创建、列表、删除、最近打开
- Sources（知识源）导入：
  - 文字粘贴导入
  - URL 导入（网页抓取/解析，含 PDF 链接识别）
  - PDF 文件上传（依赖 Supabase Storage）
- 处理与索引：
  - 文本切分、去重、批量 Embedding
  - 写入 pgvector 向量表 `document_chunks`
  - ProcessingQueue 队列与 Cron Worker 处理
- Chat（RAG 问答）：
  - 基于向量/混合检索的问答
  - 流式输出
  - 每条 AI 回复携带 citations（无依据时返回“未找到依据”）
  - 支持查看检索链路详情（query、topK、分数、耗时等）
- Studio（产物生成）：
  - fast / precise 两种策略（采样 / Map-Reduce）
  - 生成结构化产物（JSON/Markdown），支持解析与容错
  - 支持基于模板运行并保存为 Artifact

## 技术栈

- Next.js 14（App Router）+ React 18 + TypeScript
- Tailwind CSS + shadcn/ui + Radix UI
- Supabase：
  - Auth（登录态与路由保护）
  - Storage（文件存储）
  - Postgres（含 pgvector 扩展）
- Prisma（业务表与迁移）
- RAG：
  - pgvector 向量检索 + SQL/RPC（`match_document_chunks`）
  - 混合检索（向量 + 关键词/FTS）
- 模型服务（OpenAI-compatible 接口）：
  - 智谱（ZHIPU）
  - LongCat

## 目录结构

- `app/`：页面与 API 路由（Notebooks、Sources、Chat、Studio、Templates、Cron）
- `components/`：Notebook 三栏 UI（Sources / Chat / Studio）与通用组件
- `lib/processing/`：导入内容处理（解析、切分、embedding、入库、队列）
- `lib/rag/`：检索与提示词组装（messages、citations）
- `lib/studio/`：Studio 产物生成与解析
- `prisma/`：Prisma schema 与 SQL migrations（含 pgvector 向量表）

## 快速开始（本地）

### 1) 环境要求

- Node.js 20（要求 ≥ 18.17）
- 已创建的 Supabase 项目（Postgres + Storage）

### 2) 安装依赖

```bash
npm install
```

### 3) 配置环境变量

在项目根目录创建 `.env.local`，至少需要以下配置（示例为占位符，不要提交真实密钥）：

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=

# Prisma
DATABASE_URL=
DIRECT_URL=

# 模型配置
ZHIPU_API_KEY=
ZHIPU_BASE_URL=https://open.bigmodel.cn/api
ZHIPU_EMBEDDING_MODEL=embedding-3
ZHIPU_CHAT_MODEL=glm-4.7

LONGCAT_API_KEY=
LONGCAT_BASE_URL=https://api.longcat.chat/openai
LONGCAT_CHAT_MODEL=LongCat-Flash-Thinking

# 向量维度（必须与数据库 vector(D) 一致）
EMBEDDING_DIM=1024

# Worker 鉴权（用于 /api/cron/process-queue）
CRON_SECRET=
```

### 4) 初始化数据库

```bash
npm run db:migrate
```

说明：

- 业务表（notebooks/sources/messages/artifacts 等）由 Prisma 迁移创建
- 向量表 `document_chunks` 以及检索函数 `match_document_chunks` 也在迁移 SQL 中创建

### 5) 常用命令

```bash
# 开发
npm run dev

# 构建与启动
npm run build
npm run start

# 质量检查
npm run lint
npm run type-check

# Prisma
npm run db:studio
```

## 处理队列与 Cron Worker

Sources 导入后会进入处理队列（ProcessingQueue），由 Worker 逐批处理：

- Worker 路由：`GET /api/cron/process-queue`
- 鉴权：请求头 `Authorization: Bearer $CRON_SECRET`
- 本地手动触发：`/api/cron/process-queue?manual=true`

## 模型与模式说明

- Chat 的模式通过 `mode=fast | precise` 选择不同模型配置（见 `lib/config.ts`）
- Studio 默认使用 LongCat 模型配置生成产物（见 `lib/config.ts` / `lib/studio/generator.ts`）

## 文档入口

- `docs/PROJECT_SPEC.md`：MVP 规格说明、数据模型与关键实现细节
- `docs/ROADMAP.md`：项目排期与里程碑
