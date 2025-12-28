/**
 * Source 详情 API
 * US-003: 查看/删除 Source
 * GET /api/sources/:id - 获取详情
 * DELETE /api/sources/:id - 删除 Source
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'

interface RouteParams {
  params: Promise<{ id: string }>
}

// 获取 Source 详情
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    if (source.notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // 生成临时签名 URL（1小时有效）
    let signedUrl: string | null = null
    if (source.storagePath) {
      const { data } = await supabase.storage
        .from('notebook-sources')
        .createSignedUrl(source.storagePath, 3600)
      signedUrl = data?.signedUrl || null
    }

    return NextResponse.json({
      ...source,
      signedUrl,
      notebook: undefined, // 不返回 notebook 关联
    })
  } catch (error) {
    console.error('获取 Source 失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}

// 删除 Source
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    if (source.notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // 删除 Storage 中的文件
    if (source.storagePath) {
      await supabase.storage
        .from('notebook-sources')
        .remove([source.storagePath])
    }

    // 删除数据库中的 chunks（通过 raw SQL，因为 chunks 表不在 Prisma schema 中）
    await prisma.$executeRaw`
      DELETE FROM document_chunks WHERE source_id = ${id}::uuid
    `

    // 删除处理队列记录
    await prisma.processingQueue.deleteMany({
      where: { sourceId: id },
    })

    // 删除 Source 记录
    await prisma.source.delete({
      where: { id },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('删除 Source 失败:', error)
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
