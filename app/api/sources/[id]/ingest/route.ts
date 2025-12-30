/**
 * 手动触发 Source 处理
 * POST /api/sources/:id/ingest
 * 
 * 用于测试和手动重新处理
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId, verifyOwnership } from '@/lib/db/supabase'
import { processSource } from '@/lib/processing/processor'

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

    // 获取 Source 并验证权限
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: true },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    await verifyOwnership(source.notebook.ownerId, userId)

    // 检查状态
    if (source.status === 'ready') {
      return NextResponse.json({
        message: 'Source 已处理完成',
        status: source.status,
      })
    }

    // 重置状态为 pending（允许重新处理）
    if (source.status === 'failed') {
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          status: 'pending',
          retryCount: 0,
          errorMessage: null,
        },
      })
    }

    // 同步处理（测试用，生产环境应该用 Cron）
    const startTime = Date.now()
    await processSource(sourceId)
    const duration = Date.now() - startTime

    // 获取更新后的 Source
    const updatedSource = await prisma.source.findUnique({
      where: { id: sourceId },
    })

    return NextResponse.json({
      success: true,
      sourceId,
      status: updatedSource?.status,
      duration,
      processingLog: updatedSource?.processingLog,
    })

  } catch (error) {
    const err = error as Error
    console.error('[Ingest] 处理失败:', err)

    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 })
  }
}
