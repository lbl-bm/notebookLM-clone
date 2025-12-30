/**
 * 消息历史 API
 * GET /api/notebooks/:id/messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notebookId } = await params
    const userId = await getCurrentUserId()

    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 验证 Notebook 所有权
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    if (notebook.ownerId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before')

    // 查询消息
    const messages = await prisma.message.findMany({
      where: {
        notebookId,
        ...(before && { createdAt: { lt: new Date(before) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // 多取一条判断是否有更多
    })

    const hasMore = messages.length > limit
    const result = hasMore ? messages.slice(0, limit) : messages

    // 按时间正序返回
    result.reverse()

    return NextResponse.json({
      messages: result,
      hasMore,
      nextCursor: hasMore ? result[0]?.createdAt.toISOString() : undefined,
    })

  } catch (error) {
    console.error('[Messages API] 错误:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
