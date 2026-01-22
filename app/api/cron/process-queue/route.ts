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
  const job = await prisma.processingQueue.findFirst({
    where: {
      status: 'pending',
      attempts: { lt: RETRY_CONFIG.maxAttempts },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  })

  if (!job) return null

  const source = await prisma.source.findUnique({
    where: { id: job.sourceId },
  })

  if (!source) {
    await prisma.processingQueue.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorMessage: 'Source 不存在',
        completedAt: new Date(),
        attempts: job.attempts + 1,
      },
    })
    return null
  }

  if (source.status !== 'pending') {
    await prisma.processingQueue.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    })
    return null
  }

  return { source, job }
}

/**
 * 处理失败后的重试逻辑
 */
async function handleFailure(sourceId: string, queueId: bigint, error: Error) {
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
    await prisma.processingQueue.update({
      where: { id: queueId },
      data: {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date(),
        attempts: { increment: 1 },
      },
    })
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
    await prisma.processingQueue.update({
      where: { id: queueId },
      data: {
        status: 'pending',
        errorMessage: error.message,
        startedAt: null,
        completedAt: null,
        attempts: { increment: 1 },
      },
    })
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
    const task = await getNextTask()

    if (!task) {
      return NextResponse.json({
        success: true,
        message: '没有待处理的任务',
        duration: Date.now() - startTime,
      })
    }

    const { source, job } = task

    // 更新队列状态
    await prisma.processingQueue.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    })

    // 处理 Source
    await processSource(source.id)

    // 标记完成
    await prisma.processingQueue.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    })

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

    const processingJob = await prisma.processingQueue.findFirst({
      where: { status: 'processing' },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    })

    if (processingJob) {
      await handleFailure(processingJob.sourceId, processingJob.id, err)
    }

    return NextResponse.json({
      success: false,
      error: err.message,
      duration: Date.now() - startTime,
    }, { status: 500 })
  }
}
