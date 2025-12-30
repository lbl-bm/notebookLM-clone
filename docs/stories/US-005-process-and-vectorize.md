# US-005: 解析文档并向量化

## 用户故事
作为**系统后台**，我希望能够**自动解析上传的文档和网页并生成向量索引**，以便**支持语义检索**。

## 验收标准

### 场景 1：内容解析

#### 1.1 PDF 文件解析
- [ ] 当 Source 状态为 pending 且类型为 file 时，Worker 应该自动开始处理
- [ ] 更新状态为 `downloading`
- [ ] 从 Supabase Storage 下载文件
- [ ] 更新状态为 `parsing`
- [ ] 使用 `pdf-parse` 提取文本内容
- [ ] 保留页码信息（用于引用定位）
- [ ] 处理失败时记录错误并更新状态为 `failed`：
  - 加密 PDF → "文件已加密，无法解析"
  - 扫描件 → "文件为图片，需要 OCR（暂不支持）"
  - 损坏文件 → "文件损坏，无法读取"

#### 1.2 网页内容解析
- [ ] 当 Source 状态为 pending 且类型为 url 时，Worker 应该自动开始处理
- [ ] 更新状态为 `fetching`
- [ ] 使用 fetch 获取网页 HTML（超时 30 秒）
- [ ] 设置合理的 User-Agent：`Mozilla/5.0 (compatible; NotebookLM-Clone/1.0)`
- [ ] 更新状态为 `parsing`
- [ ] 使用 `@mozilla/readability` 提取正文内容
- [ ] 移除广告、导航栏、侧边栏等无关内容
- [ ] 保留段落结构（用于 chunk 切分）
- [ ] 处理失败时记录错误并更新状态为 `failed`：
  - 403 错误 → "网站拒绝访问"
  - 401 错误 → "需要登录才能访问"
  - 内容为空 → "无法提取有效内容"
  - 超时 → "请求超时"
  - 其他网络错误 → "网页无法访问"

#### 1.3 PDF 链接解析
- [ ] 检测 URL 以 `.pdf` 结尾或 Content-Type 为 `application/pdf`
- [ ] 下载 PDF 文件到临时存储
- [ ] 按 PDF 文件解析流程处理

#### 1.4 视频链接处理（一期）
- [ ] 检测 YouTube 等视频链接
- [ ] 仅保存链接和标题，不提取内容
- [ ] 状态直接设为 `ready`
- [ ] meta 中标记 `warning: "暂不支持视频内容提取"`

### 场景 2：Chunk 切分

#### 2.1 切分策略：递归字符切分 + 重叠窗口

**选型理由**：
- 语义完整性：递归切分优先保持自然边界（章节 > 段落 > 句子 > 字符）
- 检索质量：重叠窗口避免关键信息被切断
- 成本可控：不需要额外的 embedding 调用
- 实现成熟：参考 LangChain RecursiveCharacterTextSplitter

**切分参数**：
```typescript
{
  chunkSize: 800,      // 目标 chunk 大小（tokens）
  chunkOverlap: 100,   // 重叠大小（tokens），约 12.5%
  separators: [        // 分隔符优先级（从高到低）
    "\n## ",           // Markdown 二级标题
    "\n### ",          // Markdown 三级标题
    "\n\n",            // 段落
    "\n",              // 换行
    "。",              // 中文句号
    "！",              // 中文感叹号
    "？",              // 中文问号
    ". ",              // 英文句号
    "! ",              // 英文感叹号
    "? ",              // 英文问号
    " ",               // 空格
    ""                 // 字符
  ]
}
```

**Token 计算**：
- 使用 `js-tiktoken` 精确计算 token 数量
- 避免因估算不准导致 API 调用失败

```typescript
import { encoding_for_model } from 'js-tiktoken'

const encoder = encoding_for_model('gpt-3.5-turbo')

function countTokens(text: string): number {
  return encoder.encode(text).length
}
```

#### 2.2 Chunk 元数据
- [ ] 每个 chunk 包含元数据：
  ```typescript
  {
    page?: number,           // 页码（PDF）
    startChar: number,       // 起始字符位置
    endChar: number,         // 结束字符位置
    tokenCount: number,      // token 数量
    sourceTitle: string,     // 来源标题（用于引用显示）
    sourceType: string,      // 来源类型 'file' | 'url'
  }
  ```
- [ ] 计算 `contentHash`（MD5，用于 Source 内去重）
- [ ] 更新状态为 `chunking`

### 场景 3：向量化

#### 3.1 调用智谱 Embedding-3 API
- [ ] API 端点：`https://open.bigmodel.cn/api/paas/v4/embeddings`
- [ ] 模型：`embedding-3`
- [ ] 维度：`1024`（平衡效果和存储成本）
- [ ] 单条最大：3072 tokens
- [ ] 批量最大：64 条/请求
- [ ] 更新状态为 `embedding`

#### 3.2 批量处理
- [ ] 按 64 条一批调用 API
- [ ] 计算每批 token 总数，确保不超限
- [ ] 记录 API 调用的 token 消耗

#### 3.3 错误处理与重试
- [ ] 实现指数退避重试：
  ```typescript
  {
    maxRetries: 3,
    initialDelay: 1000,    // 1秒
    maxDelay: 30000,       // 30秒
    backoffMultiplier: 2,
    retryOn: [429, 500, 502, 503, 504]
  }
  ```
- [ ] 429 错误：等待 Retry-After 或指数退避
- [ ] 5xx 错误：指数退避重试
- [ ] 4xx 其他错误：记录并标记失败

#### 3.4 去重优化（Source 内）
- [ ] 插入前检查 `contentHash`，同一 Source 内相同内容不重复存储
- [ ] 不跨 Source 去重（不同来源的相同内容独立存储）

### 场景 4：写入数据库

#### 4.1 document_chunks 表结构（已存在）
```sql
-- 表结构（已通过迁移创建）
CREATE TABLE "document_chunks" (
    "id" BIGSERIAL PRIMARY KEY,
    "notebook_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "embedding" vector(1024) NOT NULL,
    "embedding_model" TEXT DEFAULT 'embedding-3',
    "embedding_dim" INTEGER DEFAULT 1024,
    "content_hash" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT NOW()
);

-- 已有索引
-- idx_embedding_hnsw: HNSW 向量索引
-- idx_chunks_notebook_id: notebook_id 索引
-- idx_chunks_source_id: source_id 索引
-- idx_chunks_content_hash: content_hash 索引

-- 已有检索函数
-- match_document_chunks(notebook_id, query_embedding, match_count, threshold)
```

#### 4.2 写入流程
- [ ] 批量插入 chunks（检查 content_hash 避免重复）
- [ ] 更新 Source 状态为 `ready`
- [ ] 更新 Source meta：
  ```json
  {
    "wordCount": 12345,
    "chunkCount": 45,
    "contentPreview": "前200字预览..."
  }
  ```

### 场景 5：断点续传

- [ ] 处理中断时，记录 `lastProcessedChunkIndex` 到 Source
- [ ] 重启后检查已处理的 chunks（通过 source_id 查询）
- [ ] 从中断位置继续处理
- [ ] 避免重复处理已完成的 chunks
- [ ] 每个阶段完成后更新状态，支持从任意阶段恢复

### 场景 6：处理日志

- [ ] 每个阶段完成后更新 `processingLog`：
  ```json
  {
    "stages": {
      "download": {
        "status": "success",
        "timestamp": "2024-01-01T00:00:00Z",
        "duration": 1234
      },
      "fetch": { 
        "status": "success", 
        "timestamp": "2024-01-01T00:00:00Z",
        "duration": 1234
      },
      "parse": { 
        "status": "success", 
        "pages": 10,
        "wordCount": 12345,
        "timestamp": "..."
      },
      "chunk": { 
        "status": "success", 
        "chunks": 45,
        "avgTokens": 750
      },
      "embed": { 
        "status": "success", 
        "success": 45, 
        "failed": 0,
        "tokensUsed": 33750
      },
      "index": { 
        "status": "success" 
      }
    },
    "totalDuration": 5678
  }
  ```

### 场景 7：删除 Source 时的清理

- [ ] 删除 `document_chunks` 中该 Source 的所有记录
- [ ] 删除 Supabase Storage 中的文件（如果有）
- [ ] 删除 `processing_queue` 中的记录（如果有）
- [ ] 最后删除 Source 记录

```typescript
async function deleteSource(sourceId: string) {
  // 1. 删除 chunks
  await db.execute(
    'DELETE FROM document_chunks WHERE source_id = $1',
    [sourceId]
  )
  
  // 2. 删除 Storage 文件
  const source = await prisma.source.findUnique({ where: { id: sourceId } })
  if (source?.storagePath) {
    await supabase.storage.from('notebook-sources').remove([source.storagePath])
  }
  
  // 3. 删除 queue 记录
  await prisma.processingQueue.deleteMany({ where: { sourceId } })
  
  // 4. 删除 Source 记录
  await prisma.source.delete({ where: { id: sourceId } })
}
```

## 状态机

### Source 状态流转

```
PDF 文件流程：
pending → downloading → parsing → chunking → embedding → ready
    ↘         ↘           ↘          ↘           ↘
                        failed ←←←←←←←←←←←←←←←←←

URL 网页流程：
pending → fetching → parsing → chunking → embedding → ready
    ↘        ↘          ↘          ↘           ↘
                     failed ←←←←←←←←←←←←←←←←←

视频链接：
pending → ready (直接跳过处理)
```

### 状态枚举
```typescript
type SourceStatus = 
  | 'pending'      // 等待处理
  | 'downloading'  // 下载中（PDF文件）
  | 'fetching'     // 抓取中（网页）
  | 'parsing'      // 解析中
  | 'chunking'     // 切分中
  | 'embedding'    // 向量化中
  | 'ready'        // 就绪
  | 'failed'       // 失败
```

## ProcessingQueue 使用规范

### 队列记录规则
- 一个 Source 对应一条 queue 记录
- 重试时更新现有记录，不创建新记录

### 重试策略
```typescript
{
  maxAttempts: 3,
  retryDelays: [60, 300, 900],  // 1分钟, 5分钟, 15分钟
  
  onFailure: (attempts) => {
    if (attempts < 3) {
      // 重新入队，延迟执行
      queue.status = 'pending'
      queue.startedAt = null
    } else {
      // 标记为失败，不再重试
      queue.status = 'failed'
      source.status = 'failed'
    }
  }
}
```

### 队列状态
```typescript
type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed'
```

## 技术约束

### 依赖库
- `pdf-parse`: PDF 文本提取
- `@mozilla/readability`: 网页正文提取
- `jsdom`: HTML DOM 解析
- `js-tiktoken`: Token 精确计算
- `crypto`: MD5 哈希计算

### 运行环境
- 使用 `processing_queue` 表管理任务
- Worker 每分钟轮询一次（Vercel Cron Job）
- 每次 Cron 执行处理 1 个任务的 1 个阶段
- 单次执行控制在 30s 内，避免 Vercel 超时
- 大文件通过多次 Cron 调用完成

### 智谱 API 配置
```typescript
{
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'embedding-3',
  dimensions: 1024,
  maxTokensPerRequest: 3072,
  maxBatchSize: 64,
  apiKey: process.env.ZHIPU_API_KEY
}
```

### 网页抓取配置
```typescript
{
  timeout: 30000,  // 30秒
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NotebookLM-Clone/1.0)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
}
```

## API 端点
- `POST /api/sources/:id/ingest` - 手动触发处理（测试用）
- `GET /api/cron/process-queue` - Worker 端点（Vercel Cron）
- `DELETE /api/sources/:id` - 删除 Source（含级联清理）

## 依赖
- US-003 (上传 PDF)
- US-004 (添加链接)
- `document_chunks` 表已创建（含 HNSW 索引）
- 智谱 API Key 已配置

## 优先级
🔴 P0 - Week 3

## 估算
8 Story Points (4天)

## 测试用例
1. 上传 10 页 PDF → 成功解析并生成 ~40 chunks
2. 上传加密 PDF → 状态变为 failed，显示"文件已加密"
3. 添加博客链接 → 成功抓取正文并向量化
4. 添加需要登录的网页 → 状态变为 failed，显示"需要登录"
5. 添加 YouTube 链接 → 状态为 ready，显示警告
6. 处理中断（模拟服务重启）→ 从断点继续
7. 同一 Source 内相同内容的 chunk → 不重复存储
8. Embedding API 返回 429 → 自动重试成功
9. 检查数据库 → embedding 维度为 1024
10. 删除 Source → chunks、storage、queue 全部清理
11. 处理失败 3 次 → 标记为 failed，不再重试

## 架构风险关联
- 🔴 8.1 向量维度一致性（必须强制 dimensions: 1024）
- 🔴 8.2 文件解析错误恢复（必须实现断点续传）
- 🟡 8.3 Citations 去重（必须实现 content_hash）
- 🟢 8.6 预处理队列（使用 processing_queue 表）

## 实现计划

### Day 1: 基础设施
- [x] 验证 document_chunks 表结构
- [x] 实现智谱 Embedding API 客户端
- [x] 实现指数退避重试逻辑
- [x] 安装依赖：js-tiktoken, @mozilla/readability, jsdom

### Day 2: 内容解析
- [x] 实现 PDF 解析器（下载 + 解析）
- [x] 实现网页内容抓取和解析
- [x] 实现递归字符切分器（使用 js-tiktoken）

### Day 3: 向量化流程
- [x] 实现批量 embedding 生成
- [x] 实现 content_hash 去重（Source 内）
- [x] 实现数据库写入
- [x] 实现 Source 删除级联清理

### Day 4: Worker 和测试
- [x] 实现 Cron Job Worker
- [x] 实现重试策略
- [ ] 实现断点续传（部分实现）
- [ ] 集成测试和错误处理

## 已实现的文件

```
lib/processing/
├── index.ts           # 模块导出
├── text-splitter.ts   # 递归字符切分器（js-tiktoken）
├── pdf-parser.ts      # PDF 解析器
├── web-parser.ts      # 网页内容解析器
├── embedding.ts       # 批量 Embedding 生成
└── processor.ts       # 主处理流程

app/api/
├── cron/process-queue/route.ts  # Cron Job Worker
└── sources/[id]/ingest/route.ts # 手动触发处理

vercel.json            # Cron 配置（每分钟执行）
```
