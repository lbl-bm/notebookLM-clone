# US-008: Studio 动作生成产物

## 用户故事
作为一个**Notebook 用户**，我希望能够**一键生成结构化产物（摘要/大纲/测验/思维导图）**，以便**快速整理和复习知识**。

## 验收标准

### 场景 1：查看可用动作
- [ ] 当我打开 Notebook 详情页右侧 Studio 面板时，我应该看到：
  - Studio 标题旁边有一个模式选择下拉框：
    - ⚡ 快速模式（默认）- 智能采样，速度快
    - 🎯 精准模式 - Map-Reduce，覆盖更全面
  - 📄 生成摘要 - "将资料浓缩为简洁摘要"
  - 📋 生成大纲 - "提取结构化知识框架"
  - 📝 生成测验 - "生成选择题测试理解"
  - 🧠 生成思维导图 - "可视化知识结构"
- [ ] 每个动作按钮应该显示简短描述
- [ ] 如果没有 ready 状态的 Sources，按钮应该禁用并提示"请先上传资料"
- [ ] 按钮下方显示"基于 X 个来源"（ready 状态的 Source 数量）
- [ ] 模式选择下拉框 hover 时显示 Tooltip 说明两种模式的区别

### 场景 2：生成摘要
- [ ] 当我点击"生成摘要"时：
  - 按钮显示加载状态（Spinner + "生成中..."）
  - 其他动作按钮临时禁用
  - 生成完成后，产物出现在下方产物列表顶部
  - 产物自动展开显示内容
- [ ] 摘要格式（Markdown）：
  ```markdown
  ## 内容摘要
  
  ### 核心主题
  本资料主要介绍了...
  
  ### 关键要点
  1. **要点一**：说明...
  2. **要点二**：说明...
  
  ### 总结
  综上所述，...
  ```

### 场景 3：生成大纲
- [ ] 当我点击"生成大纲"时：
  - 显示加载状态
  - 生成完成后产物出现在列表顶部
- [ ] 大纲格式（Markdown）：
  ```markdown
  ## 知识大纲
  
  ### 一、[主题一]
  - 1.1 [子主题]
    - 要点说明
  - 1.2 [子主题]
  
  ### 二、[主题二]
  - 2.1 [子主题]
  ```

### 场景 4：生成测验
- [ ] 点击"生成测验"后，应该生成 5-10 道选择题
- [ ] 测验数据格式（JSON）：
  ```typescript
  interface Quiz {
    title: string
    questions: Array<{
      id: string
      question: string
      options: string[]  // ["A. ...", "B. ...", "C. ...", "D. ..."]
      answer: string     // "A" | "B" | "C" | "D"
      explanation: string
    }>
  }
  ```
- [ ] UI 渲染为可交互的测验界面：
  - 显示题目和选项（单选）
  - 选择后显示正确/错误反馈
  - 显示解析
  - 底部显示得分统计（如 "8/10 正确"）
- [ ] 支持"重新测验"按钮

### 场景 5：生成思维导图
- [ ] 点击"生成思维导图"后，生成可视化的知识结构图
- [ ] 思维导图数据格式（JSON）：
  ```typescript
  interface MindMap {
    title: string
    root: MindMapNode
  }
  
  interface MindMapNode {
    id: string
    label: string
    children?: MindMapNode[]
    description?: string  // 节点详细说明（hover 显示）
  }
  ```
- [ ] UI 渲染为可交互的思维导图：
  - 使用树形布局或放射状布局
  - 支持节点展开/收起
  - 支持缩放和拖拽
  - 悬停节点显示详细说明
  - 支持导出为 PNG 图片
- [ ] 思维导图层级：最多 4 级（根节点 + 3 级子节点）

### 场景 6：产物管理
- [ ] 产物列表显示：
  - 产物类型图标（📄摘要/📋大纲/📝测验/🧠思维导图）
  - 产物标题（自动生成或"摘要 #1"）
  - 生成时间（相对时间，如"2分钟前"）
  - 预览（前 80 字 + ...，思维导图显示节点数）
- [ ] 点击产物卡片展开/收起完整内容
- [ ] 产物操作：
  - 📋 复制内容到剪贴板（显示 Toast 提示）
  - 📥 导出（思维导图支持导出 PNG）
  - 🗑️ 删除产物（需确认）
- [ ] 产物列表按创建时间倒序排列

### 场景 7：选择 Sources 范围（二期）
- [ ] 在左侧 Sources 列表中可勾选特定 Sources
- [ ] Studio 面板显示"已选择 X 个来源"
- [ ] 如果勾选了 Sources，只基于这些 Sources 生成产物
- [ ] 如果未勾选，基于所有 ready 状态的 Sources

### 场景 8：产物持久化
- [ ] 生成的产物保存到 `artifacts` 表
- [ ] 刷新页面后产物列表保留
- [ ] 删除产物后从数据库移除

### 场景 9：错误处理
- [ ] API 调用失败时显示错误 Toast
- [ ] 生成超时（60秒）时显示超时提示并支持重试
- [ ] 网络错误时提示"网络连接失败，请重试"
- [ ] JSON 解析失败时显示"生成格式异常，请重试"

## 技术约束

### 数据库表结构（已存在）
```prisma
model Artifact {
  id         String   @id @default(uuid())
  notebookId String
  type       String   // 'summary' | 'outline' | 'quiz' | 'mindmap'
  input      Json     // { sourceIds: string[], prompt: string }
  content    String   @db.Text // Markdown 或 JSON
  createdAt  DateTime @default(now())

  notebook   Notebook @relation(...)
  @@map("artifacts")
}
```

### LLM 配置
```typescript
// lib/config.ts 已配置
{
  model: 'glm-4-flash',
  baseUrl: 'https://open.bigmodel.cn/api',
  apiKey: process.env.ZHIPU_API_KEY
}
```

### Prompt 模板

#### 摘要 Prompt
```typescript
const SUMMARY_PROMPT = `你是一个专业的内容摘要助手。请基于以下资料生成一份结构化摘要。

要求：
1. 提取核心主题和关键要点（3-5个）
2. 使用 Markdown 格式
3. 保持客观准确，不添加资料中没有的信息
4. 摘要长度控制在 300-500 字

输出格式：
## 内容摘要

### 核心主题
[一句话概括主题]

### 关键要点
1. **[要点一]**：[说明]
2. **[要点二]**：[说明]
3. **[要点三]**：[说明]

### 总结
[总结性陈述]

---
以下是参考资料：
{context}`
```

#### 大纲 Prompt
```typescript
const OUTLINE_PROMPT = `你是一个专业的知识整理助手。请基于以下资料生成一份结构化大纲。

要求：
1. 提取主要主题和子主题
2. 使用层级结构（最多 3 级）
3. 每个要点简洁明了
4. 使用 Markdown 格式

输出格式：
## 知识大纲

### 一、[主题一]
- 1.1 [子主题]
  - 要点说明
- 1.2 [子主题]

### 二、[主题二]
...

---
以下是参考资料：
{context}`
```

#### 测验 Prompt
```typescript
const QUIZ_PROMPT = `你是一个专业的教育测验设计师。请基于以下资料生成 5-10 道选择题。

要求：
1. 题目覆盖资料的主要知识点
2. 每题 4 个选项（A/B/C/D）
3. 难度适中，考察理解而非记忆
4. 提供详细解析

输出格式（严格 JSON，不要有其他内容）：
{
  "title": "知识测验",
  "questions": [
    {
      "id": "q1",
      "question": "问题内容？",
      "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
      "answer": "A",
      "explanation": "解析：正确答案是 A，因为..."
    }
  ]
}

---
以下是参考资料：
{context}`
```

#### 思维导图 Prompt
```typescript
const MINDMAP_PROMPT = `你是一个专业的知识可视化助手。请基于以下资料生成一份思维导图结构。

要求：
1. 提取核心概念作为根节点
2. 按逻辑关系组织子节点（最多 4 级）
3. 每个节点标签简洁（不超过 15 字）
4. 可选添加节点描述（详细说明）
5. 每个父节点下最多 6 个子节点

输出格式（严格 JSON，不要有其他内容）：
{
  "title": "知识结构图",
  "root": {
    "id": "root",
    "label": "核心主题",
    "description": "主题的详细说明",
    "children": [
      {
        "id": "1",
        "label": "分支一",
        "description": "分支说明",
        "children": [
          { "id": "1-1", "label": "子节点", "description": "说明" }
        ]
      }
    ]
  }
}

---
以下是参考资料：
{context}`
```

### 内容获取策略（智能采样）
```typescript
/**
 * 智能内容采样 - 规避 Token 限制风险
 * 策略：优先采样每个 Source 的开头和结尾 chunks，确保覆盖全面
 */
async function getSourceContentSmart(notebookId: string, sourceIds?: string[]) {
  // 1. 获取所有 ready 状态的 Sources
  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true, title: true },
  })

  if (sources.length === 0) {
    throw new Error('NO_SOURCES')
  }

  // 2. 每个 Source 采样策略：开头 3 个 + 结尾 2 个 chunks
  const CHUNKS_PER_SOURCE_HEAD = 3
  const CHUNKS_PER_SOURCE_TAIL = 2
  const MAX_TOTAL_CHUNKS = 40

  const allChunks: Array<{ content: string; sourceTitle: string }> = []

  for (const source of sources) {
    // 获取该 Source 的 chunk 总数
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM document_chunks 
      WHERE source_id = ${source.id}::uuid
    `
    const totalChunks = Number(countResult[0].count)

    // 获取开头 chunks
    const headChunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT content FROM document_chunks
      WHERE source_id = ${source.id}::uuid
      ORDER BY chunk_index ASC
      LIMIT ${CHUNKS_PER_SOURCE_HEAD}
    `

    // 获取结尾 chunks（如果总数足够）
    let tailChunks: Array<{ content: string }> = []
    if (totalChunks > CHUNKS_PER_SOURCE_HEAD + CHUNKS_PER_SOURCE_TAIL) {
      tailChunks = await prisma.$queryRaw<Array<{ content: string }>>`
        SELECT content FROM document_chunks
        WHERE source_id = ${source.id}::uuid
        ORDER BY chunk_index DESC
        LIMIT ${CHUNKS_PER_SOURCE_TAIL}
      `
      tailChunks.reverse()
    }

    // 合并
    for (const c of headChunks) {
      allChunks.push({ content: c.content, sourceTitle: source.title })
    }
    for (const c of tailChunks) {
      allChunks.push({ content: c.content, sourceTitle: source.title })
    }

    // 检查是否超出总限制
    if (allChunks.length >= MAX_TOTAL_CHUNKS) break
  }

  // 3. 组装上下文
  return allChunks.slice(0, MAX_TOTAL_CHUNKS).map((c, i) =>
    `### 来源 ${i + 1}: ${c.sourceTitle}\n${c.content}`
  ).join('\n\n---\n\n')
}
```

### Token 限制处理（增强版）
```typescript
// 估算 token 数（中文约 1.5-2 字符/token，英文约 4 字符/token）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

// 最大上下文 token 数（为输出预留空间）
const MAX_CONTEXT_TOKENS = 5000
const MAX_OUTPUT_TOKENS = 2000

// 智能截断：保留完整的 Source 块
function truncateContextSmart(context: string): string {
  const tokens = estimateTokens(context)
  if (tokens <= MAX_CONTEXT_TOKENS) return context

  // 按 Source 块分割
  const blocks = context.split('\n\n---\n\n')
  let result = ''
  let currentTokens = 0

  for (const block of blocks) {
    const blockTokens = estimateTokens(block)
    if (currentTokens + blockTokens > MAX_CONTEXT_TOKENS) {
      break
    }
    result += (result ? '\n\n---\n\n' : '') + block
    currentTokens += blockTokens
  }

  return result + '\n\n[部分内容已省略，基于以上内容生成]'
}
```

### JSON 解析容错处理
```typescript
/**
 * 安全解析 JSON - 规避 JSON 解析风险
 * 处理 LLM 可能返回的各种格式问题
 */
function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    // 1. 尝试直接解析
    return JSON.parse(text)
  } catch {
    try {
      // 2. 尝试提取 JSON 块（处理 markdown 代码块包裹）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim())
      }

      // 3. 尝试提取 { } 或 [ ] 包裹的内容
      const objectMatch = text.match(/\{[\s\S]*\}/)
      const arrayMatch = text.match(/\[[\s\S]*\]/)
      const match = objectMatch || arrayMatch
      if (match) {
        return JSON.parse(match[0])
      }
    } catch {
      // 解析失败
    }

    console.error('[JSON Parse] 解析失败，使用 fallback:', text.slice(0, 200))
    return fallback
  }
}

// 测验 fallback
const QUIZ_FALLBACK: Quiz = {
  title: '知识测验',
  questions: [{
    id: 'q1',
    question: '生成失败，请重试',
    options: ['A. 重试', 'B. 重试', 'C. 重试', 'D. 重试'],
    answer: 'A',
    explanation: '请点击重新生成'
  }]
}

// 思维导图 fallback
const MINDMAP_FALLBACK: MindMap = {
  title: '知识结构',
  root: {
    id: 'root',
    label: '生成失败',
    description: '请重试',
    children: []
  }
}
```

### 生成超时处理
```typescript
/**
 * 带超时的 LLM 调用 - 规避生成时间风险
 */
async function generateWithTimeout(
  prompt: string,
  timeoutMs: number = 60000
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${zhipuConfig.baseUrl}/paas/v4/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zhipuConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: zhipuConfig.chatModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    clearTimeout(timeoutId)
    if ((error as Error).name === 'AbortError') {
      throw new Error('TIMEOUT')
    }
    throw error
  }
}
```

### 思维导图渲染方案

#### 方案选型：React Flow
```typescript
// 使用 @xyflow/react（原 react-flow）渲染思维导图
// 优点：轻量、可定制、支持缩放拖拽、社区活跃

// 安装依赖
// npm install @xyflow/react

// 数据转换：MindMap JSON → React Flow Nodes/Edges
function mindmapToFlow(mindmap: MindMap): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  
  function traverse(node: MindMapNode, level: number, parentId?: string, index: number = 0) {
    const nodeId = node.id
    
    // 计算位置（简单的树形布局）
    const x = level * 250
    const y = index * 80
    
    nodes.push({
      id: nodeId,
      type: 'mindmapNode',
      position: { x, y },
      data: { 
        label: node.label, 
        description: node.description,
        level 
      },
    })
    
    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
      })
    }
    
    node.children?.forEach((child, i) => {
      traverse(child, level + 1, nodeId, i)
    })
  }
  
  traverse(mindmap.root, 0)
  return { nodes, edges }
}
```

#### 自定义节点样式
```tsx
// components/notebook/mindmap-node.tsx
const MindMapNode = ({ data }: { data: { label: string; description?: string; level: number } }) => {
  const bgColors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500']
  const bgColor = bgColors[data.level % bgColors.length]
  
  return (
    <Tooltip title={data.description}>
      <div className={`px-4 py-2 rounded-lg ${bgColor} text-white shadow-md 
        ${data.level === 0 ? 'text-lg font-bold' : 'text-sm'}`}>
        {data.label}
      </div>
    </Tooltip>
  )
}
```

#### 导出 PNG 功能
```typescript
import { toPng } from 'html-to-image'

async function exportMindmapToPng(elementId: string, filename: string) {
  const element = document.getElementById(elementId)
  if (!element) return
  
  const dataUrl = await toPng(element, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
  })
  
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = dataUrl
  link.click()
}
```

## API 端点

### POST /api/studio/generate
生成产物（统一入口）

**Request:**
```typescript
{
  notebookId: string
  type: 'summary' | 'outline' | 'quiz' | 'mindmap'
  sourceIds?: string[]  // 可选，指定 Sources
  mode: 'fast' | 'precise'  // 生成模式：快速/精准
}
```

**Response:**
```typescript
{
  artifact: {
    id: string
    type: string
    content: string  // Markdown 或 JSON 字符串
    createdAt: string
  }
  stats: {
    mode: 'fast' | 'precise'
    strategy: string  // 'smart_sampling' | 'map_reduce'
    totalChunks: number
    usedChunks: number
    duration: number  // 耗时（毫秒）
  }
}
```

**Error Response:**
```typescript
{
  error: string
  code: 'NO_SOURCES' | 'GENERATION_FAILED' | 'TIMEOUT' | 'PARSE_ERROR'
}
```

### GET /api/notebooks/:id/artifacts
获取产物列表

### DELETE /api/artifacts/:id
删除产物

## UI 组件结构

```
components/notebook/
├── studio-panel.tsx           # Studio 面板主组件（含模式选择下拉框）
├── studio-mode-select.tsx     # 模式选择下拉框组件
├── studio-actions.tsx         # 动作按钮组
├── artifact-list.tsx          # 产物列表
├── artifact-card.tsx          # 产物卡片（可展开）
├── quiz-viewer.tsx            # 测验交互组件
├── mindmap-viewer.tsx         # 思维导图组件
├── mindmap-node.tsx           # 思维导图自定义节点
└── markdown-viewer.tsx        # Markdown 渲染（复用 XMarkdown）
```

### Studio 面板头部布局
```tsx
// Studio 标题栏布局示意
<div className="flex items-center justify-between">
  <h3 className="font-semibold">Studio</h3>
  <StudioModeSelect value={mode} onChange={setMode} />
</div>
```

### 模式选择组件
```tsx
// components/notebook/studio-mode-select.tsx
import { Select, Tooltip } from 'antd'
import { Zap, Target } from 'lucide-react'

type StudioMode = 'fast' | 'precise'

interface StudioModeSelectProps {
  value: StudioMode
  onChange: (mode: StudioMode) => void
}

export function StudioModeSelect({ value, onChange }: StudioModeSelectProps) {
  return (
    <Tooltip 
      title={
        <div className="text-xs">
          <p><strong>⚡ 快速模式</strong>：智能采样，5-15秒</p>
          <p><strong>🎯 精准模式</strong>：Map-Reduce，30-90秒</p>
        </div>
      }
    >
      <Select
        value={value}
        onChange={onChange}
        size="small"
        style={{ width: 120 }}
        options={[
          { 
            value: 'fast', 
            label: (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" /> 快速模式
              </span>
            )
          },
          { 
            value: 'precise', 
            label: (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" /> 精准模式
              </span>
            )
          },
        ]}
      />
    </Tooltip>
  )
}
```

## 依赖
- US-005 (文档向量化) - 需要 `document_chunks` 表数据
- US-006 (RAG 问答) - 复用 LLM 调用逻辑
- `artifacts` 表已在 Prisma schema 中定义
- 智谱 API Key 已配置
- 新增依赖：`@xyflow/react`（思维导图）、`html-to-image`（导出 PNG）

## 优先级
P1 - Week 5

## 估算
10 Story Points (5天)

## 实现计划

### Day 1: API 层
- [ ] 创建 `lib/studio/prompts.ts` - Prompt 模板
- [ ] 创建 `lib/studio/content.ts` - 智能内容采样
- [ ] 创建 `lib/studio/generator.ts` - 内容生成逻辑（含超时和容错）
- [ ] 实现 `POST /api/studio/generate` API
- [ ] 实现 `GET /api/notebooks/:id/artifacts` API
- [ ] 实现 `DELETE /api/artifacts/:id` API

### Day 2: UI 组件 - 基础
- [ ] 安装依赖：`@xyflow/react`, `html-to-image`
- [ ] 创建 `StudioPanel` 组件替换现有占位
- [ ] 创建 `StudioActions` 动作按钮组
- [ ] 创建 `ArtifactList` 产物列表
- [ ] 创建 `ArtifactCard` 产物卡片

### Day 3: UI 组件 - 摘要/大纲/测验
- [ ] 实现摘要/大纲的 Markdown 渲染（复用 XMarkdown）
- [ ] 创建 `QuizViewer` 测验交互组件
- [ ] 实现复制到剪贴板功能
- [ ] 实现删除确认对话框

### Day 4: UI 组件 - 思维导图
- [ ] 创建 `MindMapViewer` 组件
- [ ] 创建 `MindMapNode` 自定义节点
- [ ] 实现缩放、拖拽、展开/收起
- [ ] 实现导出 PNG 功能

### Day 5: 集成和测试
- [ ] 集成到 `NotebookContent`
- [ ] 加载状态和错误处理
- [ ] 端到端测试
- [ ] 性能优化（防抖、缓存）

## 测试用例
1. 上传 AI 文档，点击"生成摘要" → 生成结构化摘要，Markdown 正确渲染
2. 点击"生成大纲" → 生成层级大纲
3. 点击"生成测验" → 生成 5-10 道题目，可交互答题，显示得分
4. 点击"生成思维导图" → 生成可视化结构图，支持缩放拖拽
5. 导出思维导图 → 下载 PNG 图片
6. 复制产物内容 → 剪贴板包含完整内容
7. 删除产物 → 确认后从列表消失
8. 刷新页面 → 产物列表保留
9. 无 ready Sources → 按钮禁用，显示提示
10. 生成超时 → 显示超时提示，支持重试
11. JSON 解析失败 → 显示 fallback 内容，提示重试
12. 切换到精准模式 → 下拉框显示"🎯 精准模式"
13. 精准模式生成摘要 → 使用 Map-Reduce，耗时更长但覆盖更全
14. 快速模式生成摘要 → 使用智能采样，速度更快
15. 刷新页面 → 模式选择保留（localStorage）
16. 查看生成统计 → 显示使用的策略、chunks 数量和耗时

## 架构风险及规避方案

### 风险 1：Token 限制（大量 Sources 时超出上下文限制）
**规避方案：智能采样**
- 每个 Source 只采样开头 3 个 + 结尾 2 个 chunks
- 总 chunks 数限制在 40 个以内
- 智能截断保留完整的 Source 块
- 为输出预留 2000 tokens 空间

### 风险 2：生成时间过长（复杂内容可能需要 30-60 秒）
**规避方案：超时控制 + 用户反馈**
- 设置 60 秒超时限制
- 使用 AbortController 中断请求
- 显示进度提示（"正在生成，预计需要 30 秒..."）
- 超时后提供重试按钮

### 风险 3：JSON 解析失败（LLM 返回非法 JSON）
**规避方案：多层容错解析**
- 第一层：直接 JSON.parse
- 第二层：提取 markdown 代码块中的 JSON
- 第三层：正则提取 {} 或 [] 包裹的内容
- 最终：使用预定义的 fallback 数据
- 记录解析失败日志，便于优化 Prompt

### 风险 4：思维导图布局混乱（节点过多或层级过深）
**规避方案：限制 + 自动布局**
- Prompt 中限制最多 4 级、每级最多 6 个子节点
- 使用 dagre 算法自动计算布局
- 支持节点展开/收起，默认只展开前 2 级
- 提供"重置视图"按钮

### 风险 5：并发生成导致资源竞争
**规避方案：前端防抖 + 状态锁**
- 生成中禁用所有动作按钮
- 使用 loading 状态防止重复点击
- 后端可选：使用队列限制并发数

## 文件清单（预计新增）

```
lib/studio/
├── index.ts              # 模块导出
├── prompts.ts            # Prompt 模板（4 种类型）
├── content.ts            # 智能内容采样 + Map-Reduce
├── generator.ts          # 内容生成（含超时和容错）
└── parser.ts             # JSON 安全解析

app/api/
├── studio/generate/route.ts           # 生成产物 API
├── notebooks/[id]/artifacts/route.ts  # 获取产物列表
└── artifacts/[id]/route.ts            # 删除产物

components/notebook/
├── studio-panel.tsx       # Studio 面板（含模式选择）
├── studio-mode-select.tsx # 模式选择下拉框
├── studio-actions.tsx     # 动作按钮
├── artifact-list.tsx      # 产物列表
├── artifact-card.tsx      # 产物卡片
├── quiz-viewer.tsx        # 测验组件
├── mindmap-viewer.tsx     # 思维导图组件
└── mindmap-node.tsx       # 思维导图节点

hooks/
└── use-studio-mode.ts     # 模式状态管理（localStorage 持久化）
```


---

## 文档评估与补充

### 发现的漏洞和遗漏

#### 1. 产物编辑功能缺失
- [ ] 用户可能需要编辑生成的产物（修正错误、补充内容）
- **补充方案**：二期支持产物编辑，保存编辑历史

#### 2. 产物重新生成
- [ ] 对同一内容重新生成时，是否覆盖还是新建？
- **补充方案**：每次生成都创建新产物，用户可删除旧的

#### 3. 产物数量限制
- [ ] 单个 Notebook 的产物数量是否有上限？
- **补充方案**：限制每个 Notebook 最多 10 个产物，超出提示删除旧产物

#### 4. 测验状态持久化
- [ ] 用户答题进度是否保存？刷新后是否保留？
- **补充方案**：答题状态仅保存在前端 localStorage，刷新后可恢复

#### 5. 思维导图编辑
- [ ] 用户是否可以手动调整节点位置？
- **补充方案**：一期只支持查看，二期支持拖拽编辑节点

#### 6. 多语言支持
- [ ] Prompt 是否需要支持英文资料？
- **补充方案**：Prompt 中添加"根据资料语言自动选择输出语言"

#### 7. 产物分享功能
- [ ] 用户是否可以分享产物给他人？
- **补充方案**：二期支持生成分享链接（只读）

#### 8. API 权限校验遗漏
- [ ] 删除产物时需要校验是否属于当前用户
- **补充方案**：API 中添加 notebook.ownerId === userId 校验

#### 9. 产物标题自定义
- [ ] 用户可能想给产物起一个有意义的名字
- **补充方案**：支持点击标题编辑，默认为"摘要 #1"格式

#### 10. 生成进度反馈
- [ ] 长时间生成时用户不知道进度
- **补充方案**：显示预估时间和已用时间

---

## Token 限制的更优方案

### 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **智能采样** | 简单、快速 | 可能丢失中间重要内容 | 内容结构清晰的文档 |
| **Map-Reduce** | 覆盖全面、质量高 | 多次 API 调用、耗时长、成本高 | 大型文档、高质量要求 |
| **语义聚类采样** | 覆盖多样性好 | 实现复杂、需要额外计算 | 内容主题分散的文档 |
| **摘要链** | 保留全部信息 | 多轮调用、可能信息损失 | 超长文档 |

### 推荐方案：分层策略（智能采样 + 可选 Map-Reduce）

```typescript
/**
 * 分层内容获取策略
 * 
 * Level 1: 快速模式（默认）- 智能采样
 * Level 2: 精准模式（可选）- Map-Reduce
 */

// ============================================
// Level 1: 智能采样（已有方案，适合大多数场景）
// ============================================
// 见上文 getSourceContentSmart()

// ============================================
// Level 2: Map-Reduce 模式（高质量场景）
// ============================================

interface MapReduceOptions {
  notebookId: string
  sourceIds?: string[]
  type: 'summary' | 'outline' | 'quiz' | 'mindmap'
}

/**
 * Map-Reduce 生成策略
 * 
 * 流程：
 * 1. Map: 对每个 Source 单独生成摘要/要点
 * 2. Reduce: 合并所有摘要，生成最终产物
 * 
 * 优点：覆盖全部内容，质量更高
 * 缺点：多次 API 调用，耗时 2-3 倍
 */
async function generateWithMapReduce(options: MapReduceOptions): Promise<string> {
  const { notebookId, sourceIds, type } = options

  // 1. 获取所有 Sources
  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true, title: true },
  })

  if (sources.length === 0) {
    throw new Error('NO_SOURCES')
  }

  // 2. Map 阶段：对每个 Source 生成中间摘要
  const mapPrompt = getMapPrompt(type)
  const intermediateResults: string[] = []

  for (const source of sources) {
    // 获取该 Source 的所有 chunks（限制数量）
    const chunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT content FROM document_chunks
      WHERE source_id = ${source.id}::uuid
      ORDER BY chunk_index ASC
      LIMIT 20
    `

    const sourceContent = chunks.map(c => c.content).join('\n\n')
    const truncated = truncateContextSmart(sourceContent)

    // 生成该 Source 的中间结果
    const prompt = mapPrompt.replace('{source_title}', source.title)
                            .replace('{content}', truncated)
    
    const result = await generateWithTimeout(prompt, 30000)
    intermediateResults.push(`## ${source.title}\n${result}`)
  }

  // 3. Reduce 阶段：合并所有中间结果
  const reducePrompt = getReducePrompt(type)
  const combinedInput = intermediateResults.join('\n\n---\n\n')
  const truncatedCombined = truncateContextSmart(combinedInput)

  const finalPrompt = reducePrompt.replace('{intermediate_results}', truncatedCombined)
  return await generateWithTimeout(finalPrompt, 60000)
}

/**
 * Map 阶段 Prompt（针对单个 Source）
 */
function getMapPrompt(type: string): string {
  const prompts: Record<string, string> = {
    summary: `请为以下来源 "{source_title}" 提取 3-5 个关键要点：

{content}

输出格式：
- 要点1：...
- 要点2：...
- 要点3：...`,

    outline: `请为以下来源 "{source_title}" 提取主要主题和结构：

{content}

输出格式：
### {source_title}
- 主题1
  - 子主题
- 主题2`,

    quiz: `请基于以下来源 "{source_title}" 生成 2-3 道选择题（JSON 格式）：

{content}`,

    mindmap: `请为以下来源 "{source_title}" 提取核心概念和关系：

{content}

输出格式：
- 核心概念：...
- 子概念1：...
- 子概念2：...`,
  }
  return prompts[type] || prompts.summary
}

/**
 * Reduce 阶段 Prompt（合并所有中间结果）
 */
function getReducePrompt(type: string): string {
  const prompts: Record<string, string> = {
    summary: `请将以下多个来源的要点合并为一份完整的结构化摘要：

{intermediate_results}

输出格式：
## 内容摘要
### 核心主题
...
### 关键要点
1. ...
2. ...
### 总结
...`,

    outline: `请将以下多个来源的结构合并为一份完整的知识大纲：

{intermediate_results}

输出格式：
## 知识大纲
### 一、...
### 二、...`,

    quiz: `请将以下题目整合为一份完整的测验（5-10题，JSON格式）：

{intermediate_results}`,

    mindmap: `请将以下概念整合为一份思维导图结构（JSON格式）：

{intermediate_results}`,
  }
  return prompts[type] || prompts.summary
}
```

### 方案 3：语义聚类采样（高级）

```typescript
/**
 * 语义聚类采样
 * 
 * 原理：使用 embedding 对 chunks 进行聚类，每个聚类选取代表性样本
 * 优点：确保内容多样性，避免重复
 * 缺点：需要额外的聚类计算
 */
async function getContentBySemanticClustering(
  notebookId: string,
  sourceIds?: string[],
  numClusters: number = 8
): Promise<string> {
  // 1. 获取所有 chunks 的 embedding
  const chunks = await prisma.$queryRaw<Array<{
    id: bigint
    content: string
    embedding: number[]
    source_title: string
  }>>`
    SELECT c.id, c.content, c.embedding, s.title as source_title
    FROM document_chunks c
    JOIN sources s ON c.source_id = s.id::uuid
    WHERE c.notebook_id = ${notebookId}::uuid
      AND s.status = 'ready'
      ${sourceIds ? Prisma.sql`AND s.id = ANY(${sourceIds}::uuid[])` : Prisma.empty}
    LIMIT 200
  `

  if (chunks.length <= numClusters) {
    // chunks 数量少，直接返回全部
    return chunks.map((c, i) => 
      `### 来源 ${i + 1}: ${c.source_title}\n${c.content}`
    ).join('\n\n---\n\n')
  }

  // 2. K-Means 聚类（简化版，使用余弦相似度）
  const clusters = kMeansClustering(
    chunks.map(c => c.embedding),
    numClusters
  )

  // 3. 每个聚类选取最接近中心的样本
  const selectedIndices = clusters.map(cluster => {
    // 找到最接近聚类中心的点
    return cluster.memberIndices[0] // 简化：取第一个
  })

  // 4. 组装上下文
  const selectedChunks = selectedIndices.map(i => chunks[i])
  return selectedChunks.map((c, i) =>
    `### 来源 ${i + 1}: ${c.source_title}\n${c.content}`
  ).join('\n\n---\n\n')
}

/**
 * 简化的 K-Means 聚类
 */
function kMeansClustering(
  embeddings: number[][],
  k: number
): Array<{ centroid: number[]; memberIndices: number[] }> {
  // 实现省略，可使用 ml-kmeans 库
  // npm install ml-kmeans
  return []
}
```

### 推荐的最终方案：自适应策略

```typescript
/**
 * 自适应内容获取策略
 * 
 * 根据内容量自动选择最佳方案：
 * - 小型（<10 chunks）：全量
 * - 中型（10-50 chunks）：智能采样
 * - 大型（>50 chunks）：Map-Reduce 或 语义聚类
 */
async function getContentAdaptive(
  notebookId: string,
  sourceIds?: string[],
  options?: {
    preferQuality?: boolean  // 优先质量（使用 Map-Reduce）
    maxTokens?: number
  }
): Promise<{ content: string; strategy: string; stats: ContentStats }> {
  const { preferQuality = false, maxTokens = 5000 } = options || {}

  // 1. 统计 chunks 数量
  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count 
    FROM document_chunks c
    JOIN sources s ON c.source_id = s.id::uuid
    WHERE c.notebook_id = ${notebookId}::uuid
      AND s.status = 'ready'
      ${sourceIds ? Prisma.sql`AND s.id = ANY(${sourceIds}::uuid[])` : Prisma.empty}
  `
  const totalChunks = Number(countResult[0].count)

  // 2. 根据数量选择策略
  let content: string
  let strategy: string

  if (totalChunks === 0) {
    throw new Error('NO_SOURCES')
  }

  if (totalChunks <= 10) {
    // 小型：全量获取
    content = await getFullContent(notebookId, sourceIds)
    strategy = 'full'
  } else if (totalChunks <= 50 && !preferQuality) {
    // 中型：智能采样
    content = await getSourceContentSmart(notebookId, sourceIds)
    strategy = 'smart_sampling'
  } else if (preferQuality) {
    // 大型 + 优先质量：Map-Reduce（返回标记，由调用方处理）
    strategy = 'map_reduce'
    content = '' // Map-Reduce 需要特殊处理
  } else {
    // 大型：智能采样 + 截断
    content = await getSourceContentSmart(notebookId, sourceIds)
    content = truncateContextSmart(content)
    strategy = 'smart_sampling_truncated'
  }

  return {
    content,
    strategy,
    stats: {
      totalChunks,
      usedChunks: strategy === 'full' ? totalChunks : Math.min(40, totalChunks),
      estimatedTokens: estimateTokens(content),
    }
  }
}

interface ContentStats {
  totalChunks: number
  usedChunks: number
  estimatedTokens: number
}
```

### UI 层面的优化

```typescript
// 在 Studio 面板中显示内容统计和策略选择

interface StudioActionsProps {
  notebookId: string
  readySourceCount: number
  totalChunks: number  // 新增：总 chunks 数
}

function StudioActions({ notebookId, readySourceCount, totalChunks }: StudioActionsProps) {
  const [preferQuality, setPreferQuality] = useState(false)

  // 显示内容量提示
  const contentSizeHint = useMemo(() => {
    if (totalChunks <= 10) return '内容较少，将使用全部资料'
    if (totalChunks <= 50) return '内容适中，将智能采样关键部分'
    return '内容较多，建议开启精准模式以获得更好效果'
  }, [totalChunks])

  return (
    <div className="space-y-4">
      {/* 内容量提示 */}
      <div className="text-xs text-muted-foreground">
        {contentSizeHint}
        <span className="ml-2 text-slate-400">
          ({totalChunks} 个片段)
        </span>
      </div>

      {/* 精准模式开关（大内容量时显示） */}
      {totalChunks > 50 && (
        <div className="flex items-center gap-2">
          <Switch
            checked={preferQuality}
            onCheckedChange={setPreferQuality}
          />
          <span className="text-sm">精准模式</span>
          <Tooltip title="使用 Map-Reduce 策略，覆盖更全面但耗时更长">
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Tooltip>
        </div>
      )}

      {/* 动作按钮 */}
      <ActionButton type="summary" preferQuality={preferQuality} />
      <ActionButton type="outline" preferQuality={preferQuality} />
      <ActionButton type="quiz" preferQuality={preferQuality} />
      <ActionButton type="mindmap" preferQuality={preferQuality} />
    </div>
  )
}
```

---

## 补充的验收标准

### 场景 10：生成模式选择
- [ ] Studio 标题栏显示模式选择下拉框
- [ ] 下拉框选项：
  - ⚡ 快速模式：使用智能采样，每个 Source 采样开头和结尾 chunks，速度快（5-15秒）
  - 🎯 精准模式：使用 Map-Reduce，对每个 Source 单独处理后合并，覆盖更全面（30-90秒）
- [ ] 默认选中"快速模式"
- [ ] 切换模式后，后续所有生成操作使用新模式
- [ ] 精准模式下显示额外提示："精准模式耗时较长，但结果更全面"
- [ ] 模式选择状态保存在 localStorage，刷新后保留

### 场景 11：大内容量处理
- [ ] 当 chunks 数量 > 50 时，显示"内容较多"提示
- [ ] 快速模式下自动使用智能采样 + 截断
- [ ] 精准模式下使用 Map-Reduce 策略
- [ ] 生成完成后显示使用的策略和统计信息

### 场景 12：产物质量反馈
- [ ] 每个产物下方显示"有帮助/没帮助"反馈按钮
- [ ] 收集反馈用于后续优化 Prompt

---

## 更新的测试用例

12. 上传 5 个大型 PDF（>100 chunks）→ 显示"内容较多"提示
13. 开启精准模式生成摘要 → 使用 Map-Reduce，耗时更长但覆盖更全
14. 关闭精准模式生成摘要 → 使用智能采样，速度更快
15. 查看生成统计 → 显示使用的策略和 chunks 数量
