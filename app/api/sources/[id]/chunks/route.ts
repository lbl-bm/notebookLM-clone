/**
 * Source Chunks API
 * GET /api/sources/:id/chunks
 * 
 * 获取 Source 的 chunk 列表（用于详情抽屉展示）
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const { id: sourceId } = await params
    const { searchParams } = new URL(request.url)
    const chunkIndex = searchParams.get('chunkIndex')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // 获取 Source 并验证权限
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      include: {
        notebook: {
          select: { ownerId: true },
        },
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Source 不存在' }, { status: 404 })
    }

    if (source.notebook.ownerId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }

    // 如果指定了 chunkIndex，返回该 chunk 及其上下文
    if (chunkIndex !== null) {
      const targetIndex = parseInt(chunkIndex)
      
      // 获取目标 chunk 及前后各 1 个 chunk
      const chunks = await prisma.$queryRaw<Array<{
        id: bigint
        chunk_index: number
        content: string
        metadata: Record<string, unknown>
      }>>`
        SELECT id, chunk_index, content, metadata
        FROM document_chunks
        WHERE source_id = ${sourceId}::uuid
          AND chunk_index >= ${Math.max(0, targetIndex - 1)}
          AND chunk_index <= ${targetIndex + 1}
        ORDER BY chunk_index ASC
      `

      return NextResponse.json({
        chunks: chunks.map(c => ({
          id: c.id.toString(),
          chunkIndex: c.chunk_index,
          content: c.content,
          metadata: c.metadata,
          isTarget: c.chunk_index === targetIndex,
        })),
        source: {
          id: source.id,
          title: source.title,
          type: source.type,
          status: source.status,
          meta: source.meta,
          createdAt: source.createdAt,
        },
      })
    }

    // 否则返回分页的 chunk 列表
    const chunks = await prisma.$queryRaw<Array<{
      id: bigint
      chunk_index: number
      content: string
      metadata: Record<string, unknown>
    }>>`
      SELECT id, chunk_index, content, metadata
      FROM document_chunks
      WHERE source_id = ${sourceId}::uuid
      ORDER BY chunk_index ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // 获取总数
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM document_chunks
      WHERE source_id = ${sourceId}::uuid
    `
    const total = Number(countResult[0]?.count || 0)

    return NextResponse.json({
      chunks: chunks.map(c => ({
        id: c.id.toString(),
        chunkIndex: c.chunk_index,
        content: c.content,
        metadata: c.metadata,
      })),
      source: {
        id: source.id,
        title: source.title,
        type: source.type,
        status: source.status,
        meta: source.meta,
        createdAt: source.createdAt,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + chunks.length < total,
      },
    })

  } catch (error) {
    console.error('[Chunks API] 错误:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
