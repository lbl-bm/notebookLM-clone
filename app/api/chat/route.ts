/**
 * Chat API - RAG 问答
 * POST /api/chat
 *
 * 流式返回 AI 回复，结束时追加 citations
 * M1: 证据约束 + 引用一致性快检 + traceId + 诊断 metadata
 */

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/db/supabase";
import { getModelConfig, ragStrategyConfig } from "@/lib/config";
import {
  retrieveChunks,
  hybridRetrieveChunks,
  deduplicateChunks,
  buildMessages,
  buildCitations,
  NO_EVIDENCE_RESPONSE,
  RAG_CONFIG,
} from "@/lib/rag";
import { validateCitationConsistency } from "@/lib/rag/validator";
import { generateTraceId, logger, type ChatTraceLog } from "@/lib/utils/logger";

export const maxDuration = 60; // Vercel Hobby/Pro 限制
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startTime = Date.now();
  const traceId = generateTraceId();

  try {
    // 并行获取用户 ID 和解析请求体 (async-parallel)
    const [userId, body] = await Promise.all([
      getCurrentUserId(),
      request.json().catch(() => ({})), // 防止 JSON 解析失败导致整个请求崩溃
    ]);

    if (!userId) {
      return new Response("未登录", { status: 401 });
    }

    const { messages, notebookId, selectedSourceIds, mode = "fast" } = body;

    // 获取对应模式的模型配置
    const modelConfig = getModelConfig(mode);

    if (!notebookId) {
      return new Response("缺少 notebookId", { status: 400 });
    }

    // 验证 Notebook 所有权
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true },
    });

    if (!notebook) {
      return new Response("Notebook 不存在", { status: 404 });
    }

    if (notebook.ownerId !== userId) {
      return new Response("无权访问", { status: 403 });
    }

    // 获取用户最新问题
    const userMessage = messages[messages.length - 1];
    if (!userMessage || userMessage.role !== "user") {
      return new Response("缺少用户消息", { status: 400 });
    }

    const userQuestion = userMessage.content;

    // 并行执行：保存用户消息 和 检索相关内容 (async-parallel)
    const saveUserMessagePromise = prisma.message.create({
      data: {
        notebookId,
        role: "user",
        content: userQuestion,
      },
    });

    // 1. 检索相关内容（使用混合检索）
    const useHybridSearch = RAG_CONFIG.useHybridSearch;
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
        });

    const [, retrievalResult] = await Promise.all([
      saveUserMessagePromise,
      retrievalPromise,
    ]);

    // 去重
    const chunks = deduplicateChunks(retrievalResult.chunks);
    const citations = buildCitations(chunks);

    // M1: 提取检索决策和证据统计
    const retrievalDecision = retrievalResult.retrievalDecision || "grounded";
    const evidenceStats = retrievalResult.evidenceStats;
    const confidenceDetail = retrievalResult.confidenceDetail;

    // 构造检索详情（包含 M1 + M2 诊断信息）
    const retrievalDetails = {
      query: userQuestion,
      retrievalParams: {
        sourceIds: selectedSourceIds || [],
        topK: RAG_CONFIG.topK,
        threshold: RAG_CONFIG.similarityThreshold,
        useHybridSearch,
        retrievalType: retrievalResult.retrievalType || "vector",
      },
      model: modelConfig.model,
      chunks: retrievalResult.chunks.map((c) => ({
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
      // M1: 新增诊断字段
      traceId,
      retrievalDecision,
      evidenceStats,
      confidenceDetail,
      timing: {
        embedding: retrievalResult.embeddingMs,
        retrieval: retrievalResult.retrievalMs,
      },
      // M2: 管线诊断
      m2Diagnostics: retrievalResult.m2Diagnostics || null,
    };

    // 2. 判断是否有依据 (无 chunks 或 低置信度)
    if (!retrievalResult.hasEvidence || retrievalDecision === "no_evidence") {
      // M1: 构建诊断日志
      const chatTrace: ChatTraceLog = {
        traceId,
        notebookId,
        strategyVersion: ragStrategyConfig.strategyVersion,
        retrievalDecision: "no_evidence",
        evidenceStats: evidenceStats || {
          totalChunks: 0,
          uniqueSources: 0,
          avgSimilarity: 0,
          maxSimilarity: 0,
          aboveThreshold: 0,
          coverage: 0,
          scoreGap: 0,
        },
        confidence: confidenceDetail || {
          score: 0,
          level: "low",
          components: { similarity: 0, diversity: 0, coverage: 0 },
        },
        timing: {
          embedding: retrievalResult.embeddingMs,
          retrieval: retrievalResult.retrievalMs,
          generation: 0,
          validation: 0,
          total: Date.now() - startTime,
        },
        model: "none",
        m2Diagnostics: retrievalResult.m2Diagnostics as ChatTraceLog["m2Diagnostics"],
      };
      logger.chatTrace(chatTrace);

      // 无依据，直接返回固定回复
      await prisma.message.create({
        data: {
          notebookId,
          role: "assistant",
          content: NO_EVIDENCE_RESPONSE,
          answerMode: "no_evidence",
          citations: [],
          metadata: {
            traceId,
            strategyVersion: ragStrategyConfig.strategyVersion,
            retrievalMs: retrievalResult.retrievalMs,
            embeddingMs: retrievalResult.embeddingMs,
            generationMs: 0,
            model: "none",
            topK: chunks.length,
            chunkCount: 0,
            confidence: retrievalResult.confidence,
            confidenceLevel: retrievalResult.confidenceLevel,
            retrievalDecision: "no_evidence",
            diagnostics: chatTrace as unknown as Prisma.InputJsonValue,
            retrievalDetails:
              retrievalDetails as unknown as Prisma.InputJsonValue,
          },
        },
      });

      return new Response(
        JSON.stringify({
          content: NO_EVIDENCE_RESPONSE,
          citations: [],
          answerMode: "no_evidence",
          retrievalDetails,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 3. 组装 Prompt（M1: 传入 retrievalDecision 以选择证据约束模板）
    const chatHistory = messages
      .slice(0, -1)
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const promptMessages = buildMessages({
      chunks,
      userQuestion,
      chatHistory,
      useDynamicPrompt: true,
      confidenceLevel: retrievalResult.confidenceLevel,
      retrievalDecision,
    });

    // 4. 调用 API 流式生成
    const isZhipu = modelConfig.provider === "zhipu";
    const apiUrl = isZhipu
      ? `${modelConfig.baseUrl}/paas/v4/chat/completions`
      : `${modelConfig.baseUrl}/v1/chat/completions`;

    const requestBody = {
      model: modelConfig.model,
      messages: promptMessages,
      stream: true,
    };

    logger.info("[Chat] 调用 LLM:", {
      traceId,
      provider: modelConfig.provider,
      model: modelConfig.model,
      retrievalDecision,
      promptLength: promptMessages.length,
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${modelConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[Chat] LLM API 错误:", response.status, error);
      throw new Error(`Chat API 错误: ${response.status} - ${error}`);
    }

    // 5. 转换流式响应
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullContent = "";

    // 使用 TransformStream 逐块处理
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        // chunk 已经是 Uint8Array，直接解码
        const text = decoder.decode(chunk, { stream: true });

        if (process.env.NODE_ENV === "development") {
          console.log("[Chat] 收到 raw chunk:", text);
        }

        const lines = text.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              console.log("[Chat] 流式传输完成，总长度:", fullContent.length);

              // M1: 执行引用一致性快检（非阻塞，纯字符串操作）
              const validationResult = validateCitationConsistency(
                fullContent,
                citations,
              );

              // 构造 citations 数据（M1: 包含校验结果和诊断信息）
              const generationMs =
                Date.now() -
                startTime -
                retrievalResult.retrievalMs -
                retrievalResult.embeddingMs;
              const citationsData = JSON.stringify({
                citations,
                answerMode:
                  retrievalDecision === "uncertain"
                    ? "grounded_uncertain"
                    : "grounded",
                // M1: 诊断信息
                traceId,
                validationResult,
                retrievalDetails: {
                  ...retrievalDetails,
                  timing: {
                    ...retrievalDetails.timing,
                    generation: generationMs,
                    validation: validationResult.durationMs,
                    total: Date.now() - startTime,
                  },
                },
              });

              // 发送 citations 标记
              controller.enqueue(
                encoder.encode(
                  `\n\n__CITATIONS__${citationsData}__CITATIONS_END__`,
                ),
              );

              // M1: 构建完整诊断日志
              const chatTrace: ChatTraceLog = {
                traceId,
                notebookId,
                strategyVersion: ragStrategyConfig.strategyVersion,
                retrievalDecision,
                evidenceStats: evidenceStats || {
                  totalChunks: 0,
                  uniqueSources: 0,
                  avgSimilarity: 0,
                  maxSimilarity: 0,
                  aboveThreshold: 0,
                  coverage: 0,
                  scoreGap: 0,
                },
                validationResult,
                confidence: confidenceDetail || {
                  score: retrievalResult.confidence || 0,
                  level: retrievalResult.confidenceLevel || "low",
                  components: { similarity: 0, diversity: 0, coverage: 0 },
                },
                timing: {
                  embedding: retrievalResult.embeddingMs,
                  retrieval: retrievalResult.retrievalMs,
                  generation: generationMs,
                  validation: validationResult.durationMs,
                  total: Date.now() - startTime,
                },
                model: modelConfig.model,
                m2Diagnostics: retrievalResult.m2Diagnostics as ChatTraceLog["m2Diagnostics"],
              };
              logger.chatTrace(chatTrace);

              // 异步保存消息到数据库（M1: 包含完整诊断 metadata）
              try {
                await prisma.message.create({
                  data: {
                    notebookId,
                    role: "assistant",
                    content: fullContent,
                    answerMode:
                      retrievalDecision === "uncertain"
                        ? "grounded_uncertain"
                        : "grounded",
                    citations: citations as unknown as Prisma.InputJsonValue,
                    metadata: {
                      traceId,
                      strategyVersion: ragStrategyConfig.strategyVersion,
                      retrievalMs: retrievalResult.retrievalMs,
                      embeddingMs: retrievalResult.embeddingMs,
                      generationMs,
                      model: modelConfig.model,
                      topK: chunks.length,
                      chunkCount: chunks.length,
                      confidence: retrievalResult.confidence,
                      confidenceLevel: retrievalResult.confidenceLevel,
                      retrievalDecision,
                      validationResult:
                        validationResult as unknown as Prisma.InputJsonValue,
                      diagnostics:
                        chatTrace as unknown as Prisma.InputJsonValue,
                      retrievalDetails: {
                        ...retrievalDetails,
                        timing: {
                          ...retrievalDetails.timing,
                          generation: generationMs,
                          validation: validationResult.durationMs,
                          total: Date.now() - startTime,
                        },
                      } as unknown as Prisma.InputJsonValue,
                    },
                  },
                });
              } catch (e) {
                console.error("[Chat] 保存消息失败:", e);
              }
              continue;
            }

            try {
              const json = JSON.parse(data);

              // LongCat 的内容在 reasoning_content 字段，智谱在 content 字段
              let content = "";
              if (modelConfig.provider === "longcat") {
                content = json.choices?.[0]?.delta?.reasoning_content || "";
              } else {
                content = json.choices?.[0]?.delta?.content || "";
              }

              if (content) {
                fullContent += content;
                controller.enqueue(encoder.encode(content));
              }
            } catch (e) {
              // 忽略非 JSON 行或解析错误
            }
          }
        }
      },
    });

    return new Response(response.body?.pipeThrough(transformStream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Chat API] 错误:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
