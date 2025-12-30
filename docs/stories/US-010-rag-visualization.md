# US-010: RAG 链路可视化（Lite 版）

## 用户故事
作为一个**Notebook 用户**，我希望能够**看到 AI 回答的检索过程**，以便**理解答案的来源和可信度**。

## 验收标准

### 场景 1：查看检索结果
- [ ] 当 AI 回答完成后，我应该看到"查看检索详情"按钮
- [ ] 点击按钮后，应该展开检索详情面板
- [ ] 面板应该显示：
  - 🔍 检索到的 chunks 数量（如 "检索到 8 个相关片段"）
  - 📊 每个 chunk 的相关度分数
  - 📄 chunk 来源（Source 名称 + 页码/URL）
  - 📝 chunk 内容预览（前 100 字）

### 场景 2：Chunks 列表展示
- [ ] Chunks 应该按相关度从高到低排序
- [ ] 每个 chunk 卡片包含：
  - 相关度分数条（如 85% 显示为绿色进度条）
  - Source 图标和名称
  - 定位信息（页码或 URL）
  - 内容预览（可展开查看完整内容）
- [ ] 点击 chunk 卡片应该跳转到对应 Source 详情

### 场景 3：检索参数展示
- [ ] 面板顶部应该显示检索参数：
  - 🎯 检索范围：选中的 Sources 或"全部资料"
  - 🔢 检索数量：topK（默认 8）
  - 📏 相似度阈值：如 0.7（低于此值的 chunks 被过滤）
- [ ] 我可以调整参数并重新检索（可选功能）

### 场景 4：可视化流程图（简化版）
- [ ] 面板应该显示简化的流程图：
  ```
  用户问题
     ↓
  向量化 (Embedding-3)
     ↓
  向量检索 (pgvector)
     ↓
  检索到 8 个 chunks
     ↓
  组装 Prompt
     ↓
  生成回答 (GLM-4.7)
  ```
- [ ] 每个步骤显示耗时（如 "向量化: 120ms"）

### 场景 5：无结果情况
- [ ] 如果检索分数都低于阈值，应该显示：
  - ⚠️ "未找到足够相关的内容"
  - 建议："尝试换个问法，或上传更多相关资料"
- [ ] 显示检索到的 chunks（即使分数低），让用户判断

### 场景 6：对比模式（可选）
- [ ] 我可以选择多条对话，对比它们的检索结果
- [ ] 查看不同问题检索到的 chunks 有何不同

## 技术约束
- 检索详情数据结构：
  ```typescript
  {
    query: string,
    queryEmbedding: number[], // 可选，用于调试
    retrievalParams: {
      sourceIds: string[],
      topK: number,
      threshold: number
    },
    chunks: [
      {
        id: number,
        sourceId: string,
        sourceName: string,
        score: number,
        content: string,
        metadata: { page?: number, url?: string }
      }
    ],
    timing: {
      embedding: number, // ms
      retrieval: number,
      generation: number,
      total: number
    }
  }
  ```
- 在 `/api/chat` 响应中包含 `retrievalDetails` 字段
- 前端使用 Accordion 或 Drawer 展示详情

## UI 组件
- `RetrievalDetailsPanel` - 检索详情面板
- `ChunkCard` - Chunk 卡片
- `RetrievalFlowDiagram` - 流程图（可用 Mermaid 或自定义 SVG）

## 依赖
- US-006 (RAG 问答)
- 后端需要记录检索详情

## 优先级
🟡 P1 - Week 6

## 估算
5 Story Points (2.5天)

## 测试用例
1. AI 回答后点击"查看检索详情" → 展开面板，显示 8 个 chunks
2. Chunks 按分数排序 → 最高分在顶部
3. 点击 chunk 卡片 → 跳转到对应 Source 详情
4. 查看流程图 → 显示各步骤耗时
5. 检索无结果 → 显示"未找到相关内容"提示
6. 调整 topK 参数 → 重新检索并更新结果（可选）

## 架构风险关联
- 无直接关联，但有助于调试检索质量
