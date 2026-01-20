import { prisma } from '@/lib/db/prisma'
import { getCurrentUserId } from '@/lib/db/supabase'
import { zhipuConfig } from '@/lib/config'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return new Response('未登录', { status: 401 })
    }

    const notebookId = params.id

    // 验证 Notebook 所有权
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true },
    })

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
