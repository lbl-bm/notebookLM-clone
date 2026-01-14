/**
 * Chat API - RAG 问答
 * POST /api/chat
 * 
 * 流式返回 AI 回复，结束时追加 citations
 */

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getCurrentUserId } from '@/lib/db/supabase'
import { zhipuConfig } from '@/lib/config'
import {
  retrieveChunks,
  deduplicateChunks,
  buildMessages,
  buildCitations,
  NO_EVIDENCE_RESPONSE,
} from '@/lib/rag'

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return new Response('未登录', { status: 401 })
    }

    const body = await request.json()
    const { messages, notebookId, selectedSourceIds } = body

    if (!notebookId) {
      return new Response('缺少 notebookId', { status: 400 })
    }

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

    // 获取用户最新问题
    const userMessage = messages[messages.length - 1]
    if (!userMessage || userMessage.role !== 'user') {
      return new Response('缺少用户消息', { status: 400 })
    }

    const userQuestion = userMessage.content

    // 保存用户消息
    await prisma.message.create({
      data: {
        notebookId,
        role: 'user',
        content: userQuestion,
      },
    })

    // 1. 检索相关内容
    const retrievalResult = await retrieveChunks({
      notebookId,
      query: userQuestion,
      sourceIds: selectedSourceIds,
    })

    // 去重
    const chunks = deduplicateChunks(retrievalResult.chunks)
    const citations = buildCitations(chunks)

    // 构造检索详情
    const retrievalDetails = {
      query: userQuestion,
      queryEmbedding: retrievalResult.queryEmbedding,
      retrievalParams: {
        sourceIds: selectedSourceIds || [],
        topK: 8,
        threshold: 0.3,
      },
      model: zhipuConfig.chatModel,
      chunks: retrievalResult.chunks.map(c => ({
        id: c.id,
        sourceId: c.sourceId,
        sourceName: c.sourceTitle,
        score: c.similarity,
        content: c.content,
        metadata: c.metadata,
      })),
      timing: {
        embedding: retrievalResult.embeddingMs,
        retrieval: retrievalResult.retrievalMs,
      }
    }

    // 2. 判断是否有依据
    if (!retrievalResult.hasEvidence) {
      // 无依据，直接返回固定回复
      await prisma.message.create({
        data: {
          notebookId,
          role: 'assistant',
          content: NO_EVIDENCE_RESPONSE,
          answerMode: 'no_evidence',
          citations: [],
          metadata: {
            retrievalMs: retrievalResult.retrievalMs,
            embeddingMs: retrievalResult.embeddingMs,
            generationMs: 0,
            model: 'none',
            topK: chunks.length,
            chunkCount: 0,
            retrievalDetails,
          },
        },
      })

      return new Response(JSON.stringify({
        content: NO_EVIDENCE_RESPONSE,
        citations: [],
        answerMode: 'no_evidence',
        retrievalDetails,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. 组装 Prompt
    const chatHistory = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const promptMessages = buildMessages({
      chunks,
      userQuestion,
      chatHistory,
    })

    // 4. 调用智谱 API 流式生成
    const response = await fetch(`${zhipuConfig.baseUrl}/paas/v4/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${zhipuConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: zhipuConfig.chatModel,
        messages: promptMessages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Chat API 错误: ${response.status} - ${error}`)
    }

    // 5. 转换流式响应
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let fullContent = ''

    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk)
        const lines = text.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              // 流结束，追加 citations 和检索详情
              const generationMs = Date.now() - startTime - retrievalResult.retrievalMs - retrievalResult.embeddingMs
              const citationsData = JSON.stringify({ 
                citations, 
                answerMode: 'grounded',
                retrievalDetails: {
                  ...retrievalDetails,
                  timing: {
                    ...retrievalDetails.timing,
                    generation: generationMs,
                    total: Date.now() - startTime
                  }
                }
              })
              controller.enqueue(encoder.encode(`\n\n__CITATIONS__${citationsData}__CITATIONS_END__`))
              
              // 保存 AI 回复
              await prisma.message.create({
                data: {
                  notebookId,
                  role: 'assistant',
                  content: fullContent,
                  answerMode: 'grounded',
                  citations: citations as unknown as Prisma.InputJsonValue,
                  metadata: {
                    retrievalMs: retrievalResult.retrievalMs,
                    embeddingMs: retrievalResult.embeddingMs,
                    generationMs,
                    model: zhipuConfig.chatModel,
                    topK: chunks.length,
                    chunkCount: chunks.length,
                    retrievalDetails: {
                      ...retrievalDetails,
                      timing: {
                        ...retrievalDetails.timing,
                        generation: generationMs,
                        total: Date.now() - startTime
                      }
                    },
                  },
                },
              })
              continue
            }

            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content || ''
              if (content) {
                fullContent += content
                controller.enqueue(encoder.encode(content))
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      },
    })

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    })

  } catch (error) {
    console.error('[Chat API] 错误:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
