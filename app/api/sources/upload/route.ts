/**
 * Source 上传 API
 * US-003: 上传 PDF 作为知识源
 * POST /api/sources/upload
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_TYPES = ['application/pdf']

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const notebookId = formData.get('notebookId') as string | null

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 })
    }

    if (!notebookId) {
      return NextResponse.json({ error: '缺少 notebookId' }, { status: 400 })
    }

    // 验证 Notebook 所有权
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    if (notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问此 Notebook' }, { status: 403 })
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '仅支持 PDF 文件' }, { status: 400 })
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过 50MB' }, { status: 400 })
    }

    // 生成存储路径
    const timestamp = Date.now()
    const sourceId = crypto.randomUUID()
    const storagePath = `${user.id}/${notebookId}/${sourceId}_${timestamp}.pdf`

    // 上传到 Supabase Storage
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('notebook-sources')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('上传失败:', uploadError)
      return NextResponse.json({ error: '文件上传失败' }, { status: 500 })
    }

    // 创建 Source 记录
    const source = await prisma.source.create({
      data: {
        id: sourceId,
        notebookId,
        type: 'file',
        title: file.name,
        status: 'pending',
        storagePath,
        meta: {
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
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
    console.error('上传 Source 失败:', error)
    return NextResponse.json({ error: '上传失败' }, { status: 500 })
  }
}
