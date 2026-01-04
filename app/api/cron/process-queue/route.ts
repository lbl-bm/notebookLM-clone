/**
 * Cron Job Worker - 处理队列
 * 
 * 每分钟执行一次，处理 pending 状态的 Source
 * 单次执行控制在 30s 内，避免 Vercel 超时
 * 
 * 触发方式：
 * - Vercel Cron: GET /api/cron/process-queue
 * - 手动触发: GET /api/cron/process-queue?manual=true
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { processSource } from '@/lib/processing/processor'

/**
 * 重试配置
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  retryDelays: [60, 300, 900], // 1分钟, 5分钟, 15分钟（秒）
}

/**
 * 获取下一个待处理的任务
 */
async function getNextTask() {
  // 查找 pending 状态且未超过重试次数的 Source
  const source = await prisma.source.findFirst({
    where: {
      status: 'pending',
      retryCount: { lt: RETRY_CONFIG.maxAttempts },
    },
    orderBy: [
      { retryCount: 'asc' },  // 优先处理重试次数少的
      { createdAt: 'asc' },   // 先进先出
    ],
  })

  return source
}

/**
 * 更新队列记录
 */
async function updateQueueRecord(
  sourceId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string
) {
  // 查找或创建队列记录
  const existing = await prisma.processingQueue.findFirst({
    where: { sourceId },
  })

  if (existing) {
    await prisma.processingQueue.update({
      where: { id: existing.id },
      data: {
        status,
        errorMessage,
        startedAt: status === 'processing' ? new Date() : existing.startedAt,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
        attempts: status === 'failed' ? existing.attempts + 1 : existing.attempts,
      },
    })
  } else {
    await prisma.processingQueue.create({
      data: {
        sourceId,
        status,
        errorMessage,
        startedAt: status === 'processing' ? new Date() : null,
        completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
        attempts: status === 'failed' ? 1 : 0,
      },
    })
  }
}

/**
 * 处理失败后的重试逻辑
 */
async function handleFailure(sourceId: string, error: Error) {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  })

  if (!source) return

  const newRetryCount = source.retryCount + 1

  if (newRetryCount >= RETRY_CONFIG.maxAttempts) {
    // 超过最大重试次数，标记为失败
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'failed',
        retryCount: newRetryCount,
        errorMessage: error.message,
      },
    })
    await updateQueueRecord(sourceId, 'failed', error.message)
  } else {
    // 重置为 pending，等待下次重试
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'pending',
        retryCount: newRetryCount,
        errorMessage: error.message,
      },
    })
    await updateQueueRecord(sourceId, 'pending', error.message)
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const isManual = request.nextUrl.searchParams.get('manual') === 'true'

  // 验证 Cron 密钥（生产环境）
  if (!isManual && process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // 获取下一个任务
    const source = await getNextTask()

    if (!source) {
      return NextResponse.json({
        success: true,
        message: '没有待处理的任务',
        duration: Date.now() - startTime,
      })
    }

    // 更新队列状态
    await updateQueueRecord(source.id, 'processing')

    // 处理 Source
    await processSource(source.id)

    // 标记完成
    await updateQueueRecord(source.id, 'completed')

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      sourceId: source.id,
      sourceType: source.type,
      duration,
    })

  } catch (error) {
    const err = error as Error
    console.error('[Cron] 处理失败:', err)

    // 如果有正在处理的 Source，处理失败逻辑
    const source = await getNextTask()
    if (source) {
      await handleFailure(source.id, err)
    }

    return NextResponse.json({
      success: false,
      error: err.message,
      duration: Date.now() - startTime,
    }, { status: 500 })
  }
}
