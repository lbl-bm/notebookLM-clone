/**
 * GET /api/notebooks/:id/artifacts
 * 获取产物列表
 * US-008: Studio 动作生成产物
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: notebookId } = await params

    // 1. 验证用户身份
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 2. 验证 Notebook 所有权
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        ownerId: user.id,
      },
    })

    if (!notebook) {
      return NextResponse.json(
        { error: 'Notebook 不存在或无权访问' },
        { status: 404 }
      )
    }

    // 3. 获取产物列表
    const artifacts = await prisma.artifact.findMany({
      where: { notebookId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        content: true,
        input: true,
        createdAt: true,
      },
    })

    // 4. 返回结果
    return NextResponse.json({
      artifacts: artifacts.map(a => ({
        id: a.id,
        type: a.type,
        content: a.content,
        input: a.input,
        createdAt: a.createdAt.toISOString(),
      })),
    })

  } catch (error) {
    console.error('[Artifacts List] 错误:', error)
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    )
  }
}
