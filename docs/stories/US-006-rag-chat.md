# US-006: 基于知识库的 RAG 问答

## 用户故事
作为一个**Notebook 所有者**，我希望能够**向 AI 提问并获得基于知识库的回答**，以便**快速获取文档中的信息**。

## 验收标准

### 场景 1：发送问题
- [ ] 当我在 Chat 面板输入问题并发送时，我应该看到：
  - 我的问题显示在对话历史中
  - AI 回复以流式方式逐字显示（打字机效果）
  - 回复完成后显示引用来源
- [ ] 输入框支持 Enter 发送，Shift+Enter 换行
- [ ] 发送时显示 loading 状态，禁用输入

### 场景 2：基于知识库回答（RAG 检索）

#### 2.1 检索流程
```
用户问题 → Embedding-3 生成 query embedding (1024维)
         → 调用 match_document_chunks RPC
         → 返回 topK 相关 chunks (默认 8 条)
         → 按 similarity 降序排列
         → 去重（同一 Source 的相邻 chunks 合并）
```

#### 2.2 检索参数
```typescript
{
  topK: 8,                    // 检索数量
  similarityThreshold: 0.3,   // 最低相似度阈值
  maxContextTokens: 4000,     // 上下文最大 token 数
}
```

#### 2.3 Source 过滤
- [ ] 如果用户勾选了特定 Sources，只从这些 Sources 检索
- [ ] 如果未勾选任何 Source，从 Notebook 内所有 `ready` 状态的 Sources 检索
- [ ] 检索时需要 JOIN sources 表获取 Source 标题

### 场景 3：Prompt 组装

#### 3.1 System Prompt
```
你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 只使用参考资料中的信息回答，不要编造内容
2. 如果参考资料中没有相关信息，请明确告知用户
3. 回答时引用具体来源，格式为 [来源名称]
4. 使用清晰、专业的语言
5. 如果问题不明确，可以请求用户澄清
```

#### 3.2 Context 格式
```
## 参考资料

### 来源 1: {sourceTitle}
{chunk.content}
---
相关度: {similarity}%

### 来源 2: {sourceTitle}
{chunk.content}
---
相关度: {similarity}%

...
```

#### 3.3 完整 Prompt 结构
```typescript
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `${contextSection}\n\n## 用户问题\n${userQuestion}` }
]
```

### 场景 4：流式响应

#### 4.1 使用 Vercel AI SDK
```typescript
import { streamText } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const zhipu = createOpenAICompatible({
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  name: 'zhipu',
  apiKey: process.env.ZHIPU_API_KEY,
})

const result = streamText({
  model: zhipu('glm-4-flash'),
  messages,
})

return result.toDataStreamResponse()
```

#### 4.2 前端使用 useChat
```typescript
import { useChat } from 'ai/react'

const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { notebookId, selectedSourceIds },
})
```

### 场景 5：引用展示（Citations）

#### 5.1 Citation 数据结构
```typescript
interface Citation {
  id: string              // chunk id
  sourceId: string        // Source UUID
  sourceTitle: string     // Source 标题
  sourceType: 'file' | 'url'
  content: string         // chunk 内容（前 150 字）
  similarity: number      // 相似度 (0-1)
  metadata: {
    page?: number         // PDF 页码
    chunkIndex: number    // chunk 序号
    startChar: number     // 起始字符位置
    endChar: number       // 结束字符位置
  }
}
```

#### 5.2 Citations 返回时机
- [ ] 在流式响应结束后，通过 `data` 字段返回 citations
- [ ] 使用 Vercel AI SDK 的 `StreamData` 追加元数据

```typescript
import { StreamData } from 'ai'

const data = new StreamData()

// 流结束后追加 citations
data.append({ citations })
data.close()

return result.toDataStreamResponse({ data })
```

#### 5.3 引用卡片展示
- [ ] 每条 AI 回复下方显示引用卡片列表
- [ ] 引用卡片包含：
  - Source 图标（PDF/网页/视频）
  - Source 名称
  - 相关度百分比（如 82%）
  - 内容预览（前 100 字 + ...）
- [ ] 点击引用卡片展开详情或跳转

### 场景 6：无依据拒答

#### 6.1 判断条件
```typescript
// 当最高相似度低于阈值时，判定为无依据
const hasEvidence = chunks.length > 0 && chunks[0].similarity >= 0.3
```

#### 6.2 无依据回复
- [ ] 当 `hasEvidence = false` 时，不调用 LLM
- [ ] 直接返回固定回复：
```
抱歉，我在您的资料中没有找到与这个问题相关的信息。

建议：
- 上传更多相关资料
- 尝试用不同的方式描述您的问题
- 检查已上传的资料是否包含相关内容
```
- [ ] 设置 `answerMode: 'no_evidence'`

### 场景 7：对话历史

#### 7.1 消息持久化
- [ ] 用户消息和 AI 回复都保存到 `messages` 表
- [ ] 保存字段：
  ```typescript
  {
    notebookId,
    role: 'user' | 'assistant',
    content: string,
    citations: Citation[] | null,  // 仅 assistant 消息
    answerMode: 'grounded' | 'no_evidence' | null,
    metadata: {
      retrievalMs: number,    // 检索耗时
      generationMs: number,   // 生成耗时
      model: string,          // 使用的模型
      topK: number,           // 检索数量
      chunkCount: number,     // 实际检索到的 chunk 数
    }
  }
  ```

#### 7.2 历史加载
- [ ] 进入 Notebook 时加载最近 50 条消息
- [ ] 支持滚动加载更多历史
- [ ] 每条消息显示相对时间（如"2分钟前"）

### 场景 8：建议问题（可选，二期）

- [ ] 当 Notebook 有 ready 状态的 Sources 时，自动生成 3-5 个建议问题
- [ ] 基于 Sources 内容生成（调用 LLM）
- [ ] 点击建议问题自动填充到输入框
- [ ] 建议问题保存到 `suggested_questions` 表

## 技术约束

### 依赖对接（US-005）
- `document_chunks` 表：存储向量化后的文档片段
- `match_document_chunks` RPC：向量检索函数
- `metadata` 字段结构：`{ page, startChar, endChar, tokenCount, sourceTitle, sourceType }`
- 向量维度：1024（必须与 Embedding-3 一致）

### API 配置
```typescript
// 智谱 AI
{
  baseUrl: 'https://open.bigmodel.cn/api',
  embeddingModel: 'embedding-3',
  chatModel: 'glm-4-flash',  // 或 glm-4.7
  embeddingDim: 1024,
}

// RAG 参数
{
  topK: 8,
  similarityThreshold: 0.3,
  maxContextTokens: 4000,
}
```

### 依赖库
- `ai`: Vercel AI SDK
- `@ai-sdk/openai-compatible`: OpenAI 兼容适配器

## API 端点

### POST /api/chat
发送消息并获取流式回复

**Request:**
```typescript
{
  messages: Array<{ role: string, content: string }>,
  notebookId: string,
  selectedSourceIds?: string[],  // 可选，指定检索的 Sources
}
```

**Response:** 
- Content-Type: `text/event-stream`
- 流式返回 AI 回复
- 流结束时返回 citations 元数据

### GET /api/notebooks/:id/messages
获取对话历史

**Query:**
```typescript
{
  limit?: number,   // 默认 50
  before?: string,  // 游标分页
}
```

**Response:**
```typescript
{
  messages: Message[],
  hasMore: boolean,
  nextCursor?: string,
}
```

## 依赖
- US-005 (文档向量化) ✅ 已完成
- `document_chunks` 表 ✅ 已创建
- `match_document_chunks` RPC ✅ 已创建
- `messages` 表 ✅ 已在 Prisma schema 中
- 智谱 API Key ✅ 已配置

## 优先级
🔴 P0 - Week 4

## 估算
8 Story Points (4天)

## 测试用例
1. 上传 AI 相关文档，问"什么是 Transformer" → 基于文档回答 + 显示引用
2. 问"今天天气如何" → 拒答并提示补充资料
3. 勾选特定 Source，提问 → 只从该 Source 检索
4. 检查 citations → 包含 sourceTitle、similarity、metadata
5. 刷新页面 → 对话历史保留
6. 检查 message 记录 → 包含 answerMode 和 metadata

## 架构风险关联
- 🔴 8.1 向量维度一致性（query embedding 必须是 1024 维）
- 🟡 8.3 Citations 去重（检索结果需要按 source_id 去重相邻 chunks）
- 🟡 8.4 流式 Citations 时序（必须在流结束后通过 StreamData 追加）

## 实现计划

### Day 1: 基础设施
- [x] 安装依赖：ai, @ai-sdk/openai-compatible
- [x] 创建 RAG 检索模块 `lib/rag/retriever.ts`
- [x] 创建 Prompt 组装模块 `lib/rag/prompt.ts`

### Day 2: Chat API
- [x] 实现 `POST /api/chat` 流式接口
- [x] 实现检索 → 组装 → 生成 → 返回流程
- [x] 实现 citations 追加逻辑
- [x] 实现消息持久化

### Day 3: 前端组件
- [x] 创建 ChatPanel 组件
- [x] 使用 useChat hook 对接 API
- [x] 实现消息列表展示
- [x] 实现引用卡片组件

### Day 4: 完善和测试
- [x] 实现对话历史加载
- [ ] 实现 Source 过滤（UI 待完善）
- [x] 实现无依据拒答
- [ ] 集成测试

## 已实现的文件

```
lib/rag/
├── index.ts           # 模块导出
├── retriever.ts       # RAG 检索模块
└── prompt.ts          # Prompt 组装模块

app/api/
├── chat/route.ts                    # Chat API（流式）
└── notebooks/[id]/messages/route.ts # 消息历史 API

components/notebook/
├── chat-panel.tsx     # Chat 面板组件
└── notebook-content.tsx # 更新使用 ChatPanel
```
