# Sprint Planning - NotebookLM Clone MVP

> 基于用户故事的 Sprint 规划建议（2 人团队，6 周交付）

## 🎯 Sprint 目标与交付物

### Sprint 1 (Week 1): 项目基础设施
**目标**: 搭建可登录、可创建 Notebook 的基础框架

**交付物**:
- ✅ 用户可以登录/退出
- ✅ 用户可以创建/重命名/删除 Notebook
- ✅ Notebook 列表页可用
- ✅ 三栏布局骨架完成

**用户故事**:
- US-001: 用户登录与身份认证 (2 SP)
- US-002: 创建和管理 Notebook (3 SP)

**分工建议**:
- **前端 A**: Notebook 列表 UI、创建/删除对话框、路由配置
- **前端 B**: Supabase Auth 集成、API 端点、Prisma schema

**验收 Demo**:
1. 新用户注册并登录
2. 创建 3 个 Notebook
3. 重命名和删除 Notebook
4. 退出登录后无法访问

---

### Sprint 2 (Week 2): 知识源管理
**目标**: 用户可以上传 PDF 和添加链接，并看到处理状态

**交付物**:
- ✅ 用户可以上传 PDF（≤ 50MB）
- ✅ 用户可以添加网页链接
- ✅ Sources 列表显示状态（pending/processing/ready/failed）
- ✅ 可以查看 Source 详情和删除

**用户故事**:
- US-003: 上传 PDF 作为知识源 (5 SP)
- US-004: 添加网页链接作为知识源 (3 SP)

**分工建议**:
- **前端 A**: Sources 左栏 UI、上传组件、状态轮询、详情抽屉
- **前端 B**: Storage 集成、RLS 配置、`/api/sources/*` 端点、`processing_queue` 表

**验收 Demo**:
1. 上传一个 10 页 PDF
2. 添加一个博客链接
3. 查看处理状态变化
4. 查看 Source 详情（文件大小、页数等）
5. 删除 Source

**架构风险检查**:
- 🔴 8.2 Source 表包含 `processingLog` 等字段
- 🔴 8.5 Storage RLS 策略已配置

---

### Sprint 3 (Week 3): 文档解析与向量化
**目标**: 后台自动处理文档，生成可检索的向量索引

**交付物**:
- ✅ PDF 自动解析并切分 chunks
- ✅ Chunks 自动向量化（Embedding-3）
- ✅ 向量写入 pgvector（含 HNSW 索引）
- ✅ 可以通过 RPC 检索 topK chunks

**用户故事**:
- US-005: 解析文档并向量化 (8 SP)

**分工建议**:
- **前端 A**: 处理进度 UI（显示"正在解析第 X/Y 页"）、错误提示优化
- **前端 B**: 
  - PDF 解析（`pdf-parse`）
  - Chunk 切分逻辑
  - Embedding-3 集成
  - `document_chunks` 表 + HNSW 索引
  - `match_document_chunks` RPC
  - Worker 轮询逻辑

**验收 Demo**:
1. 上传 PDF 后自动开始处理
2. 查看处理日志（解析 → 切分 → 向量化）
3. 处理完成后状态变为 ready
4. 在数据库中查询 chunks 和 embeddings
5. 调用 RPC 检索 topK chunks

**架构风险检查**:
- 🔴 8.1 向量维度强制为 1024
- 🔴 8.2 断点续传已实现
- 🟡 8.3 content_hash 去重已实现
- 🟢 8.6 processing_queue 已使用

---

### Sprint 4 (Week 4): RAG 问答核心体验
**目标**: 用户可以基于知识库问答，并看到引用来源

**交付物**:
- ✅ 用户可以在 Chat 面板提问
- ✅ AI 基于知识库流式回答
- ✅ 回答包含引用来源（citations）
- ✅ 点击引用可定位到原文
- ✅ 无依据时拒答

**用户故事**:
- US-006: 基于知识库的 RAG 问答 (8 SP)
- US-007: 引文高亮与来源定位 (5 SP)

**分工建议**:
- **前端 A**: 
  - Chat UI（使用 ant-design X）
  - 引用卡片组件
  - Source 详情抽屉
  - 高亮定位逻辑
- **前端 B**:
  - `/api/chat` 端点
  - RAG 检索逻辑
  - GLM-4.7 集成
  - Citations 结构生成
  - 流式输出 + Citations 追加

**验收 Demo**:
1. 上传 AI 相关文档
2. 提问"什么是 Transformer"
3. 看到流式回答 + 引用卡片
4. 点击引用，左侧展开并高亮对应段落
5. 提问无关问题，看到拒答提示

**架构风险检查**:
- 🔴 8.1 Query embedding 维度为 1024
- 🟡 8.3 Citations 去重已实现
- 🟡 8.4 流式 Citations 时序正确

---

### Sprint 5 (Week 5): Studio 产物生成
**目标**: 用户可以一键生成大纲/测验等结构化产物

**交付物**:
- ✅ 用户可以生成大纲
- ✅ 用户可以生成测验（可交互答题）
- ✅ 产物持久化保存
- ✅ 用户可以创建和使用 Prompt 模板

**用户故事**:
- US-008: Studio 动作生成产物 (8 SP)
- US-009: Prompt 模板库 (5 SP)

**分工建议**:
- **前端 A**:
  - Studio 右栏 UI
  - 动作按钮区
  - 产物列表和渲染
  - 测验交互界面
  - 模板库 UI
- **前端 B**:
  - `/api/actions/*` 端点
  - GLM-4.7 产物生成
  - Artifact 表 CRUD
  - PromptTemplate 表 CRUD
  - 系统预设模板（seed data）

**验收 Demo**:
1. 基于上传的文档生成大纲
2. 生成测验并答题
3. 查看产物列表
4. 创建自定义模板"提取论点"
5. 使用模板生成产物

---

### Sprint 6 (Week 6): 可视化与打磨
**目标**: 展示 RAG 链路，打磨用户体验

**交付物**:
- ✅ RAG 链路可视化面板
- ✅ 显示检索到的 chunks 和分数
- ✅ UI/UX 打磨（空状态、加载态、错误态）
- ✅ 性能优化（Embedding 缓存）

**用户故事**:
- US-010: RAG 链路可视化 (5 SP)

**分工建议**:
- **前端 A**:
  - 检索详情面板 UI
  - Chunk 卡片组件
  - 流程图可视化
  - 空状态/错误态设计
  - 首页精选/最近打开完善
- **前端 B**:
  - `/api/chat` 返回检索详情
  - 记录各阶段耗时
  - Embedding 缓存（Vercel KV）
  - 性能监控埋点

**验收 Demo**:
1. 提问后查看检索详情
2. 看到 8 个 chunks 及分数
3. 查看流程图和耗时
4. 演示完整流程：导入 → 问答 → 引用 → 产物 → 链路解释

**架构风险检查**:
- 🟢 8.8 Embedding 缓存已实现

---

## 📊 Sprint 容量规划

### 团队速度假设
- 2 人团队
- 每人每周 5 个工作日
- 每人每天约 1 Story Point
- **每周团队容量**: ~10 SP

### 实际分配

| Sprint | 计划 SP | 实际容量 | 缓冲 | 状态 |
|---|---|---|---|---|
| Sprint 1 | 5 SP | 10 SP | ✅ 充足 | 📝 待开始 |
| Sprint 2 | 8 SP | 10 SP | ✅ 充足 | 📝 待开始 |
| Sprint 3 | 8 SP | 10 SP | ✅ 充足 | 📝 待开始 |
| Sprint 4 | 13 SP | 10 SP | ⚠️ 超载 | 📝 待开始 |
| Sprint 5 | 13 SP | 10 SP | ⚠️ 超载 | 📝 待开始 |
| Sprint 6 | 5 SP | 10 SP | ✅ 充足 | 📝 待开始 |

**风险提示**:
- Sprint 4 和 5 超载，建议：
  - 将 US-009 (Prompt 模板库) 降级为可选
  - 或将 US-007 的部分功能（如高亮定位）延后到 Sprint 5

---

## 🔄 每日站会建议

### 站会格式（15 分钟）
1. **昨天完成了什么？**（各 2 分钟）
2. **今天计划做什么？**（各 2 分钟）
3. **遇到什么阻碍？**（各 2 分钟）
4. **架构风险检查**（5 分钟）

### 架构风险检查清单
每周五站会必须检查对应周的架构风险（见 ROADMAP.md 第 4 章）

---

## 📋 Sprint Review 检查项

### Sprint 1 Review
- [ ] 演示登录/退出流程
- [ ] 演示创建/管理 Notebook
- [ ] 检查环境变量 `EMBEDDING_DIM` 已配置
- [ ] 检查 Storage RLS 策略已生效

### Sprint 2 Review
- [ ] 演示上传 PDF 和添加链接
- [ ] 演示查看处理状态
- [ ] 检查 Source 表包含错误恢复字段
- [ ] 检查 `processing_queue` 表已创建

### Sprint 3 Review
- [ ] 演示文档自动处理流程
- [ ] 检查数据库中的 chunks 和 embeddings
- [ ] 调用 RPC 检索 topK chunks
- [ ] 检查向量维度为 1024
- [ ] 检查断点续传功能

### Sprint 4 Review
- [ ] 演示完整问答流程
- [ ] 演示引用定位功能
- [ ] 演示无依据拒答
- [ ] 检查 Citations 去重
- [ ] 检查流式输出时序

### Sprint 5 Review
- [ ] 演示生成大纲和测验
- [ ] 演示 Prompt 模板库
- [ ] 检查产物持久化
- [ ] 检查系统预设模板

### Sprint 6 Review
- [ ] 演示 RAG 链路可视化
- [ ] 演示完整 Demo 流程
- [ ] 检查 Embedding 缓存命中率
- [ ] 性能测试（响应时间、并发）

---

## 🎬 最终 Demo 脚本

### Demo 流程（15 分钟）

**1. 登录与创建 Notebook** (2 分钟)
- 登录系统
- 创建 Notebook "AI 学习笔记"

**2. 导入知识源** (3 分钟)
- 上传 PDF "Attention Is All You Need"
- 添加链接 "https://jalammar.github.io/illustrated-transformer/"
- 展示处理状态变化

**3. RAG 问答** (5 分钟)
- 提问："什么是 Self-Attention 机制？"
- 展示流式回答
- 点击引用，定位到原文
- 提问无关问题，展示拒答

**4. 生成产物** (3 分钟)
- 生成大纲
- 生成测验并答题

**5. RAG 链路可视化** (2 分钟)
- 展示检索详情
- 查看 chunks 和分数
- 展示流程图

---

## 📞 需要帮助？

- 用户故事详情：`docs/stories/`
- 技术规格：`PROJECT_SPEC.md`
- 架构风险：`ARCHITECTURE_RISKS_QUICK_REF.md`
- 排期计划：`ROADMAP.md`

**记住**: Sprint Planning 是团队共同制定的计划，不是强制命令。根据实际情况灵活调整！
