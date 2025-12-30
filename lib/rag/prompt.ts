/**
 * RAG Prompt 组装模块
 */

import { RetrievedChunk } from './retriever'

/**
 * System Prompt
 */
export const SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 只使用参考资料中的信息回答，不要编造内容
2. 如果参考资料中没有相关信息，请明确告知用户
3. 在回答中使用引用标记，格式为 [1]、[2] 等，对应参考资料的编号
4. 引用标记应该放在相关句子或段落的末尾
5. 使用清晰、专业的语言
6. 如果问题不明确，可以请求用户澄清

示例：
用户问"什么是机器学习？"
回答："机器学习是人工智能的一个分支，它使计算机能够从数据中学习并改进性能[1]。常见的机器学习方法包括监督学习、无监督学习和强化学习[2]。"`

/**
 * 无依据时的回复
 */
export const NO_EVIDENCE_RESPONSE = `抱歉，我在您的资料中没有找到与这个问题相关的信息。

建议：
- 上传更多相关资料
- 尝试用不同的方式描述您的问题
- 检查已上传的资料是否包含相关内容`

/**
 * 组装上下文
 */
export function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '（暂无参考资料）'
  }

  const sections = chunks.map((chunk, index) => {
    const sourceInfo = chunk.sourceType === 'file' && chunk.metadata.page
      ? `${chunk.sourceTitle} (第 ${chunk.metadata.page} 页)`
      : chunk.sourceTitle

    // 使用 [1], [2] 等编号，方便 LLM 引用
    return `### [${index + 1}] ${sourceInfo}
${chunk.content}
---
相关度: ${Math.round(chunk.similarity * 100)}%`
  })

  return `## 参考资料

${sections.join('\n\n')}`
}

/**
 * 组装完整的消息列表
 */
export function buildMessages(params: {
  chunks: RetrievedChunk[]
  userQuestion: string
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const { chunks, userQuestion, chatHistory = [] } = params

  const context = buildContext(chunks)
  
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  // 添加历史对话（最近 6 条）
  const recentHistory = chatHistory.slice(-6)
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // 添加当前问题（带上下文）
  messages.push({
    role: 'user',
    content: `${context}\n\n## 用户问题\n${userQuestion}`,
  })

  return messages
}

/**
 * Citation 数据结构
 */
export interface Citation {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: 'file' | 'url'
  content: string         // 前 150 字
  similarity: number
  metadata: {
    page?: number
    chunkIndex: number
    startChar: number
    endChar: number
  }
}

/**
 * 从检索结果生成 Citations
 * 包含去重逻辑：相同内容（前 100 字相同）只保留相似度最高的
 */
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  // 按相似度降序排序
  const sortedChunks = [...chunks].sort((a, b) => b.similarity - a.similarity)
  
  // 使用 Map 去重，key 为内容前 100 字的 hash
  const seen = new Map<string, Citation>()
  
  for (const chunk of sortedChunks) {
    // 使用内容前 100 字作为去重 key
    const contentKey = chunk.content.slice(0, 100).trim()
    
    // 如果已存在相同内容，跳过（因为已按相似度排序，先出现的相似度更高）
    if (seen.has(contentKey)) {
      continue
    }
    
    const citation: Citation = {
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      sourceType: chunk.sourceType,
      content: chunk.content.slice(0, 150) + (chunk.content.length > 150 ? '...' : ''),
      similarity: chunk.similarity,
      metadata: {
        page: chunk.metadata.page,
        chunkIndex: chunk.chunkIndex,
        startChar: chunk.metadata.startChar,
        endChar: chunk.metadata.endChar,
      },
    }
    
    seen.set(contentKey, citation)
  }
  
  // 返回去重后的 citations，保持相似度降序
  return Array.from(seen.values())
}
