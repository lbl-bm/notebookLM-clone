import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = params
    // 并行解析请求体 (async-parallel)
    const [body] = await Promise.all([
      request.json().catch(() => ({})) // 防止 JSON 解析失败导致整个请求崩溃
    ])
    const { name, description, template, variables } = body

    const existingTemplate = await prisma.promptTemplate.findUnique({
      where: { id }
    })

    if (!existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    if (existingTemplate.isSystem) {
      return NextResponse.json({ error: '系统模板不可编辑' }, { status: 403 })
    }

    if (existingTemplate.ownerId !== userId) {
      return NextResponse.json({ error: '无权编辑此模板' }, { status: 403 })
    }

    const updatedTemplate = await prisma.promptTemplate.update({
      where: { id },
      data: {
        name,
        description,
        template,
        variables
      }
    })

    return NextResponse.json(updatedTemplate)
  } catch (error) {
    console.error('更新模板失败:', error)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id } = params

    const existingTemplate = await prisma.promptTemplate.findUnique({
      where: { id }
    })

    if (!existingTemplate) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    if (existingTemplate.isSystem) {
      return NextResponse.json({ error: '系统模板不可删除' }, { status: 403 })
    }

    if (existingTemplate.ownerId !== userId) {
      return NextResponse.json({ error: '无权删除此模板' }, { status: 403 })
    }

    await prisma.promptTemplate.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除模板失败:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
