# 项目排期（按周）+ 两名前端并行分工 + 验收标准（一期 MVP）

> 假设：2 名前端（全栈）并行开发；每周 5 个工作日；以“可演示、可跑通闭环”为第一目标。

## 0. 团队分工原则（减少互相等待）

- **前端 A（偏产品壳/导入链路）**：Notebook 管理、Sources 左栏、导入 UI、上传与导入状态、基础布局与路由。
- **前端 B（偏 AI/RAG/Studio）**：Chat 中栏、流式对话、RAG API、引用结构、Studio 动作与产物、链路可视化面板。
- **共同约定（第 1 周必须完成）**
  - 数据模型字段命名与接口契约（`citations` JSON 结构）
  - `notebook_id` / `owner_id` 的隔离策略（Prisma 直连时必须应用层校验）
  - 向量检索 RPC 名称与入参（`match_document_chunks`）

## 1. 里程碑与排期（建议 6 周）

### Week 1：项目骨架 + 登录 + 数据模型基线

- **目标**：能登录、能创建 Notebook、能进入 Notebook 详情页（空壳）。

**A 负责**
- Next.js 14.2.35 初始化、基础布局（首页/Notebook/设置）
- Supabase Auth 登录/退出（App Router + `@supabase/ssr` cookie）
- Notebook 列表页 + 创建/删除/最近打开 UI（假数据可先占位）

**B 负责**
- Prisma 初始化（schema、migrate 流程）
- Supabase + Prisma 连接配置（`DATABASE_URL` pooler + `DIRECT_URL` 直连）
- `/api/chat` 空实现（回显）+ `useChat` 基础 UI（空引用结构）

**验收标准**
- 新用户登录后可创建 Notebook 并进入详情页
- 能发送消息看到流式返回（哪怕是 mock）

---

### Week 2：Source 管理 + 上传/链接入库 + 任务状态

- **目标**：左侧 Sources 能新增素材并显示处理状态。

**A 负责**
- Sources 左栏 UI：列表、勾选导入、状态 badge（pending/processing/ready/failed）
- 上传入口（PDF 必做）：前端上传到 Supabase Storage
- 录入 URL Source（网页链接）

**B 负责**
- `/api/sources/upload`：创建 Source 记录（返回 sourceId）
- `/api/sources/url`：创建 URL Source
- `/api/sources/:id`：查询状态与 meta
- 任务状态轮询（或 SSE）方案定稿

**验收标准**
- 上传/链接后，Source 列表可见并展示状态
- Notebook 内可勾选“参与回答的资料范围”

---

### Week 3：解析 + Chunk + 向量化 + pgvector 检索跑通

- **目标**：完成最小 RAG 索引链路：PDF → text → chunks → embeddings → pgvector → RPC 检索。

**A 负责**
- 导入进度 UI（解析中/向量化中/完成）
- Source 详情抽屉/弹层：展示基础摘要（可先显示前 N 字）

**B 负责**
- SQL 迁移：`vector` 扩展、`document_chunks` 表、HNSW 索引、`match_document_chunks` RPC
- `/api/sources/:id/ingest`：触发解析与向量化（一期允许同步/半同步）
- 选型并接入 Embedding 模型：**智谱 Embedding-3（建议从 1024 维开始；≤ 2000 以支持索引）**

**验收标准**
- 给定 query，可从 RPC 返回 topK chunks（含 similarity）
- Source 状态可从 processing 变为 ready

---

### Week 4：RAG 问答 + 引文高亮（核心体验成型）

- **目标**：Notebook 内实现“基于知识库回答 + 引文高亮 + 找不到依据拒答”。

**A 负责**
- 引用 UI（右侧/消息下方引用卡片）：点击定位到 chunk 文本
- 源文档预览（MVP：展示 chunk 列表即可；二期再做页级定位）

**B 负责**
- `/api/chat`：RAG 检索 + 组装 prompt + **调用 GLM-4.7 流式生成**
- citations 结构落地：把检索到的 chunk 映射为 citations 返回
- “无依据策略”：当检索分数低于阈值时，返回 `answerMode=no_evidence`

**验收标准**
- AI 回复必须带 citations；引用可点击并显示原文片段
- 无依据时不胡编，提示补充资料/缩小问题

---

### Week 5：Studio 动作 + Prompt 模板库 + 产物管理

- **目标**：右侧 Studio 至少 2 个动作可生成产物，并可回看/复制。

**A 负责**
- Studio UI：动作按钮区、模板库列表、产物列表（Artifacts）
- 产物渲染（Markdown/JSON）+ 复制/下载（MVP）

**B 负责**
- `/api/actions/*`：基于 **GLM-4.7** 实现动作（思维导图/大纲/测验 至少 2 个）
- PromptTemplate CRUD（保存/编辑/删除）
- Artifact 落库（Prisma）

**验收标准**
- 至少 2 种产物可一键生成并保存
- 模板可复用，运行时可选择 Sources 范围

---

### Week 6：差异化亮点收口 + Demo 打磨

- **目标**：做出“可展示优势”的演示版本：RAG 链路可视化 Lite + 体验打磨。

**A 负责**
- UI/UX 打磨：空状态、加载态、错误态、快捷入口、键盘体验
- 首页精选/最近打开完善

**B 负责**
- RAG 链路可视化 Lite：展示 topK chunks（分数/来源/片段）
- 性能与成本：缓存 embedding、topK、请求去重

**验收标准**
- Demo 流程可顺畅演示：导入 → 问答 → 引用 → 动作产物 → 链路解释

## 2. 关键需求描述（落到可验收的“清单”）

### 2.1 首页（Notebook 列表）
- 新建/删除/重命名
- 精选/最近打开
- 搜索（可选）

### 2.2 Notebook 详情三栏
- 左：Sources（导入、勾选范围、状态）
- 中：Chat（流式、建议问题、Markdown/代码/Mermaid、引用高亮）
- 右：Studio（动作、模板、产物）

### 2.3 安全与隔离（一期底线）
- 每个 Notebook 必须绑定 ownerId
- 所有 API 必须校验 ownerId
- 引文必须来自当前 Notebook 的 chunks


