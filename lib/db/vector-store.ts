import { prisma } from '@/lib/db/prisma'
import { EMBEDDING_DIM } from '@/lib/config'

/**
 * Chunk 元数据标准结构
 */
export interface ChunkMetadata {
  page?: number
  startChar: number
  endChar: number
  tokenCount: number
}

/**
 * 向量存储接口
 */
export interface VectorStore {
  addDocuments(params: {
    notebookId: string
    sourceId: string
    chunks: Array<{
      content: string
      contentHash: string
      metadata: ChunkMetadata
      embedding: number[]
      chunkIndex: number
    }>
  }): Promise<number>

  similaritySearch(params: {
    notebookId: string
    queryEmbedding: number[]
    topK?: number
    threshold?: number
    sourceIds?: string[]
  }): Promise<Array<{
    id: string
    sourceId: string
    chunkIndex: number
    content: string
    metadata: ChunkMetadata
    similarity: number
  }>>

  deleteDocuments(sourceId: string): Promise<void>
  getExistingHashes(sourceId: string): Promise<Set<string>>
}

export class PrismaVectorStore implements VectorStore {
  async addDocuments(params: {
    notebookId: string
    sourceId: string
    chunks: Array<{
      content: string
      contentHash: string
      metadata: ChunkMetadata
      embedding: number[]
      chunkIndex: number
    }>
  }): Promise<number> {
    const { notebookId, sourceId, chunks } = params
    let inserted = 0

    for (const chunk of chunks) {
      // ✅ P0-1: 统一异常处理，不再静默跳过
      if (chunk.embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `[VectorStore] Chunk embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${chunk.embedding.length}`
        )
      }

      // ✅ P0-2: 准确计数（Prisma $executeRaw 返回受影响行数）
      const result = await prisma.$executeRaw`
        INSERT INTO document_chunks (
          notebook_id, source_id, chunk_index, content, content_hash,
          metadata, embedding, embedding_model, embedding_dim
        ) VALUES (
          ${notebookId}::uuid,
          ${sourceId}::uuid,
          ${chunk.chunkIndex},
          ${chunk.content},
          ${chunk.contentHash},
          ${JSON.stringify(chunk.metadata)}::jsonb,
          ${JSON.stringify(chunk.embedding)}::vector(1024),
          'embedding-3',
          ${EMBEDDING_DIM}
        )
        ON CONFLICT DO NOTHING
      `
      // 只统计实际插入的行数（冲突时为 0）
      inserted += Number(result)
    }

    return inserted
  }

  async similaritySearch(params: {
    notebookId: string
    queryEmbedding: number[]
    topK?: number
    threshold?: number
    sourceIds?: string[]
  }): Promise<Array<{
    id: string
    sourceId: string
    chunkIndex: number
    content: string
    metadata: ChunkMetadata
    similarity: number
  }>> {
    const { 
      notebookId, 
      queryEmbedding, 
      topK = 8, 
      threshold = 0.0,
      sourceIds 
    } = params

    if (queryEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `[VectorStore] Query embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${queryEmbedding.length}`
      )
    }

    let results: Array<{
      id: bigint
      source_id: string
      chunk_index: number
      content: string
      metadata: ChunkMetadata
      similarity: number
    }>

    if (sourceIds && sourceIds.length > 0) {
      results = await prisma.$queryRaw`
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
          AND 1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `
    } else {
      results = await prisma.$queryRaw`
        SELECT 
          c.id,
          c.source_id,
          c.chunk_index,
          c.content,
          c.metadata,
          1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)) AS similarity
        FROM document_chunks c
        WHERE c.notebook_id = ${notebookId}::uuid
          AND 1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector(1024)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${topK}
      `
    }

    // ✅ P1-3: 使用类型安全的 ChunkMetadata
    return results.map(row => ({
      id: row.id.toString(),
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      metadata: row.metadata as ChunkMetadata,
      similarity: row.similarity
    }))
  }

  async deleteDocuments(sourceId: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM document_chunks WHERE source_id = ${sourceId}::uuid
    `
  }

  async getExistingHashes(sourceId: string): Promise<Set<string>> {
    const existing = await prisma.$queryRaw<Array<{ content_hash: string }>>`
      SELECT content_hash FROM document_chunks WHERE source_id = ${sourceId}::uuid
    `
    return new Set(existing.map(row => row.content_hash))
  }
}

export const vectorStore = new PrismaVectorStore()