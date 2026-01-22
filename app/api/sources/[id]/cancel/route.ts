import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId, verifyOwnership } from '@/lib/db/supabase'

export async function POST(
  request: Request,
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

    await prisma.processingQueue.updateMany({
      where: {
        sourceId,
        status: { in: ['pending', 'processing'] },
      },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

