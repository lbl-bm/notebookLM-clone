/**
 * 批量 Embedding 生成
 * 包含指数退避重试和去重优化
 */

import { zhipuConfig, EMBEDDING_DIM } from '@/lib/config'
import { Chunk } from './text-splitter'

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,    // 1秒
  maxDelay: 30000,       // 30秒
  backoffMultiplier: 2,
  retryOn: [429, 500, 502, 503, 504],
}

/**
 * 批量配置
 */
const BATCH_CONFIG = {
  maxBatchSize: 64,           // 每批最多 64 条
  maxTokensPerRequest: 3072,  // 单条最多 3072 tokens
}

/**
 * Embedding 响应
 */
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

/**
 * 带 embedding 的 Chunk
 */
export interface ChunkWithEmbedding extends Chunk {
  embedding: number[]
}

/**
 * 指数退避延迟
 */
function getBackoffDelay(attempt: number): number {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt)
  return Math.min(delay, RETRY_CONFIG.maxDelay)
}

/**
 * 检查是否应该重试
 */
function shouldRetry(error: Error, attempt: number): boolean {
  if (attempt >= RETRY_CONFIG.maxRetries) {
    return false
  }
  
  const errorMessage = error.message
  return RETRY_CONFIG.retryOn.some(code => errorMessage.includes(code.toString()))
}

/**
 * 调用智谱 Embedding API（单批次）
 */
async function callEmbeddingApi(texts: string[]): Promise<number[][]> {
  // 智谱 API 完整路径: https://open.bigmodel.cn/api/paas/v4/embeddings
  // baseUrl 默认是 https://open.bigmodel.cn/api
  const apiUrl = `${zhipuConfig.baseUrl}/paas/v4/embeddings`.replace(/\/api\/api\//, '/api/')
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${zhipuConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: zhipuConfig.embeddingModel,
      input: texts,
      dimensions: EMBEDDING_DIM,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API 错误 ${response.status}: ${errorText}`)
  }

  const data: EmbeddingResponse = await response.json()
  
  // 验证向量维度
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

/**
 * 带重试的 Embedding API 调用
 */
async function callEmbeddingApiWithRetry(texts: string[]): Promise<number[][]> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await callEmbeddingApi(texts)
    } catch (error) {
      lastError = error as Error
      
      if (shouldRetry(lastError, attempt)) {
        const delay = getBackoffDelay(attempt)
        console.warn(
          `[Embedding] 重试 ${attempt + 1}/${RETRY_CONFIG.maxRetries}，等待 ${delay}ms`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw lastError
      }
    }
  }

  throw lastError
}

/**
 * 批量生成 Embedding
 * 自动分批处理，支持重试
 */
export async function generateEmbeddings(
  chunks: Chunk[],
  existingHashes?: Set<string>
): Promise<{
  chunksWithEmbedding: ChunkWithEmbedding[]
  tokensUsed: number
  skipped: number
}> {
  const result: ChunkWithEmbedding[] = []
  let tokensUsed = 0
  let skipped = 0

  // 过滤已存在的 chunks（Source 内去重）
  const chunksToProcess = existingHashes
    ? chunks.filter(chunk => {
        if (existingHashes.has(chunk.contentHash)) {
          skipped++
          return false
        }
        return true
      })
    : chunks

  // 分批处理
  for (let i = 0; i < chunksToProcess.length; i += BATCH_CONFIG.maxBatchSize) {
    const batch = chunksToProcess.slice(i, i + BATCH_CONFIG.maxBatchSize)
    const texts = batch.map(chunk => chunk.content)
    
    // 调用 API
    const embeddings = await callEmbeddingApiWithRetry(texts)
    
    // 估算 token 消耗（实际应该从 API 响应获取）
    tokensUsed += texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0)
    
    // 合并结果
    for (let j = 0; j < batch.length; j++) {
      result.push({
        ...batch[j],
        embedding: embeddings[j],
      })
    }
  }

  return {
    chunksWithEmbedding: result,
    tokensUsed,
    skipped,
  }
}
