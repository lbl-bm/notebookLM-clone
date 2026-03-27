/**
 * M2b: Stage-2 关键词增强重排
 *
 * 在 MMR (Stage-1) 之后，基于关键词覆盖率对候选 chunk 进行二次评分
 * 公式: finalScore = (1 - weight) * existingScore + weight * keywordScore
 */

import { ragStrategyConfig } from "@/lib/config";
import type { RerankDiagnostics } from "./types";

/**
 * 计算单个 chunk 对关键词列表的覆盖率 (0-1)
 *
 * 对中文关键词：去除所有空格后做子串匹配（中文无单词边界，空格是噪声）
 * 对英文关键词：toLowerCase 后做子串匹配（原有行为）
 */
function keywordCoverage(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  // 预处理 content：保留一份去空格版用于中文匹配
  const lowerContent = content.toLowerCase();
  const normalizedContent = lowerContent.replace(/\s+/g, "");

  let matched = 0;

  for (const keyword of keywords) {
    const lowerKw = keyword.toLowerCase();
    // 中文关键词（含至少一个 CJK 字符）去空格后匹配，英文直接匹配
    const isChinese = /[\u4e00-\u9fff]/.test(lowerKw);
    const normalizedKw = isChinese ? lowerKw.replace(/\s+/g, "") : lowerKw;

    if (isChinese ? normalizedContent.includes(normalizedKw) : lowerContent.includes(normalizedKw)) {
      matched++;
    }
  }

  return matched / keywords.length;
}

/**
 * Stage-2 关键词增强重排
 *
 * @param chunks 经过 MMR 的候选 chunk（含 similarity 字段）
 * @param keywords 从查询中提取的关键词
 * @param weight 关键词分数权重，默认从配置读取
 * @returns 重排后的 chunk + 诊断
 */
export function stage2Rerank<T extends { content: string; similarity: number }>(
  chunks: T[],
  keywords: string[],
  weight?: number,
): { result: T[]; diagnostics: RerankDiagnostics } {
  const startTime = Date.now();
  const rerankWeight = weight ?? ragStrategyConfig.stage2RerankWeight;

  if (chunks.length === 0 || keywords.length === 0) {
    return {
      result: [...chunks],
      diagnostics: {
        inputCount: chunks.length,
        outputCount: chunks.length,
        keywordWeight: rerankWeight,
        scoreChanges: { maxDelta: 0, avgDelta: 0 },
        durationMs: Date.now() - startTime,
      },
    };
  }

  // 计算每个 chunk 的关键词增强分数
  const scored = chunks.map((chunk) => {
    const kwScore = keywordCoverage(chunk.content, keywords);
    const originalScore = chunk.similarity;
    const newScore =
      (1 - rerankWeight) * originalScore + rerankWeight * kwScore;

    return {
      chunk,
      originalScore,
      newScore,
      delta: Math.abs(newScore - originalScore),
    };
  });

  // 按新分数降序排列
  scored.sort((a, b) => b.newScore - a.newScore);

  // 计算分数变化统计
  const deltas = scored.map((s) => s.delta);
  const maxDelta = Math.max(...deltas);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  // 更新 similarity 字段为新分数
  const result = scored.map((s) => ({
    ...s.chunk,
    similarity: s.newScore,
  }));

  return {
    result,
    diagnostics: {
      inputCount: chunks.length,
      outputCount: result.length,
      keywordWeight: rerankWeight,
      scoreChanges: { maxDelta, avgDelta },
      durationMs: Date.now() - startTime,
    },
  };
}
