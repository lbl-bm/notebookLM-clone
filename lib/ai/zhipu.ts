/**
 * 智谱 AI API 封装
 * 包含 Embedding-3 和 GLM-4.7 的调用
 * 
 * 参考: PROJECT_SPEC.md 3.4 节
 */

import { zhipuConfig, EMBEDDING_DIM } from '@/lib/config'

// ============================================
// 类型定义
// ============================================

interface EmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ============================================
// Embedding API
// ============================================

/**
 * 获取文本的向量表示
 * 🔴 架构风险 8.1: 强制指定维度为 1024
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const embeddings = await getEmbeddings([text])
  return embeddings[0]
}

/**
 * 批量获取文本的向量表示
 * 🔴 限制: 单次最多 64 条，每条最多 3072 tokens
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (texts.length > 64) {
    throw new Error(`批量 embedding 最多 64 条，当前 ${texts.length} 条`)
  }

  const response = await fetch(`${zhipuConfig.baseUrl}/paas/v4/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${zhipuConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: zhipuConfig.embeddingModel,
      input: texts,
      dimensions: EMBEDDING_DIM, // 强制指定维度
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Embedding API 错误: ${response.status} - ${error}`)
  }

  const data: EmbeddingResponse = await response.json()
  
  // 验证返回的向量维度
  for (const item of data.data) {
    if (item.embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `向量维度不匹配: 期望 ${EMBEDDING_DIM}，实际 ${item.embedding.length}`
      )
    }
  }

  // 按 index 排序返回
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding)
}

// ============================================
// Chat API
// ============================================

/**
 * 调用 GLM-4.7 生成回答（非流式）
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${zhipuConfig.baseUrl}/paas/v4/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${zhipuConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: zhipuConfig.chatModel,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Chat API 错误: ${response.status} - ${error}`)
  }

  const data: ChatResponse = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * 调用 GLM-4.7 生成回答（流式）
 * 返回 ReadableStream 供前端消费
 */
export async function chatStream(messages: ChatMessage[]): Promise<ReadableStream> {
  const response = await fetch(`${zhipuConfig.baseUrl}/paas/v4/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${zhipuConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: zhipuConfig.chatModel,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Chat API 错误: ${response.status} - ${error}`)
  }

  return response.body!
}

// ============================================
// 重试封装（架构风险 8.2）
// ============================================

const RETRY_DELAYS = [1000, 5000, 15000, 60000] // ms
const MAX_RETRIES = 4

/**
 * 带重试的 API 调用封装
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  context?: { operation: string }
): Promise<T> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // 检查是否是可重试的错误（429 或 5xx）
      const isRetryable = 
        lastError.message.includes('429') || 
        lastError.message.includes('5')
      
      if (isRetryable && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw lastError
      }
    }
  }

  throw lastError
}
