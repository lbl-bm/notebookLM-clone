/**
 * DELETE /api/artifacts/:id - 删除产物
 * PATCH /api/artifacts/:id - 更新产物标题
 * US-008: Studio 动作生成产物
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params

    // 1. 验证用户身份
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 2. 获取请求体
    const body = await request.json()
    const { title } = body

    if (typeof title !== 'string') {
      return NextResponse.json(
        { error: '标题必须是字符串' },
        { status: 400 }
      )
    }

    // 3. 获取产物并验证所有权
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!artifact) {
      return NextResponse.json(
        { error: '产物不存在' },
        { status: 404 }
      )
    }

    // 4. 验证所有权
    if (artifact.notebook.ownerId !== user.id) {
      return NextResponse.json(
        { error: '无权编辑此产物' },
        { status: 403 }
      )
    }

    // 5. 更新标题
    const updated = await prisma.artifact.update({
      where: { id: artifactId },
      data: { title: title.trim() || null },
    })

    // 6. 返回成功
    return NextResponse.json({
      id: updated.id,
      title: updated.title,
    })

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Artifact Update] 错误:', error)
    }
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: artifactId } = await params

    // 1. 验证用户身份
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 2. 获取产物并验证所有权
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!artifact) {
      return NextResponse.json(
        { error: '产物不存在' },
        { status: 404 }
      )
    }

    // 3. 验证所有权
    if (artifact.notebook.ownerId !== user.id) {
      return NextResponse.json(
        { error: '无权删除此产物' },
        { status: 403 }
      )
    }

    // 4. 删除产物
    await prisma.artifact.delete({
      where: { id: artifactId },
    })

    // 5. 返回成功
    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Artifact Delete] 错误:', error)
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    )
  }
}
