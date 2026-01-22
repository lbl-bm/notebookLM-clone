import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId, verifyOwnership } from '@/lib/db/supabase'
import { processSource } from '@/lib/processing/processor'

const RETRY_CONFIG = {
  maxAttempts: 3,
}

async function upsertQueueRecord(sourceId: string, status: string, priority: number, errorMessage?: string) {
  const existing = await prisma.processingQueue.findFirst({
    where: { sourceId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })

  if (existing) {
    await prisma.processingQueue.update({
      where: { id: existing.id },
      data: {
        status,
        priority,
        errorMessage,
        startedAt: status === 'processing' ? new Date() : existing.startedAt,
        completedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? new Date() : null,
        attempts: status === 'failed' ? existing.attempts + 1 : existing.attempts,
      },
    })
    return
  }

  await prisma.processingQueue.create({
    data: {
      sourceId,
      status,
      priority,
      errorMessage,
      startedAt: status === 'processing' ? new Date() : null,
      completedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? new Date() : null,
      attempts: status === 'failed' ? 1 : 0,
    },
  })
}

async function handleFailure(sourceId: string, error: Error) {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { retryCount: true },
  })

  if (!source) return

  const newRetryCount = source.retryCount + 1

  if (newRetryCount >= RETRY_CONFIG.maxAttempts) {
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'failed',
        retryCount: newRetryCount,
        errorMessage: error.message,
      },
    })
    await upsertQueueRecord(sourceId, 'failed', 3, error.message)
    return
  }

  await prisma.source.update({
    where: { id: sourceId },
    data: {
      status: 'pending',
      retryCount: newRetryCount,
      errorMessage: error.message,
    },
  })
  await upsertQueueRecord(sourceId, 'pending', 3, error.message)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceId } = await params
    const userId = await getCurrentUserId()

    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: { select: { ownerId: true } } },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    await verifyOwnership(source.notebook.ownerId, userId)

    if (source.status === 'ready') {
      return NextResponse.json({ success: true, status: source.status })
    }

    if (source.status === 'failed') {
      return NextResponse.json({ error: '失败状态请使用重试' }, { status: 400 })
    }

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: 'pending',
        errorMessage: null,
      },
    })

    await upsertQueueRecord(sourceId, 'processing', 3)

    // 异步处理，不等待完成（避免超时）
    processSource(sourceId)
      .then(async () => {
        await upsertQueueRecord(sourceId, 'completed', 3)
      })
      .catch(async (err: Error) => {
        console.error('[Process] 处理失败:', err)
        await handleFailure(sourceId, err)
      })

    return NextResponse.json({
      success: true,
      message: '处理已启动',
      sourceId,
    })
  } catch (error) {
    const err = error as Error
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

