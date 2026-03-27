/**
 * 智能内容采样模块
 * US-008: 规避 Token 限制风险
 */

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { vectorStore } from '@/lib/db/vector-store'
import { getEmbedding } from '@/lib/ai/zhipu'

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
  
  // 检查是否有有效内容
  if (selectedChunks.length === 0 || totalChunksCount === 0) {
    throw new Error('EMPTY_CONTENT:资料中没有可识别的文本内容。如果是 PDF 文件，可能是扫描版（图片）或加密文件，请上传包含可选择文字的 PDF。')
  }
  
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

// precise 模式每个 source 最多保留的语义 chunk 数
const MAX_CHUNKS_PER_SOURCE_SEMANTIC = 12

/**
 * 精准模式的语义版内容获取 - 用于 quiz / mindmap
 *
 * 与原 getSourceContentsForMapReduce 的区别：
 * - 原版：顺序截取前 20 个 chunk
 * - 语义版：用种子问题在每个 source 内部做向量检索，取最相关的 chunk
 *
 * Map-Reduce 结构保持不变，只是每个 source 喂给 Map LLM 的内容质量更高。
 * 降级：若某个 source 语义召回失败，该 source 回退到顺序截取（不影响其他 source）
 */
export async function getSourceContentsForMapReduceSemantic(
  notebookId: string,
  sourceIds?: string[]
): Promise<{ sources: SourceContent[]; stats: ContentStats }> {
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

  // 批量获取种子 embedding（模块级缓存）
  let seedEmbeddings: number[][]
  try {
    seedEmbeddings = await getSeedEmbeddings()
  } catch {
    // embedding 服务不可用，降级到原版
    return getSourceContentsForMapReduce(notebookId, sourceIds)
  }

  const sourceContents: SourceContent[] = []
  let totalChunks = 0
  let usedChunks = 0

  for (const source of sources) {
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM document_chunks
      WHERE source_id = ${source.id}::uuid
    `
    const sourceTotal = Number(countResult[0].count)
    totalChunks += sourceTotal

    let content: string
    let chunkCount: number

    try {
      // 在当前 source 内并行检索所有种子
      const seedResults = await Promise.allSettled(
        SEMANTIC_SEED_QUERIES.map((seed, i) =>
          vectorStore.hybridSearch({
            notebookId,
            queryEmbedding: seedEmbeddings[i],
            queryText: seed,
            topK: Math.ceil(MAX_CHUNKS_PER_SOURCE_SEMANTIC / SEMANTIC_SEED_QUERIES.length),
            threshold: 0.2,
            sourceIds: [source.id],
          })
        )
      )

      // 去重 + 质量过滤
      const deduped = new Map<string, { content: string; similarity: number }>()
      for (const r of seedResults) {
        if (r.status !== 'fulfilled') continue
        for (const chunk of r.value) {
          const existing = deduped.get(chunk.id)
          if (!existing || chunk.similarity > existing.similarity) {
            deduped.set(chunk.id, { content: chunk.content, similarity: chunk.similarity })
          }
        }
      }

      const selected = Array.from(deduped.values())
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, MAX_CHUNKS_PER_SOURCE_SEMANTIC)

      const avgSim = selected.length > 0
        ? selected.reduce((s, c) => s + c.similarity, 0) / selected.length
        : 0

      if (selected.length > 0 && avgSim >= 0.25) {
        content = selected.map(c => c.content).join('\n\n')
        chunkCount = selected.length
      } else {
        throw new Error('quality_fallback')
      }
    } catch {
      // 该 source 降级：顺序截取
      const fallbackChunks = await prisma.$queryRaw<Array<{ content: string }>>`
        SELECT content FROM document_chunks
        WHERE source_id = ${source.id}::uuid
        ORDER BY chunk_index ASC
        LIMIT ${MAX_CHUNKS_PER_SOURCE_MAPREDUCE}
      `
      content = fallbackChunks.map(c => c.content).join('\n\n')
      chunkCount = fallbackChunks.length
    }

    const truncated = truncateContextSmart(content, 3000)
    usedChunks += chunkCount

    sourceContents.push({
      sourceId: source.id,
      sourceTitle: source.title,
      content: truncated,
      chunkCount,
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
}/**
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

/**
 * 种子问题 → 语义采样策略
 *
 * quiz/mindmap 的目标是"抓重点知识"，而不是"覆盖全文"。
 * 用几个角度不同的种子问题做向量检索，召回知识密度高的 chunk，
 * 比盲目取开头结尾质量更高。
 *
 * 种子问题设计原则：
 * - 覆盖典型的知识考查角度（定义、原理、对比、应用）
 * - 故意宽泛，不指向具体领域，让语义相似度自然过滤出重要内容
 */
const SEMANTIC_SEED_QUERIES = [
  '核心概念和定义是什么',
  '主要原理和工作机制',
  '关键步骤和方法',
  '重要结论和应用场景',
]

const MAX_CHUNKS_PER_SEED = 5        // 每个种子召回的 chunk 数
const MAX_TOTAL_SEMANTIC_CHUNKS = 30 // 去重后最多保留的 chunk 数

// 问题1：种子 embedding 模块级缓存
// 种子查询是固定字符串，每次 quiz/mindmap 生成重算是纯浪费；
// 模块首次用到时初始化一次，后续所有调用复用
// 用 globalThis 防止 Next.js HMR 重复初始化
const g = globalThis as unknown as { __studioSeedEmbeddings?: Promise<number[][]> }

function getSeedEmbeddings(): Promise<number[][]> {
  if (!g.__studioSeedEmbeddings) {
    // 批量请求一次，利用 zhipu getEmbeddings 的批量接口
    const { getEmbeddings } = require('@/lib/ai/zhipu') as typeof import('@/lib/ai/zhipu')
    g.__studioSeedEmbeddings = getEmbeddings(SEMANTIC_SEED_QUERIES).catch((err: unknown) => {
      // 失败时清空缓存，下次可以重试
      g.__studioSeedEmbeddings = undefined
      throw err
    })
  }
  return g.__studioSeedEmbeddings
}

/**
 * 语义采样 - 用于 quiz / mindmap 等"抓重点"任务（fast 模式）
 *
 * 流程：
 * 1. 批量获取种子 embedding（模块级缓存，只算一次）
 * 2. 4 个种子并行做 hybridSearch（embedding 已就绪，只有 DB 查询并发）
 * 3. 按 id 去重，保留相似度最高的版本
 * 4. 质量门控：平均相似度 < 0.25 时降级到 getSourceContentSmart
 * 5. 按相似度降序取 top N，组装上下文
 */
export async function getSourceContentBySemantic(
  notebookId: string,
  sourceIds?: string[]
): Promise<{ content: string; stats: ContentStats }> {
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

  const sourceIdList = sources.map(s => s.id)

  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM document_chunks
    WHERE source_id = ANY(${sourceIdList}::uuid[])
  `
  const totalChunks = Number(countResult[0].count)

  if (totalChunks === 0) {
    throw new Error('EMPTY_CONTENT:资料中没有可识别的文本内容。')
  }

  // 问题1：批量获取种子 embedding（模块级缓存，多次调用只算一次）
  let seedEmbeddings: number[][]
  try {
    seedEmbeddings = await getSeedEmbeddings()
  } catch {
    // embedding 服务不可用，直接降级
    return getSourceContentSmart(notebookId, sourceIds)
  }

  // 4 个种子并行检索（此时 embedding 已就绪，DB 并发数可控）
  const searchParams = SEMANTIC_SEED_QUERIES.map((seed, i) => ({
    seed,
    embedding: seedEmbeddings[i],
  }))

  const seedResults = await Promise.allSettled(
    searchParams.map(({ seed, embedding }) =>
      vectorStore.hybridSearch({
        notebookId,
        queryEmbedding: embedding,
        queryText: seed,
        topK: MAX_CHUNKS_PER_SEED,
        threshold: 0.2,
        ...(sourceIds?.length ? { sourceIds } : {}),
      })
    )
  )

  // 按 id 去重，保留相似度最高的版本
  const deduped = new Map<string, {
    id: string
    content: string
    sourceId: string
    similarity: number
  }>()

  for (const result of seedResults) {
    if (result.status !== 'fulfilled') continue
    for (const chunk of result.value) {
      const existing = deduped.get(chunk.id)
      if (!existing || chunk.similarity > existing.similarity) {
        deduped.set(chunk.id, {
          id: chunk.id,
          content: chunk.content,
          sourceId: chunk.sourceId,
          similarity: chunk.similarity,
        })
      }
    }
  }

  const selected = Array.from(deduped.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_TOTAL_SEMANTIC_CHUNKS)

  // 问题2：质量门控 + 降级
  // 仅无结果 OR 平均相似度偏低时才降级，避免召回到大量噪声 chunk
  const MIN_AVG_SIMILARITY = 0.25
  const avgSimilarity = selected.length > 0
    ? selected.reduce((s, c) => s + c.similarity, 0) / selected.length
    : 0

  if (selected.length === 0 || avgSimilarity < MIN_AVG_SIMILARITY) {
    return getSourceContentSmart(notebookId, sourceIds)
  }

  const sourceMap = new Map(sources.map(s => [s.id, s.title]))

  const content = selected.map((chunk, i) => {
    const title = sourceMap.get(chunk.sourceId) || '未知来源'
    return `### 来源 ${i + 1}: ${title}\n${chunk.content}`
  }).join('\n\n---\n\n')

  const truncatedContent = truncateContextSmart(content)

  return {
    content: truncatedContent,
    stats: {
      totalChunks,
      usedChunks: selected.length,
      estimatedTokens: estimateTokens(truncatedContent),
      sourceCount: sources.length,
    },
  }
}
