/**
 * 文字 Source API
 * 添加复制的文字作为知识源
 * POST /api/sources/text
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'
import { createHash } from 'crypto'

const textSchema = z.object({
  notebookId: z.string().uuid('无效的 Notebook ID'),
  title: z.string().min(1, '标题不能为空').max(200, '标题不能超过 200 字符'),
  content: z.string().min(10, '文字内容至少需要 10 个字符').max(50000, '文字内容不能超过 50000 字符'),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    // 并行获取用户和解析请求体 (async-parallel)
    const [{ data: { user } }, body] = await Promise.all([
      supabase.auth.getUser(),
      request.json().catch(() => ({}))
    ])

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    
    // 验证输入
    const result = textSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { notebookId, title, content } = result.data

    // 并行验证 Notebook 和计算哈希 (async-parallel)
    const [notebook, contentHash] = await Promise.all([
      prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { ownerId: true },
      }),
      hashContent(content)
    ])

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    if (notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问此 Notebook' }, { status: 403 })
    }

    // 检查是否已存在相同内容
    interface ExistingSource { id: string }
    const existingSource = await prisma.$queryRaw<ExistingSource[]>`
      SELECT s.id FROM sources s
      JOIN document_chunks dc ON dc.source_id = s.id::uuid
      WHERE s."notebookId" = ${notebookId} AND dc.content_hash = ${contentHash}
      LIMIT 1
    `

    if (existingSource.length > 0) {
      return NextResponse.json(
        { error: '相同内容已存在于当前 Notebook' },
        { status: 400 }
      )
    }

    // 生成唯一的 sourceId
    const sourceId = crypto.randomUUID()

    // 直接创建 Source 并处理（文字来源不需要存储文件）
    const source = await prisma.source.create({
      data: {
        id: sourceId,
        notebookId,
        type: 'text',
        title,
        status: 'pending',
        meta: {
          contentType: 'text/plain',
          charCount: content.length,
          wordCount: content.split(/\s+/).filter(Boolean).length,
          addedAt: new Date().toISOString(),
        },
      },
    })

    // 添加到处理队列
    await prisma.processingQueue.create({
      data: {
        sourceId: source.id,
        status: 'pending',
        priority: 1,
      },
    })

    return NextResponse.json(source, { status: 201 })
  } catch (error) {
    console.error('添加文字 Source 失败:', error)
    return NextResponse.json(
      { 
        error: '添加失败', 
        details: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    )
  }
}

// 计算内容哈希
async function hashContent(content: string): Promise<string> {
  return createHash('sha256').update(content).digest('hex')
}
