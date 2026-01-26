/**
 * 内容生成模块
 * US-008: Studio 动作生成产物
 */

import pLimit from "p-limit";
import { longcatConfig } from "@/lib/config";
import {
  getPrompt,
  MAP_PROMPTS,
  REDUCE_PROMPTS,
  type ArtifactType,
} from "./prompts";
import {
  getSourceContentSmart,
  getSourceContentsForMapReduce,
  truncateContextSmart,
  estimateTokens,
  type ContentStats,
} from "./content";
import { parseQuiz, parseMindMap } from "./parser";

// 配置
const MAX_OUTPUT_TOKENS = 4096; // 增加 token 限制，推理模型需要更多空间
const TIMEOUT_FAST = 90000; // 快速模式 90 秒（推理模型需要更长时间）
const TIMEOUT_PRECISE = 180000; // 精准模式 180 秒
const TIMEOUT_MAP_STEP = 45000; // Map 步骤 45 秒
const MAP_CONCURRENCY_LIMIT = 8; // Map 阶段并发数限制
const MAP_MAX_RETRIES = 2; // Map 失败最大重试次数

// 强制使用 LongCat 配置
const studioModelConfig = {
  apiKey: longcatConfig.apiKey,
  baseUrl: longcatConfig.baseUrl,
  model: longcatConfig.chatModel,
  provider: "longcat" as const,
};

const studioChatUrl = `${studioModelConfig.baseUrl}/v1/chat/completions`;

export type StudioMode = "fast" | "precise";

export interface GenerateResult {
  content: string;
  stats: ContentStats & {
    mode: StudioMode;
    strategy: string;
    duration: number;
  };
  parseSuccess?: boolean;
}

/**
 * 带超时的 LLM 调用
 */
async function callLLM(
  prompt: string,
  timeoutMs: number = TIMEOUT_FAST
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(studioChatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${studioModelConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: studioModelConfig.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      console.error("[LLM] API 错误:", response.status, error);
      throw new Error(`API 错误: ${response.status}`);
    }

    const data = await response.json();

    // 优先使用 content，如果为空则尝试从 reasoning_content 提取（针对推理模型）
    const finishReason = data.choices[0]?.finish_reason;
    let content = data.choices[0]?.message?.content || "";

    // 如果 content 为空但有 reasoning_content，尝试从中提取 JSON
    if (!content && data.choices[0]?.message?.reasoning_content) {
      const reasoning = data.choices[0].message.reasoning_content;

      // 尝试从推理内容中提取 JSON
      const jsonMatch =
        reasoning.match(/```json\s*([\s\S]*?)```/) ||
        reasoning.match(/\{[\s\S]*"root"[\s\S]*\}/) ||
        reasoning.match(/\{[\s\S]*"questions"[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[1] || jsonMatch[0];
      }
    }

    // 仅在开发环境记录空响应
    if (!content && process.env.NODE_ENV === "development") {
      console.error("[LLM] 返回内容为空，完整响应:", JSON.stringify(data));
    }

    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw error;
  }
}

/**
 * 快速模式生成 - 智能采样
 */
async function generateFast(
  notebookId: string,
  type: ArtifactType,
  sourceIds?: string[]
): Promise<GenerateResult> {
  const startTime = Date.now();

  // 获取采样内容
  const { content: context, stats } = await getSourceContentSmart(
    notebookId,
    sourceIds
  );

  // 获取 prompt 并替换上下文
  const prompt = getPrompt(type).replace("{context}", context);

  // 调用 LLM
  const rawContent = await callLLM(prompt, TIMEOUT_FAST);

  // 处理结果
  let content = rawContent;
  let parseSuccess = true;

  if (type === "quiz") {
    const { quiz, success } = parseQuiz(rawContent);
    content = JSON.stringify(quiz);
    parseSuccess = success;
    if (!success && process.env.NODE_ENV === "development") {
      console.error(`[Studio] Quiz 解析失败，原始内容:`, rawContent);
    }
  } else if (type === "mindmap") {
    const { mindmap, success } = parseMindMap(rawContent);
    content = JSON.stringify(mindmap);
    parseSuccess = success;
    if (!success && process.env.NODE_ENV === "development") {
      console.error(`[Studio] MindMap 解析失败，原始内容:`, rawContent);
    }
  }

  return {
    content,
    stats: {
      ...stats,
      mode: "fast",
      strategy: "smart_sampling",
      duration: Date.now() - startTime,
    },
    parseSuccess,
  };
}

/**
 * Map 阶段单个 Source 处理结果
 */
interface MapResult {
  sourceTitle: string;
  status: "success" | "failed" | "timeout";
  content?: string;
  error?: string;
  retryCount: number;
}

/**
 * 并行处理 Map 阶段
 * 使用 p-limit 控制并发数，支持重试机制
 */
async function parallelMapSources(
  sources: Array<{ sourceTitle: string; content: string }>,
  mapPromptTemplate: string,
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<MapResult[]> {
  const limit = pLimit(MAP_CONCURRENCY_LIMIT);
  const results: MapResult[] = [];
  let completed = 0;

  // 处理单个 source 的函数（带重试）
  const processSource = async (
    source: { sourceTitle: string; content: string },
    retryCount: number = 0
  ): Promise<MapResult> => {
    const mapPrompt = mapPromptTemplate
      .replace("{source_title}", source.sourceTitle)
      .replace("{content}", source.content);

    try {
      const result = await callLLM(mapPrompt, TIMEOUT_MAP_STEP);
      return {
        sourceTitle: source.sourceTitle,
        status: "success",
        content: result,
        retryCount,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      // 超时或其他错误，尝试重试
      if (retryCount < MAP_MAX_RETRIES) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[Map] Source ${source.sourceTitle} 失败，重试 ${
              retryCount + 1
            }/${MAP_MAX_RETRIES}`
          );
        }
        // 等待一段时间后重试（指数退避）
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, retryCount))
        );
        return processSource(source, retryCount + 1);
      }

      if (process.env.NODE_ENV === "development") {
        console.error(`[Map] Source ${source.sourceTitle} 最终失败:`, error);
      }

      return {
        sourceTitle: source.sourceTitle,
        status: errorMessage === "TIMEOUT" ? "timeout" : "failed",
        error: errorMessage,
        retryCount,
      };
    }
  };

  // 并发执行所有 source 的处理
  const tasks = sources.map((source) =>
    limit(async () => {
      const result = await processSource(source);
      completed++;

      // 调用进度回调
      if (onProgress) {
        onProgress(completed, sources.length, source.sourceTitle);
      }

      return result;
    })
  );

  // 等待所有任务完成
  const allResults = await Promise.allSettled(tasks);

  // 提取结果
  for (const result of allResults) {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      // Promise 本身失败（极罕见）
      results.push({
        sourceTitle: "unknown",
        status: "failed",
        error: result.reason?.message || "Unknown error",
        retryCount: 0,
      });
    }
  }

  return results;
}

/**
 * 树状 Reduce：递归归约算法
 * 将 N 个中间结果两两归约，避免上下文超限
 * @param results 中间结果列表
 * @param reducePromptTemplate Reduce Prompt 模板
 * @param maxTokensPerReduce 每次 Reduce 的最大 token 数
 * @returns 最终合并结果
 */
async function treeReduceResults(
  results: string[],
  reducePromptTemplate: string,
  maxTokensPerReduce: number = 4000
): Promise<string> {
  // 基准情况：只有一个结果，直接返回
  if (results.length === 1) {
    return results[0];
  }

  // 基准情况：结果足够少，一次性 Reduce
  const combinedTokens = results.reduce((sum, r) => sum + estimateTokens(r), 0);
  if (results.length <= 2 || combinedTokens <= maxTokensPerReduce) {
    const combined = results.join("\n\n---\n\n");
    const truncated = truncateContextSmart(combined, maxTokensPerReduce);
    const prompt = reducePromptTemplate.replace(
      "{intermediate_results}",
      truncated
    );
    return await callLLM(prompt, TIMEOUT_PRECISE);
  }

  // 递归情况：将结果两两分组
  const pairs: string[] = [];

  // 两两配对
  for (let i = 0; i < results.length; i += 2) {
    if (i + 1 < results.length) {
      // 有配对的情况
      const pair = `${results[i]}

${results[i + 1]}`;
      pairs.push(pair);
    } else {
      // 单个元素，直接保留
      pairs.push(results[i]);
    }
  }

  // 并行处理同一轮的所有归约
  const reduceTasks = pairs.map(async (pair) => {
    const pairTokens = estimateTokens(pair);

    // 如果单个 pair 就超过限制，需要截断
    if (pairTokens > maxTokensPerReduce) {
      const truncated = truncateContextSmart(pair, maxTokensPerReduce);
      const prompt = reducePromptTemplate.replace(
        "{intermediate_results}",
        truncated
      );
      return await callLLM(prompt, TIMEOUT_PRECISE);
    } else {
      const prompt = reducePromptTemplate.replace(
        "{intermediate_results}",
        pair
      );
      return await callLLM(prompt, TIMEOUT_PRECISE);
    }
  });

  // 等待当前轮所有归约完成
  const reducedResults = await Promise.all(reduceTasks);

  // 递归处理下一轮
  return treeReduceResults(
    reducedResults,
    reducePromptTemplate,
    maxTokensPerReduce
  );
}

/**
 * 精准模式生成 - Map-Reduce（并行优化版）
 */
async function generatePrecise(
  notebookId: string,
  type: ArtifactType,
  sourceIds?: string[],
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<GenerateResult> {
  const startTime = Date.now();

  // 获取每个 Source 的内容
  const { sources, stats } = await getSourceContentsForMapReduce(
    notebookId,
    sourceIds
  );

  // Map 阶段：并行处理每个 Source
  const mapPromptTemplate = MAP_PROMPTS[type];
  const mapResults = await parallelMapSources(
    sources,
    mapPromptTemplate,
    onProgress
  );

  // 提取成功的中间结果
  const intermediateResults: string[] = [];
  const failedSources: string[] = [];

  for (const result of mapResults) {
    if (result.status === "success" && result.content) {
      intermediateResults.push(`## ${result.sourceTitle}\n${result.content}`);
    } else {
      failedSources.push(
        `${result.sourceTitle} (${result.status}${
          result.error ? ": " + result.error : ""
        })`
      );
    }
  }

  // 记录失败信息
  if (failedSources.length > 0 && process.env.NODE_ENV === "development") {
    console.warn(
      `[Map] ${failedSources.length}/${sources.length} sources 失败:`,
      failedSources
    );
  }

  if (intermediateResults.length === 0) {
    throw new Error("GENERATION_FAILED: 所有 Source 处理失败");
  }

  // Reduce 阶段：使用树状归约合并结果
  const reducePromptTemplate = REDUCE_PROMPTS[type];
  const rawContent = await treeReduceResults(
    intermediateResults.map((r) => r), // 传入中间结果数组
    reducePromptTemplate,
    6000 // 每次 Reduce 的最大 token 数
  );

  // 处理结果
  let content = rawContent;
  let parseSuccess = true;

  if (type === "quiz") {
    const { quiz, success } = parseQuiz(rawContent);
    content = JSON.stringify(quiz);
    parseSuccess = success;
  } else if (type === "mindmap") {
    const { mindmap, success } = parseMindMap(rawContent);
    content = JSON.stringify(mindmap);
    parseSuccess = success;
  }

  return {
    content,
    stats: {
      ...stats,
      mode: "precise",
      strategy: "map_reduce_parallel",
      duration: Date.now() - startTime,
    },
    parseSuccess,
  };
}

/**
 * 生成产物 - 统一入口
 */
export async function generateArtifact(params: {
  notebookId: string;
  type: ArtifactType;
  mode: StudioMode;
  sourceIds?: string[];
}): Promise<GenerateResult> {
  const { notebookId, type, mode, sourceIds } = params;

  try {
    if (mode === "precise") {
      return await generatePrecise(notebookId, type, sourceIds);
    } else {
      return await generateFast(notebookId, type, sourceIds);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[Studio] 生成失败:`, error);
    }
    throw error;
  }
}

/**
 * 基于模板生成产物
 */
export async function generateFromTemplate(params: {
  notebookId: string;
  template: string;
  variables: Record<string, string>;
  sourceIds?: string[];
}): Promise<GenerateResult> {
  const { notebookId, template, variables, sourceIds } = params;
  const startTime = Date.now();

  // 1. 获取上下文（如果模板包含 {{context}}）
  let finalPrompt = template;
  let stats: ContentStats = {
    totalChunks: 0,
    usedChunks: 0,
    estimatedTokens: 0,
    sourceCount: 0,
  };

  if (template.includes("{{context}}")) {
    const { content: context, stats: contextStats } =
      await getSourceContentSmart(notebookId, sourceIds);
    finalPrompt = finalPrompt.replaceAll("{{context}}", context);
    stats = contextStats;
  }

  // 2. 替换其他变量
  for (const [key, value] of Object.entries(variables)) {
    if (key === "context") continue; // 已经处理过了
    const placeholder = `{{${key}}}`;
    finalPrompt = finalPrompt.replaceAll(placeholder, value);
  }

  // 3. 调用 LLM
  const content = await callLLM(finalPrompt, TIMEOUT_PRECISE);

  return {
    content,
    stats: {
      ...stats,
      mode: "precise",
      strategy: "template",
      duration: Date.now() - startTime,
    },
  };
}
