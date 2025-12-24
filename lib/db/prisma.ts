/**
 * Prisma Client 单例
 * Prisma 7 需要使用 adapter 连接数据库
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

// 创建连接池
const pool = globalForPrisma.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
})

// 创建 adapter
const adapter = new PrismaPg(pool)

// 创建 Prisma Client
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
  globalForPrisma.pool = pool
}

/**
 * 向量检索函数（调用 Supabase RPC）
 * 🔴 架构风险 8.1: 确保 query_embedding 维度为 1024
 */
export async function matchDocumentChunks(params: {
  notebookId: string
  queryEmbedding: number[]
  matchCount?: number
  threshold?: number
}) {
  const { notebookId, queryEmbedding, matchCount = 8, threshold = 0.0 } = params

  // 验证向量维度
  if (queryEmbedding.length !== 1024) {
    throw new Error(
      `向量维度错误: 期望 1024，实际 ${queryEmbedding.length}`
    )
  }

  // 调用 RPC（使用 $queryRaw）
  const chunks = await prisma.$queryRaw<Array<{
    id: bigint
    source_id: string
    chunk_index: number
    content: string
    metadata: unknown
    similarity: number
  }>>`
    SELECT * FROM match_document_chunks(
      ${notebookId}::uuid,
      ${JSON.stringify(queryEmbedding)}::vector(1024),
      ${matchCount}::int,
      ${threshold}::float
    )
  `

  return chunks
}

export default prisma
