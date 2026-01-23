import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'
import { generateFromTemplate } from '@/lib/studio'

export async function POST(
  request: NextRequest,
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

    const { notebookId, variables, sourceIds } = body

    if (!notebookId) {
      return NextResponse.json({ error: '缺少 notebookId' }, { status: 400 })
    }

    // 1. 获取模板
    const template = await prisma.promptTemplate.findUnique({
      where: { id }
    })

    if (!template) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    // 2. 验证 Notebook 所有权
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        ownerId: userId,
      },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在或无权访问' }, { status: 404 })
    }

    // 3. 运行模板
    const result = await generateFromTemplate({
      notebookId,
      template: template.template,
      variables: variables || {},
      sourceIds,
    })

    // 4. 保存到 Artifacts
    const artifact = await prisma.artifact.create({
      data: {
        notebookId,
        type: 'custom',
        input: {
          templateId: id,
          variables: variables || {},
          sourceIds: sourceIds || [],
        },
        content: result.content,
      },
    })

    return NextResponse.json({
      artifact: {
        id: artifact.id,
        type: artifact.type,
        content: artifact.content,
        createdAt: artifact.createdAt.toISOString(),
      },
      stats: result.stats,
    })
  } catch (error) {
    console.error('运行模板失败:', error)
    const message = (error as Error).message
    
    if (message === 'NO_SOURCES') {
      return NextResponse.json(
        { error: '当前 Notebook 中没有可用的资料，请先上传并等待处理完成。' },
        { status: 400 }
      )
    }
    
    if (message.startsWith('EMPTY_CONTENT:')) {
      return NextResponse.json(
        { error: message.replace('EMPTY_CONTENT:', '') },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: message || '运行失败' },
      { status: 500 }
    )
  }
}
