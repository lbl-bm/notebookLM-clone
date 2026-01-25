/**
 * Chat API - RAG 问答
 * POST /api/chat
 * 
 * 流式返回 AI 回复，结束时追加 citations
 */

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { getCurrentUserId } from '@/lib/db/supabase'
import { zhipuConfig, getModelConfig, type ModelProvider } from '@/lib/config'
import {
  retrieveChunks,
  hybridRetrieveChunks,
  deduplicateChunks,
  buildMessages,
  buildCitations,
  NO_EVIDENCE_RESPONSE,
  RAG_CONFIG,
} from '@/lib/rag'

export const maxDuration = 60 // Vercel Hobby/Pro 限制
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    // 并行获取用户 ID 和解析请求体 (async-parallel)
    const [userId, body] = await Promise.all([
      getCurrentUserId(),
      request.json().catch(() => ({})) // 防止 JSON 解析失败导致整个请求崩溃
    ])

    if (!userId) {
      return new Response('未登录', { status: 401 })
    }

    const { messages, notebookId, selectedSourceIds, mode = 'fast' } = body
    
    // 获取对应模式的模型配置
    const modelConfig = getModelConfig(mode)

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

    // 并行执行：保存用户消息 和 检索相关内容 (async-parallel)
    const saveUserMessagePromise = prisma.message.create({
      data: {
        notebookId,
        role: 'user',
        content: userQuestion,
      },
    })

    // 1. 检索相关内容（使用混合检索）
    const useHybridSearch = RAG_CONFIG.useHybridSearch
    const retrievalPromise = useHybridSearch
      ? hybridRetrieveChunks({
          notebookId,
          query: userQuestion,
          sourceIds: selectedSourceIds,
        })
      : retrieveChunks({
          notebookId,
          query: userQuestion,
          sourceIds: selectedSourceIds,
        })

    const [, retrievalResult] = await Promise.all([
      saveUserMessagePromise,
      retrievalPromise
    ])

    // 去重
    const chunks = deduplicateChunks(retrievalResult.chunks)
    const citations = buildCitations(chunks)

    // 构造检索详情（包含置信度信息）
    const retrievalDetails = {
      query: userQuestion,
      retrievalParams: {
        sourceIds: selectedSourceIds || [],
        topK: RAG_CONFIG.topK,
        threshold: RAG_CONFIG.similarityThreshold,
        useHybridSearch,
        retrievalType: retrievalResult.retrievalType || 'vector',
      },
      model: modelConfig.model,
      chunks: retrievalResult.chunks.map(c => ({
        id: c.id,
        sourceId: c.sourceId,
        sourceName: c.sourceTitle,
        score: c.similarity,
        content: c.content,
        metadata: c.metadata,
        scores: c.scores || null,
      })),
      confidence: retrievalResult.confidence,
      confidenceLevel: retrievalResult.confidenceLevel,
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
            retrievalDetails: retrievalDetails as unknown as Prisma.InputJsonValue,
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
      useDynamicPrompt: true, // 启用动态 Prompt 选择
    })

    // 4. 调用 API 流式生成
    // 根据不同的模型提供商构建不同的请求格式
    const isZhipu = modelConfig.provider === 'zhipu'
    const apiUrl = isZhipu 
      ? `${modelConfig.baseUrl}/paas/v4/chat/completions`
      : `${modelConfig.baseUrl}/v1/chat/completions`
    
    const requestBody = {
      model: modelConfig.model,
      messages: promptMessages,
      stream: true,
    }

    console.log('[Chat] 调用 LLM:', {
      provider: modelConfig.provider,
      model: modelConfig.model,
      baseUrl: modelConfig.baseUrl,
      apiUrl,
      promptLength: promptMessages.length
    })

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${modelConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Chat] LLM API 错误:', response.status, errorText)
      
      // 输出更详细的错误信息
      let errorMessage = `Chat API 错误: ${response.status}`
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.error?.message || errorData.message || errorMessage
      } catch {
        errorMessage = errorText ? `${errorMessage} - ${errorText.slice(0, 200)}` : errorMessage
      }
      
      throw new Error(errorMessage)
    }

    // 5. 转换流式响应
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    let fullContent = ''

    // 使用 TransformStream 逐块处理
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // chunk 已经是 Uint8Array，直接解码
        const text = decoder.decode(chunk, { stream: true })
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Chat] 收到 raw chunk:', text)
        }

        const lines = text.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              console.log('[Chat] 流式传输完成，总长度:', fullContent.length)
              
              // 构造 citations 数据
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
              
              // 发送 citations 标记
              controller.enqueue(encoder.encode(`\n\n__CITATIONS__${citationsData}__CITATIONS_END__`))
              
              // 异步保存消息到数据库（不阻塞流结束）
              // 注意：在 Vercel Serverless 中，如果不 await，可能会在函数冻结前未完成
              // 但为了响应速度，我们可以先返回。这里为了稳妥选择 await
              try {
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
                      model: modelConfig.model,
                      topK: chunks.length,
                      chunkCount: chunks.length,
                      retrievalDetails: {
                        ...retrievalDetails,
                        timing: {
                          ...retrievalDetails.timing,
                          generation: generationMs,
                          total: Date.now() - startTime
                        }
                      } as unknown as Prisma.InputJsonValue,
                    },
                  },
                })
              } catch (e) {
                console.error('[Chat] 保存消息失败:', e)
              }
              continue
            }

            try {
              const json = JSON.parse(data)
              
              // LongCat 的内容在 reasoning_content 字段，智谱在 content 字段
              let content = ''
              if (modelConfig.provider === 'longcat') {
                content = json.choices?.[0]?.delta?.reasoning_content || ''
              } else {
                content = json.choices?.[0]?.delta?.content || ''
              }
              
              if (content) {
                fullContent += content
                controller.enqueue(encoder.encode(content))
              }
            } catch (e) {
              // 忽略非 JSON 行或解析错误
              if (process.env.NODE_ENV === 'development') {
                console.warn('[Chat] 解析行失败:', line.slice(0, 100), e)
              }
            }
          }
        }
      },
    })

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
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
