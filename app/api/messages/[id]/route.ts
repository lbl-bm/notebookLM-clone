import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = await params

    // 获取消息及其关联的 Notebook
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!message) {
      return NextResponse.json({ error: '消息不存在' }, { status: 404 })
    }

    // 验证所有权
    if (message.notebook.ownerId !== userId) {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    // 删除消息
    await prisma.message.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除消息失败:', error)
    return NextResponse.json(
      { error: '删除失败' },
      { status: 500 }
    )
  }
}
