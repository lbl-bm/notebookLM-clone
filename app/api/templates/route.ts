import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const templates = await prisma.promptTemplate.findMany({
      where: {
        OR: [
          { isSystem: true },
          { ownerId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error('获取模板失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

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

    const { name, description, template, variables } = body
    if (!name || !template) {
      return NextResponse.json({ error: '名称和内容不能为空' }, { status: 400 })
    }

    const newTemplate = await prisma.promptTemplate.create({
      data: {
        ownerId: userId,
        name,
        description,
        template,
        variables: variables || [],
        isSystem: false
      }
    })

    return NextResponse.json(newTemplate, { status: 201 })
  } catch (error) {
    console.error('创建模板失败:', error)
    return NextResponse.json({ error: '创建失败' }, { status: 500 })
  }
}
