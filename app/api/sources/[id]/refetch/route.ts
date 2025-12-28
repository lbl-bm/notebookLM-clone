/**
 * 重新抓取 URL Source API
 * US-004: 重新抓取网页内容
 * POST /api/sources/:id/refetch
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 获取 Source
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
      return NextResponse.json({ error: '无权访问此 Source' }, { status: 403 })
    }

    // 只有 URL 类型的 Source 可以重新抓取
    if (source.type !== 'url') {
      return NextResponse.json(
        { error: '只有网页链接可以重新抓取' },
        { status: 400 }
      )
    }

    if (!source.url) {
      return NextResponse.json(
        { error: '缺少 URL 信息' },
        { status: 400 }
      )
    }

    // 更新状态为 pending
    await prisma.source.update({
      where: { id },
      data: {
        status: 'pending',
        errorMessage: null,
        retryCount: { increment: 1 },
        meta: {
          ...(source.meta as object || {}),
          lastRefetchAt: new Date().toISOString(),
        },
      },
    })

    // 添加到处理队列
    await prisma.processingQueue.create({
      data: {
        sourceId: id,
        status: 'pending',
        priority: 2, // 重新抓取优先级稍高
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('重新抓取失败:', error)
    return NextResponse.json({ error: '重新抓取失败' }, { status: 500 })
  }
}
