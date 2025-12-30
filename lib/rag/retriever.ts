/**
 * RAG 检索模块
 * 基于向量相似度检索相关文档片段
 */

import { prisma } from '@/lib/db/prisma'
import { getEmbedding } from '@/lib/ai/zhipu'
import { EMBEDDING_DIM } from '@/lib/config'

/**
 * 检索配置
 */
export const RAG_CONFIG = {
  topK: 8,                    // 检索数量
  similarityThreshold: 0.3,   // 最低相似度阈值
  maxContextTokens: 4000,     // 上下文最大 token 数
}

/**
 * 检索到的 Chunk
 */
export interface RetrievedChunk {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: 'file' | 'url'
  chunkIndex: number
  content: string
  similarity: number
  metadata: {
    page?: number
    startChar: number
    endChar: number
    tokenCount: number
  }
}

/**
 * 检索结果
 */
export interface RetrievalResult {
  chunks: RetrievedChunk[]
  hasEvidence: boolean
  retrievalMs: number
}

/**
 * 从知识库检索相关内容
 */
export async function retrieveChunks(params: {
  notebookId: string
  query: string
  sourceIds?: string[]  // 可选：指定检索的 Sources
  topK?: number
  threshold?: number
}): Promise<RetrievalResult> {
  const startTime = Date.now()
  const {
    notebookId,
    query,
    sourceIds,
    topK = RAG_CONFIG.topK,
    threshold = RAG_CONFIG.similarityThreshold,
  } = params

  // 1. 生成 query embedding
  const queryEmbedding = await getEmbedding(query)

  // 验证维度
  if (queryEmbedding.length !== EMBEDDING_DIM) {
    throw new Error(`Query embedding 维度错误: ${queryEmbedding.length}`)
  }

  // 2. 调用向量检索
  let chunks: Array<{
    id: bigint
    source_id: string
    chunk_index: number
    content: string
    metadata: Record<string, unknown>
    similarity: number
  }>

  if (sourceIds && sourceIds.length > 0) {
    // 指定 Sources 检索
    chunks = await prisma.$queryRaw`
      SELECT 
        c.id,
        c.source_id,
        c.chunk_index,
        c.content,
        c.metadata,
        1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)) AS similarity
      FROM document_chunks c
      WHERE c.notebook_id = ${notebookId}::uuid
        AND c.source_id = ANY(${sourceIds}::uuid[])
        AND (1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024))) >= ${threshold}
      ORDER BY c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)
      LIMIT ${topK}
    `
  } else {
    // 全量检索（只检索 ready 状态的 Sources）
    chunks = await prisma.$queryRaw`
      SELECT 
        c.id,
        c.source_id,
        c.chunk_index,
        c.content,
        c.metadata,
        1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)) AS similarity
      FROM document_chunks c
      INNER JOIN sources s ON c.source_id = s.id::uuid
      WHERE c.notebook_id = ${notebookId}::uuid
        AND s.status = 'ready'
        AND (1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024))) >= ${threshold}
      ORDER BY c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)
      LIMIT ${topK}
    `
  }

  // 3. 获取 Source 信息
  const sourceIdSet = new Set(chunks.map(c => c.source_id))
  const sources = await prisma.source.findMany({
    where: { id: { in: Array.from(sourceIdSet) } },
    select: { id: true, title: true, type: true },
  })
  const sourceMap = new Map(sources.map(s => [s.id, s]))

  // 4. 组装结果
  const retrievedChunks: RetrievedChunk[] = chunks.map(chunk => {
    const source = sourceMap.get(chunk.source_id)
    const metadata = chunk.metadata as Record<string, unknown>
    
    return {
      id: chunk.id.toString(),
      sourceId: chunk.source_id,
      sourceTitle: source?.title || 'Unknown',
      sourceType: (source?.type === 'file' ? 'file' : 'url') as 'file' | 'url',
      chunkIndex: chunk.chunk_index,
      content: chunk.content,
      similarity: chunk.similarity,
      metadata: {
        page: metadata.page as number | undefined,
        startChar: (metadata.startChar as number) || 0,
        endChar: (metadata.endChar as number) || 0,
        tokenCount: (metadata.tokenCount as number) || 0,
      },
    }
  })

  // 5. 判断是否有依据
  const hasEvidence = retrievedChunks.length > 0 && 
    retrievedChunks[0].similarity >= threshold

  return {
    chunks: retrievedChunks,
    hasEvidence,
    retrievalMs: Date.now() - startTime,
  }
}

/**
 * 去重：合并同一 Source 的相邻 chunks
 */
export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  if (chunks.length <= 1) return chunks

  const result: RetrievedChunk[] = []
  let current = chunks[0]

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i]
    
    // 如果是同一 Source 且 chunk 相邻，合并
    if (
      current.sourceId === next.sourceId &&
      Math.abs(current.chunkIndex - next.chunkIndex) <= 1
    ) {
      // 保留相似度更高的那个
      if (next.similarity > current.similarity) {
        current = next
      }
    } else {
      result.push(current)
      current = next
    }
  }
  
  result.push(current)
  return result
}
