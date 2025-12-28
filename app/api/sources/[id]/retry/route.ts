/**
 * Source 重试 API
 * US-003: 重试失败的处理
 * POST /api/sources/:id/retry
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    if (source.notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    if (source.status !== 'failed') {
      return NextResponse.json({ error: '只能重试失败的 Source' }, { status: 400 })
    }

    // 重置 Source 状态
    await prisma.source.update({
      where: { id },
      data: {
        status: 'pending',
        errorMessage: null,
        retryCount: { increment: 1 },
        lastProcessedChunkIndex: 0,
      },
    })

    // 重新添加到处理队列
    await prisma.processingQueue.create({
      data: {
        sourceId: id,
        status: 'pending',
        priority: 2, // 重试优先级稍高
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('重试 Source 失败:', error)
    return NextResponse.json({ error: '重试失败' }, { status: 500 })
  }
}
