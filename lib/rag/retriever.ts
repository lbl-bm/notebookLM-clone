import { getEmbedding } from '@/lib/ai/zhipu'
import { prisma } from '@/lib/db/prisma'
import { vectorStore, type ChunkMetadata } from '@/lib/db/vector-store'
import { EMBEDDING_DIM } from '@/lib/config'

export const RAG_CONFIG = {
  topK: 8,
  similarityThreshold: 0.3,
  maxContextTokens: 4000,
}

/**
 * ✅ P1-3: 使用类型安全的 ChunkMetadata
 */
export interface RetrievedChunk {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: 'file' | 'url'
  chunkIndex: number
  content: string
  similarity: number
  metadata: ChunkMetadata  // 使用标准接口
}

export interface RetrievalResult {
  chunks: RetrievedChunk[]
  hasEvidence: boolean
  retrievalMs: number
  embeddingMs: number
  queryEmbedding: number[]
}

export async function retrieveChunks(params: {
  notebookId: string
  query: string
  sourceIds?: string[]
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

  const embeddingStartTime = Date.now()
  const queryEmbedding = await getEmbedding(query)
  const embeddingMs = Date.now() - embeddingStartTime

  const retrievalStartTime = Date.now()
  
  const rawChunks = await vectorStore.similaritySearch({
    notebookId,
    queryEmbedding,
    topK,
    threshold,
    sourceIds
  })

  const retrievalMs = Date.now() - retrievalStartTime

  const foundSourceIds = [...new Set(rawChunks.map(c => c.sourceId))]
  
  const sources = await prisma.source.findMany({
    where: { id: { in: foundSourceIds } },
    select: { id: true, title: true, type: true }
  })
  
  const sourceMap = new Map(sources.map(s => [s.id, s]))

  // ✅ P1-3: 直接使用 ChunkMetadata，无需强制类型转换
  const chunks: RetrievedChunk[] = rawChunks.map(chunk => {
    const source = sourceMap.get(chunk.sourceId)
    return {
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: source?.title || '未知来源',
      sourceType: (source?.type as 'file' | 'url') || 'file',
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      similarity: chunk.similarity,
      metadata: chunk.metadata,  // 类型已保证
    }
  })

  return {
    chunks,
    hasEvidence: chunks.length > 0,
    retrievalMs,
    embeddingMs,
    queryEmbedding,
  }
}

export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>()
  return chunks.filter(chunk => {
    if (seen.has(chunk.id)) return false
    seen.add(chunk.id)
    return true
  })
}