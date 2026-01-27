/**
 * 建议问题 API
 * POST /api/notebooks/:id/suggest
 * 
 * 性能优化：
 * - 并行化用户验证和 notebook 查询
 * - 添加简单的内存缓存
 */

import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'
import { zhipuConfig } from '@/lib/config'

// 简单的内存缓存（生产环境建议使用 Redis）
const suggestCache = new Map<string, { questions: string[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 分钟缓存

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(
  request: Request,
  { params }: RouteParams
) {
  try {
    const { id: notebookId } = await params

    // 检查缓存
    const cached = suggestCache.get(notebookId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(JSON.stringify({ questions: cached.questions, cached: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 并行获取用户 ID 和 Notebook 所有权验证（性能优化）
    const [userId, notebook] = await Promise.all([
      getCurrentUserId(),
      prisma.notebook.findUnique({
        where: { id: notebookId },
        select: { ownerId: true },
      }),
    ])

    if (!userId) {
      return new Response('未登录', { status: 401 })
    }

    if (!notebook) {
      return new Response('Notebook 不存在', { status: 404 })
    }

    if (notebook.ownerId !== userId) {
      return new Response('无权访问', { status: 403 })
    }

    // 获取 Notebook 的部分内容作为上下文
    // 我们只取前 5 个 chunks，避免 context 过大
    const chunks = await prisma.$queryRaw<Array<{ content: string }>>`
      SELECT content
      FROM document_chunks
      WHERE notebook_id = ${notebookId}::uuid
      ORDER BY chunk_index ASC
      LIMIT 5
    `

    if (chunks.length === 0) {
      return new Response(JSON.stringify({ questions: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const context = chunks.map(c => c.content).join('\n\n')

    // 调用 LLM 生成问题
    const response = await fetch(`${zhipuConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zhipuConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: zhipuConfig.chatModel,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的阅读助手。请根据提供的文档内容，生成 3-5 个有启发性的问题，帮助用户深入理解文档。
要求：
1. 问题要具体，不要太宽泛。
2. 问题要能引发思考。
3. 只返回问题列表，每行一个，不要包含序号或其他废话。
4. 使用中文。`
          },
          {
            role: 'user',
            content: `文档内容片段：\n${context}`
          }
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error('LLM API error')
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    // 解析返回的问题列表
    const questions = content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.match(/^\d+\./)) // 过滤空行和纯序号
      .slice(0, 5)

    // 更新缓存
    suggestCache.set(notebookId, { questions, timestamp: Date.now() })

    // 清理过期缓存（避免内存泄漏）
    if (suggestCache.size > 100) {
      const now = Date.now()
      for (const [key, value] of suggestCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          suggestCache.delete(key)
        }
      }
    }

    return new Response(JSON.stringify({ questions }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Suggest questions error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
