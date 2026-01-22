/**
 * Notebook 详情 API
 * GET /api/notebooks/:id - 获取 Notebook 详情
 * PATCH /api/notebooks/:id - 更新 Notebook
 * DELETE /api/notebooks/:id - 删除 Notebook
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId, verifyOwnership } from '@/lib/db/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取 Notebook 详情
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const notebook = await prisma.notebook.findUnique({
      where: { id },
      include: {
        sources: {
          orderBy: { createdAt: 'desc' },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50, // 最近 50 条消息
        },
        artifacts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    await verifyOwnership(notebook.ownerId, userId)

    // 更新最近打开时间
    await prisma.notebook.update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    })

    return NextResponse.json(notebook)
  } catch (error) {
    console.error('获取 Notebook 详情失败:', error)
    if ((error as Error).message === '无权访问此资源') {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

// 更新 Notebook
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const notebook = await prisma.notebook.findUnique({
      where: { id },
      select: { ownerId: true },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    await verifyOwnership(notebook.ownerId, userId)

    // 并行解析请求体 (async-parallel)
    const [body] = await Promise.all([
      request.json().catch(() => ({})) // 防止 JSON 解析失败导致整个请求崩溃
    ])

    const { title } = body
    const updated = await prisma.notebook.update({
      where: { id },
      data: { title },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('更新 Notebook 失败:', error)
    if ((error as Error).message === '无权访问此资源') {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

// 删除 Notebook
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const notebook = await prisma.notebook.findUnique({
      where: { id },
      select: { ownerId: true },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    await verifyOwnership(notebook.ownerId, userId)

    // 级联删除（Prisma schema 已配置 onDelete: Cascade）
    await prisma.notebook.delete({
      where: { id },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('删除 Notebook 失败:', error)
    if ((error as Error).message === '无权访问此资源') {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
