/**
 * POST /api/studio/generate
 * 生成产物 API
 * US-008: Studio 动作生成产物
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { generateArtifact, type ArtifactType, type StudioMode } from '@/lib/studio'

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    // 2. 解析请求
    // 并行解析请求体 (async-parallel)
    const [body] = await Promise.all([
      request.json().catch(() => ({})) // 防止 JSON 解析失败导致整个请求崩溃
    ])

    const { notebookId, type, mode = 'fast', sourceIds } = body as {
      notebookId: string
      type: ArtifactType
      mode?: StudioMode
      sourceIds?: string[]
    }

    // 3. 验证参数
    if (!notebookId || !type) {
      return NextResponse.json(
        { error: '缺少必要参数', code: 'INVALID_PARAMS' },
        { status: 400 }
      )
    }

    const validTypes: ArtifactType[] = ['summary', 'outline', 'quiz', 'mindmap']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: '无效的产物类型', code: 'INVALID_TYPE' },
        { status: 400 }
      )
    }

    // 4. 验证 Notebook 所有权
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        ownerId: user.id,
      },
    })

    if (!notebook) {
      return NextResponse.json(
        { error: 'Notebook 不存在或无权访问', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // 5. 检查产物数量限制（最多 10 个）
    const artifactCount = await prisma.artifact.count({
      where: { notebookId },
    })

    if (artifactCount >= 10) {
      return NextResponse.json(
        { 
          error: '产物数量已达上限（10个），请删除旧产物后重试', 
          code: 'LIMIT_EXCEEDED' 
        },
        { status: 400 }
      )
    }

    // 6. 生成产物
    const result = await generateArtifact({
      notebookId,
      type,
      mode: mode as StudioMode,
      sourceIds,
    })

    // 7. 保存到数据库
    const artifact = await prisma.artifact.create({
      data: {
        notebookId,
        type,
        input: {
          sourceIds: sourceIds || [],
          mode,
        },
        content: result.content,
      },
    })

    // 8. 返回结果
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
    console.error('[Studio Generate] 错误:', error)

    const message = (error as Error).message

    if (message === 'NO_SOURCES') {
      return NextResponse.json(
        { error: '没有可用的资料，请先上传资料', code: 'NO_SOURCES' },
        { status: 400 }
      )
    }

    if (message === 'TIMEOUT') {
      return NextResponse.json(
        { error: '生成超时，请重试', code: 'TIMEOUT' },
        { status: 504 }
      )
    }

    if (message === 'GENERATION_FAILED') {
      return NextResponse.json(
        { error: '生成失败，请重试', code: 'GENERATION_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: '服务器错误', code: 'SERVER_ERROR' },
      { status: 500 }
    )
  }
}
