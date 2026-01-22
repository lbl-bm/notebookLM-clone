import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { EMBEDDING_DIM } from '@/lib/config'
import { logger } from '@/lib/utils/logger'

/**
 * 批量插入配置
 */
const BATCH_INSERT_SIZE = 500  // 每批最多 500 条

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

  hybridSearch(params: {
    notebookId: string
    queryEmbedding: number[]
    queryText: string
    topK?: number
    threshold?: number
    sourceIds?: string[]
    vectorWeight?: number
    ftsWeight?: number
  }): Promise<Array<{
    id: string
    sourceId: string
    chunkIndex: number
    content: string
    metadata: ChunkMetadata
    similarity: number
    vectorScore: number
    ftsScore: number
    combinedScore: number
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
    const startTime = Date.now()
    
    // ✅ P0-1: 前置维度校验
    for (const chunk of chunks) {
      if (chunk.embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `[VectorStore] Chunk embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${chunk.embedding.length}`
        )
      }
    }

    if (chunks.length === 0) {
      return 0
    }

    // ✅ P0-1: 批量插入优化 - 分批处理
    let totalInserted = 0
    
    try {
      for (let i = 0; i < chunks.length; i += BATCH_INSERT_SIZE) {
        const batch = chunks.slice(i, i + BATCH_INSERT_SIZE)
        
        // 构建批量插入 SQL
        const values = batch.map((chunk) => {
          const embeddingLiteral = `[${chunk.embedding.join(',')}]`
          return Prisma.sql`(
            ${notebookId}::uuid,
            ${sourceId}::uuid,
            ${chunk.chunkIndex},
            ${chunk.content},
            ${chunk.contentHash},
            ${JSON.stringify(chunk.metadata)}::jsonb,
            ${embeddingLiteral}::vector,
            ${'embedding-3'},
            ${EMBEDDING_DIM}
          )`
        })

        const sql = Prisma.sql`
          INSERT INTO document_chunks (
            notebook_id, source_id, chunk_index, content, content_hash,
            metadata, embedding, embedding_model, embedding_dim
          )
          VALUES
            ${Prisma.join(values)}
          ON CONFLICT (source_id, chunk_index) DO NOTHING
        `
        
        const result = await prisma.$executeRaw(sql)
        totalInserted += Number(result)
      }

      // ✅ P1-6: 记录成功日志
      logger.vectorOperation({
        operation: 'insert',
        notebookId,
        sourceId,
        chunkCount: chunks.length,
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          inserted: totalInserted,
          skipped: chunks.length - totalInserted,
        },
      })

      return totalInserted
    } catch (error) {
      const err = error as Error
      
      // ✅ P1-6: 记录失败日志
      logger.vectorOperation({
        operation: 'insert',
        notebookId,
        sourceId,
        chunkCount: chunks.length,
        duration: Date.now() - startTime,
        success: false,
        error: err.message,
      })
      
      throw error
    }
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
    const startTime = Date.now()

    if (queryEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `[VectorStore] Query embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${queryEmbedding.length}`
      )
    }

    try {
      // ✅ P0-2: 使用 CTE 消除重复计算
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
          WITH scored_chunks AS (
            SELECT 
              c.id,
              c.source_id,
              c.chunk_index,
              c.content,
              c.metadata,
              1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
            FROM document_chunks c
            WHERE c.notebook_id = ${notebookId}::uuid
              AND c.source_id = ANY(${sourceIds}::uuid[])
          )
          SELECT * FROM scored_chunks
          WHERE similarity > ${threshold}
          ORDER BY similarity DESC
          LIMIT ${topK}
        `
      } else {
        results = await prisma.$queryRaw`
          WITH scored_chunks AS (
            SELECT 
              c.id,
              c.source_id,
              c.chunk_index,
              c.content,
              c.metadata,
              1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
            FROM document_chunks c
            WHERE c.notebook_id = ${notebookId}::uuid
          )
          SELECT * FROM scored_chunks
          WHERE similarity > ${threshold}
          ORDER BY similarity DESC
          LIMIT ${topK}
        `
      }

      const mapped = results.map(row => ({
        id: row.id.toString(),
        sourceId: row.source_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        metadata: row.metadata as ChunkMetadata,
        similarity: row.similarity
      }))

      // ✅ P1-6: 记录查询日志
      const avgSimilarity = mapped.length > 0
        ? mapped.reduce((sum, r) => sum + r.similarity, 0) / mapped.length
        : 0

      logger.vectorOperation({
        operation: 'search',
        notebookId,
        chunkCount: mapped.length,
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          topK,
          threshold,
          similarityAvg: avgSimilarity,
        },
      })

      return mapped
    } catch (error) {
      const err = error as Error
      
      // ✅ P1-6: 记录失败日志
      logger.vectorOperation({
        operation: 'search',
        notebookId,
        chunkCount: 0,
        duration: Date.now() - startTime,
        success: false,
        error: err.message,
      })
      
      throw error
    }
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

  async hybridSearch(params: {
    notebookId: string
    queryEmbedding: number[]
    queryText: string
    topK?: number
    threshold?: number
    sourceIds?: string[]
    vectorWeight?: number
    ftsWeight?: number
  }): Promise<Array<{
    id: string
    sourceId: string
    chunkIndex: number
    content: string
    metadata: ChunkMetadata
    similarity: number
    vectorScore: number
    ftsScore: number
    combinedScore: number
  }>> {
    const {
      notebookId,
      queryEmbedding,
      queryText,
      topK = 8,
      threshold = 0.1,
      sourceIds,
      vectorWeight = 0.7,
      ftsWeight = 0.3,
    } = params

    if (queryEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `[VectorStore] Query embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${queryEmbedding.length}`
      )
    }

    // ✅ P0-2: 使用 CTE 消除重复计算
    // ✅ P0-3: 统一使用 'simple' 分词器支持多语言
    let results: Array<{
      id: bigint
      source_id: string
      chunk_index: number
      content: string
      metadata: ChunkMetadata
      similarity: number
      vector_score: number
      fts_score: number
      combined_score: number
    }>

    if (sourceIds && sourceIds.length > 0) {
      results = await prisma.$queryRaw`
        WITH vector_scores AS (
          SELECT 
            c.id,
            c.source_id,
            c.chunk_index,
            c.content,
            c.metadata,
            1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS vector_score
          FROM document_chunks c
          WHERE c.notebook_id = ${notebookId}::uuid
            AND c.source_id = ANY(${sourceIds}::uuid[])
        ),
        fts_scores AS (
          SELECT 
            id,
            ts_rank(content_tsv, plainto_tsquery('simple', ${queryText})) AS fts_score
          FROM document_chunks
          WHERE notebook_id = ${notebookId}::uuid
            AND source_id = ANY(${sourceIds}::uuid[])
            AND content_tsv @@ plainto_tsquery('simple', ${queryText})
        )
        SELECT 
          v.*,
          COALESCE(f.fts_score, 0) AS fts_score,
          v.vector_score AS similarity,
          v.vector_score * ${vectorWeight} + COALESCE(f.fts_score, 0) * ${ftsWeight} AS combined_score
        FROM vector_scores v
        LEFT JOIN fts_scores f ON v.id = f.id
        WHERE v.vector_score > ${threshold} OR f.fts_score IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT ${topK}
      `
    } else {
      results = await prisma.$queryRaw`
        WITH vector_scores AS (
          SELECT 
            c.id,
            c.source_id,
            c.chunk_index,
            c.content,
            c.metadata,
            1 - (c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS vector_score
          FROM document_chunks c
          WHERE c.notebook_id = ${notebookId}::uuid
        ),
        fts_scores AS (
          SELECT 
            id,
            ts_rank(content_tsv, plainto_tsquery('simple', ${queryText})) AS fts_score
          FROM document_chunks
          WHERE notebook_id = ${notebookId}::uuid
            AND content_tsv @@ plainto_tsquery('simple', ${queryText})
        )
        SELECT 
          v.*,
          COALESCE(f.fts_score, 0) AS fts_score,
          v.vector_score AS similarity,
          v.vector_score * ${vectorWeight} + COALESCE(f.fts_score, 0) * ${ftsWeight} AS combined_score
        FROM vector_scores v
        LEFT JOIN fts_scores f ON v.id = f.id
        WHERE v.vector_score > ${threshold} OR f.fts_score IS NOT NULL
        ORDER BY combined_score DESC
        LIMIT ${topK}
      `
    }

    return results.map(row => ({
      id: row.id.toString(),
      sourceId: row.source_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      metadata: row.metadata as ChunkMetadata,
      similarity: row.similarity,
      vectorScore: row.vector_score,
      ftsScore: row.fts_score,
      combinedScore: row.combined_score,
    }))
  }
}

export const vectorStore = new PrismaVectorStore()
