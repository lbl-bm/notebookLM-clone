/**
 * Notebook API
 * POST /api/notebooks - 创建 Notebook
 * GET /api/notebooks - 获取 Notebook 列表
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

// 创建 Notebook
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    // 并行解析请求体 (async-parallel)
    const [body] = await Promise.all([
      request.json().catch(() => ({})) // 防止 JSON 解析失败导致整个请求崩溃
    ])

    const { title } = body
    if (!title) {
      return NextResponse.json({ error: '标题不能为空' }, { status: 400 })
    }

    const notebook = await prisma.notebook.create({
      data: {
        ownerId: userId,
        title,
      },
    })

    return NextResponse.json(notebook, { status: 201 })
  } catch (error) {
    console.error('创建 Notebook 失败:', error)
    return NextResponse.json({ error: '创建失败' }, { status: 500 })
  }
}

// 获取 Notebook 列表
export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const notebooks = await prisma.notebook.findMany({
      where: { ownerId: userId },
      orderBy: { lastOpenedAt: 'desc' },
      include: {
        _count: {
          select: { sources: true, messages: true },
        },
      },
    })

    return NextResponse.json(notebooks)
  } catch (error) {
    console.error('获取 Notebook 列表失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
