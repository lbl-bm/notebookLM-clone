/**
 * 智能内容采样模块
 * US-008: 规避 Token 限制风险
 */

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'

// 配置常量
const CHUNKS_PER_SOURCE_HEAD = 3
const CHUNKS_PER_SOURCE_TAIL = 2
const MAX_TOTAL_CHUNKS = 40
const MAX_CONTEXT_TOKENS = 5000
const MAX_CHUNKS_PER_SOURCE_MAPREDUCE = 20

export interface ContentStats {
  totalChunks: number
  usedChunks: number
  estimatedTokens: number
  sourceCount: number
}

export interface SourceContent {
  sourceId: string
  sourceTitle: string
  content: string
  chunkCount: number
}

/**
 * 估算 token 数（中文约 1.5-2 字符/token，英文约 4 字符/token）
 */
export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

/**
 * 智能截断：保留完整的 Source 块
 */
export function truncateContextSmart(context: string, maxTokens: number = MAX_CONTEXT_TOKENS): string {
  const tokens = estimateTokens(context)
  if (tokens <= maxTokens) return context

  // 按 Source 块分割
  const blocks = context.split('\n\n---\n\n')
  let result = ''
  let currentTokens = 0

  for (const block of blocks) {
    const blockTokens = estimateTokens(block)
    if (currentTokens + blockTokens > maxTokens) {
      break
    }
    result += (result ? '\n\n---\n\n' : '') + block
    currentTokens += blockTokens
  }

  return result + '\n\n[部分内容已省略，基于以上内容生成]'
}

/**
 * 智能内容采样 - 快速模式
 * 策略：优先采样每个 Source 的开头和结尾 chunks，确保覆盖全面
 */
export async function getSourceContentSmart(
  notebookId: string,
  sourceIds?: string[]
): Promise<{ content: string; stats: ContentStats }> {
  // 1. 获取所有 ready 状态的 Sources
  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds?.length ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true, title: true },
  })

  if (sources.length === 0) {
    throw new Error('NO_SOURCES')
  }

  // 2. 每个 Source 采样策略：开头 3 个 + 结尾 2 个 chunks
  const allChunks: Array<{ content: string; sourceTitle: string }> = []
  let totalChunksCount = 0

  for (const source of sources) {
    // 获取该 Source 的 chunk 总数
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM document_chunks 
      WHERE source_id = ${source.id}::uuid
    `
    const sourceChunkCount = Number(countResult[0].count)
    totalChunksCount += sourceChunkCount

    // 获取开头 chunks
    const headChunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT content FROM document_chunks
      WHERE source_id = ${source.id}::uuid
      ORDER BY chunk_index ASC
      LIMIT ${CHUNKS_PER_SOURCE_HEAD}
    `

    // 获取结尾 chunks（如果总数足够）
    let tailChunks: Array<{ content: string }> = []
    if (sourceChunkCount > CHUNKS_PER_SOURCE_HEAD + CHUNKS_PER_SOURCE_TAIL) {
      tailChunks = await prisma.$queryRaw<Array<{ content: string }>>`
        SELECT content FROM document_chunks
        WHERE source_id = ${source.id}::uuid
        ORDER BY chunk_index DESC
        LIMIT ${CHUNKS_PER_SOURCE_TAIL}
      `
      tailChunks.reverse()
    }

    // 合并
    for (const c of headChunks) {
      allChunks.push({ content: c.content, sourceTitle: source.title })
    }
    for (const c of tailChunks) {
      allChunks.push({ content: c.content, sourceTitle: source.title })
    }

    // 检查是否超出总限制
    if (allChunks.length >= MAX_TOTAL_CHUNKS) break
  }

  // 3. 组装上下文
  const selectedChunks = allChunks.slice(0, MAX_TOTAL_CHUNKS)
  const content = selectedChunks.map((c, i) =>
    `### 来源 ${i + 1}: ${c.sourceTitle}\n${c.content}`
  ).join('\n\n---\n\n')

  // 4. 智能截断
  const truncatedContent = truncateContextSmart(content)

  return {
    content: truncatedContent,
    stats: {
      totalChunks: totalChunksCount,
      usedChunks: selectedChunks.length,
      estimatedTokens: estimateTokens(truncatedContent),
      sourceCount: sources.length,
    },
  }
}

/**
 * 获取每个 Source 的内容 - Map-Reduce 模式
 */
export async function getSourceContentsForMapReduce(
  notebookId: string,
  sourceIds?: string[]
): Promise<{ sources: SourceContent[]; stats: ContentStats }> {
  // 获取所有 ready 状态的 Sources
  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds?.length ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true, title: true },
  })

  if (sources.length === 0) {
    throw new Error('NO_SOURCES')
  }

  const sourceContents: SourceContent[] = []
  let totalChunks = 0
  let usedChunks = 0

  for (const source of sources) {
    // 获取该 Source 的 chunks（限制数量）
    const chunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT content FROM document_chunks
      WHERE source_id = ${source.id}::uuid
      ORDER BY chunk_index ASC
      LIMIT ${MAX_CHUNKS_PER_SOURCE_MAPREDUCE}
    `

    // 获取总数
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM document_chunks 
      WHERE source_id = ${source.id}::uuid
    `
    const sourceTotal = Number(countResult[0].count)
    totalChunks += sourceTotal
    usedChunks += chunks.length

    const content = chunks.map(c => c.content).join('\n\n')
    const truncated = truncateContextSmart(content, 3000) // 每个 source 限制 3000 tokens

    sourceContents.push({
      sourceId: source.id,
      sourceTitle: source.title,
      content: truncated,
      chunkCount: chunks.length,
    })
  }

  const totalTokens = sourceContents.reduce(
    (sum, s) => sum + estimateTokens(s.content),
    0
  )

  return {
    sources: sourceContents,
    stats: {
      totalChunks,
      usedChunks,
      estimatedTokens: totalTokens,
      sourceCount: sources.length,
    },
  }
}

/**
 * 获取 chunks 统计信息
 */
export async function getChunksStats(
  notebookId: string,
  sourceIds?: string[]
): Promise<{ totalChunks: number; sourceCount: number }> {
  const sources = await prisma.source.findMany({
    where: {
      notebookId,
      status: 'ready',
      ...(sourceIds?.length ? { id: { in: sourceIds } } : {}),
    },
    select: { id: true },
  })

  if (sources.length === 0) {
    return { totalChunks: 0, sourceCount: 0 }
  }

  const sourceIdList = sources.map(s => s.id)
  
  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM document_chunks 
    WHERE source_id = ANY(${sourceIdList}::uuid[])
  `

  return {
    totalChunks: Number(countResult[0].count),
    sourceCount: sources.length,
  }
}
