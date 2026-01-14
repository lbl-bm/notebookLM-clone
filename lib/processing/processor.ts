/**
 * 文档处理主流程
 * 支持 PDF 文件和网页两种知识源
 * 
 * 状态流转：
 * PDF: pending → downloading → parsing → chunking → embedding → ready
 * URL: pending → fetching → parsing → chunking → embedding → ready
 */

import { prisma } from '@/lib/db/prisma'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { processPdfFromStorage, parsePdf, downloadFromStorage } from './pdf-parser'
import { processWebpage, downloadPdfFromUrl, detectUrlType } from './web-parser'
import { textSplitter, Chunk, countTokens } from './text-splitter'
import { generateEmbeddings, ChunkWithEmbedding } from './embedding'
import { EMBEDDING_DIM } from '@/lib/config'
import { vectorStore } from '@/lib/db/vector-store'

/**
 * 处理阶段
 */
export type ProcessingStage = 
  | 'download'   // 下载 PDF
  | 'fetch'      // 抓取网页
  | 'parse'      // 解析内容
  | 'chunk'      // 切分文本
  | 'embed'      // 生成向量
  | 'index'      // 写入数据库

/**
 * 处理日志
 */
export interface ProcessingLog {
  stages: {
    [key in ProcessingStage]?: {
      status: 'success' | 'failed'
      timestamp: string
      duration?: number
      error?: string
      // 阶段特定数据
      pages?: number
      wordCount?: number
      chunks?: number
      avgTokens?: number
      success?: number
      failed?: number
      tokensUsed?: number
    }
  }
  totalDuration?: number
}

/**
 * 更新 Source 状态
 */
async function updateSourceStatus(
  sourceId: string,
  status: string,
  updates?: {
    errorMessage?: string
    processingLog?: ProcessingLog
    meta?: Record<string, unknown>
    lastProcessedChunkIndex?: number
  }
) {
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status,
      errorMessage: updates?.errorMessage,
      processingLog: updates?.processingLog as object,
      meta: updates?.meta as object,
      lastProcessedChunkIndex: updates?.lastProcessedChunkIndex,
      updatedAt: new Date(),
    },
  })
}

/**
 * 处理 PDF 文件
 */
export async function processPdfSource(sourceId: string): Promise<void> {
  const startTime = Date.now()
  const log: ProcessingLog = { stages: {} }

  try {
    // 获取 Source 信息
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: true },
    })

    if (!source || !source.storagePath) {
      throw new Error('Source 不存在或缺少存储路径')
    }

    // 1. 下载阶段
    await updateSourceStatus(sourceId, 'downloading')
    const downloadStart = Date.now()
    
    const buffer = await downloadFromStorage(source.storagePath)
    
    log.stages.download = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - downloadStart,
    }

    // 2. 解析阶段
    await updateSourceStatus(sourceId, 'parsing', { processingLog: log })
    const parseStart = Date.now()
    
    const parseResult = await parsePdf(buffer)
    
    if (parseResult.error) {
      throw new Error(parseResult.error)
    }

    log.stages.parse = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - parseStart,
      pages: parseResult.pageCount,
      wordCount: parseResult.wordCount,
    }

    // 3. 切分阶段
    await updateSourceStatus(sourceId, 'chunking', { processingLog: log })
    const chunkStart = Date.now()
    
    const chunks = textSplitter.splitText(
      parseResult.text,
      source.title,
      'file',
      parseResult.pageInfo
    )

    const avgTokens = chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / chunks.length)
      : 0

    log.stages.chunk = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - chunkStart,
      chunks: chunks.length,
      avgTokens,
    }

    // 4. 向量化阶段
    await updateSourceStatus(sourceId, 'embedding', { processingLog: log })
    const embedStart = Date.now()
    
    const existingHashes = await vectorStore.getExistingHashes(sourceId)
    const { chunksWithEmbedding, tokensUsed, skipped } = await generateEmbeddings(
      chunks,
      existingHashes
    )

    log.stages.embed = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - embedStart,
      success: chunksWithEmbedding.length,
      failed: skipped,
      tokensUsed,
    }

    // 5. 写入数据库
    const indexStart = Date.now()
    
    await vectorStore.addDocuments({
      notebookId: source.notebookId,
      sourceId,
      chunks: chunksWithEmbedding
    })

    log.stages.index = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - indexStart,
    }

    // 完成
    log.totalDuration = Date.now() - startTime

    await updateSourceStatus(sourceId, 'ready', {
      processingLog: log,
      meta: {
        ...(source.meta as object || {}),
        wordCount: parseResult.wordCount,
        pageCount: parseResult.pageCount,
        chunkCount: chunksWithEmbedding.length,
        contentPreview: parseResult.text.slice(0, 200),
      },
    })

  } catch (error) {
    const err = error as Error
    log.totalDuration = Date.now() - startTime

    await updateSourceStatus(sourceId, 'failed', {
      errorMessage: err.message,
      processingLog: log,
    })

    throw err
  }
}


/**
 * 处理网页 URL
 */
export async function processUrlSource(sourceId: string): Promise<void> {
  const startTime = Date.now()
  const log: ProcessingLog = { stages: {} }

  try {
    // 获取 Source 信息
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: true },
    })

    if (!source || !source.url) {
      throw new Error('Source 不存在或缺少 URL')
    }

    // 检测 URL 类型
    const urlType = detectUrlType(source.url)

    // 视频链接：直接标记为 ready
    if (urlType === 'youtube') {
      await updateSourceStatus(sourceId, 'ready', {
        meta: {
          ...(source.meta as object || {}),
          warning: '暂不支持视频内容提取',
          urlType: 'youtube',
        },
      })
      return
    }

    // 1. 抓取阶段
    await updateSourceStatus(sourceId, 'fetching')
    const fetchStart = Date.now()

    let text: string
    let wordCount: number
    let title: string

    if (urlType === 'pdf') {
      // PDF 链接：下载并解析
      const buffer = await downloadPdfFromUrl(source.url)
      const parseResult = await parsePdf(buffer)
      
      if (parseResult.error) {
        throw new Error(parseResult.error)
      }

      text = parseResult.text
      wordCount = parseResult.wordCount
      title = source.title

      log.stages.fetch = {
        status: 'success',
        timestamp: new Date().toISOString(),
        duration: Date.now() - fetchStart,
        pages: parseResult.pageCount,
      }
    } else {
      // 普通网页
      const webResult = await processWebpage(source.url)
      
      if (webResult.error === 'PDF_DETECTED') {
        // Content-Type 检测到 PDF
        const buffer = await downloadPdfFromUrl(source.url)
        const parseResult = await parsePdf(buffer)
        
        if (parseResult.error) {
          throw new Error(parseResult.error)
        }

        text = parseResult.text
        wordCount = parseResult.wordCount
        title = source.title
      } else if (webResult.error) {
        throw new Error(webResult.error)
      } else {
        text = webResult.content
        wordCount = webResult.wordCount
        title = webResult.title || source.title
      }

      log.stages.fetch = {
        status: 'success',
        timestamp: new Date().toISOString(),
        duration: Date.now() - fetchStart,
        wordCount,
      }
    }

    // 2. 解析阶段（网页已在 fetch 阶段完成解析）
    await updateSourceStatus(sourceId, 'parsing', { processingLog: log })
    
    log.stages.parse = {
      status: 'success',
      timestamp: new Date().toISOString(),
      wordCount,
    }

    // 3. 切分阶段
    await updateSourceStatus(sourceId, 'chunking', { processingLog: log })
    const chunkStart = Date.now()
    
    const chunks = textSplitter.splitText(text, title, 'url')

    const avgTokens = chunks.length > 0
      ? Math.round(chunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / chunks.length)
      : 0

    log.stages.chunk = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - chunkStart,
      chunks: chunks.length,
      avgTokens,
    }

    // 4. 向量化阶段
    await updateSourceStatus(sourceId, 'embedding', { processingLog: log })
    const embedStart = Date.now()
    
    const existingHashes = await vectorStore.getExistingHashes(sourceId)
    const { chunksWithEmbedding, tokensUsed, skipped } = await generateEmbeddings(
      chunks,
      existingHashes
    )

    log.stages.embed = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - embedStart,
      success: chunksWithEmbedding.length,
      failed: skipped,
      tokensUsed,
    }

    // 5. 写入数据库
    const indexStart = Date.now()
    
    await vectorStore.addDocuments({
      notebookId: source.notebookId,
      sourceId,
      chunks: chunksWithEmbedding
    })

    log.stages.index = {
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: Date.now() - indexStart,
    }

    // 完成
    log.totalDuration = Date.now() - startTime

    // 更新标题（如果从网页获取到了）
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title,
        status: 'ready',
        processingLog: log as object,
        meta: {
          ...(source.meta as object || {}),
          wordCount,
          chunkCount: chunksWithEmbedding.length,
          contentPreview: text.slice(0, 200),
          fetchedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    })

  } catch (error) {
    const err = error as Error
    log.totalDuration = Date.now() - startTime

    await updateSourceStatus(sourceId, 'failed', {
      errorMessage: err.message,
      processingLog: log,
    })

    throw err
  }
}

/**
 * 处理单个 Source（自动判断类型）
 */
export async function processSource(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  })

  if (!source) {
    throw new Error(`Source ${sourceId} 不存在`)
  }

  if (source.type === 'file') {
    await processPdfSource(sourceId)
  } else if (source.type === 'url') {
    await processUrlSource(sourceId)
  } else {
    throw new Error(`不支持的 Source 类型: ${source.type}`)
  }
}

/**
 * 删除 Source 及其关联数据
 */
export async function deleteSourceWithCleanup(sourceId: string): Promise<void> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  })

  if (!source) {
    return
  }

  // 1. 删除 chunks (使用封装层)
  await vectorStore.deleteDocuments(sourceId)

  // 2. 删除 Storage 文件
  if (source.storagePath) {
    await supabaseAdmin.storage
      .from('notebook-sources')
      .remove([source.storagePath])
  }

  // 3. 删除 queue 记录
  await prisma.processingQueue.deleteMany({
    where: { sourceId },
  })

  // 4. 删除 Source 记录
  await prisma.source.delete({
    where: { id: sourceId },
  })
}
