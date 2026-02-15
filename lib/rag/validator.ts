/**
 * M1: 引用一致性快检模块
 *
 * 纯字符串操作，不调用 LLM，不增加 API 成本。
 * 在 [DONE] 信号到达后、__CITATIONS__ 标记发送前执行。
 *
 * 检查逻辑：
 * 1. 提取回答中所有 [N] 引用标记
 * 2. 验证 N 是否在 citations 范围内
 * 3. 对 [N] 前的句子与对应 citation 内容做关键词重叠检查
 */

import type { Citation } from "./prompt";
import { ragStrategyConfig } from "@/lib/config";

/**
 * 引用一致性快检结果
 */
export interface ValidationResult {
  /** 验证通过的引用数量 */
  validCitations: number;
  /** 验证失败的引用数量（引用编号超出范围或关键词无重叠） */
  invalidCitations: number;
  /** 未检查的引用数量（超时或回答中无引用标记） */
  uncheckedCitations: number;
  /** 质量标签 */
  qualityLabel: "verified" | "partial" | "unchecked";
  /** 快检耗时(ms) */
  durationMs: number;
}

/**
 * 从文本中提取所有引用标记 [N] 及其前方的句子上下文
 */
function extractCitationReferences(
  text: string,
): Array<{ index: number; context: string }> {
  const results: Array<{ index: number; context: string }> = [];
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1]);
    // 提取 [N] 前方最多 200 个字符作为上下文
    const start = Math.max(0, match.index - 200);
    const context = text.slice(start, match.index).trim();
    results.push({ index, context });
  }

  return results;
}

/**
 * 计算两段文本的关键词重叠率
 * 使用简单的分词 + Jaccard 系数
 */
function keywordOverlap(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  // 简单中英文分词：按标点、空格、常见分隔符拆分
  const tokenize = (text: string): Set<string> => {
    const tokens = text
      .toLowerCase()
      .replace(/[，。！？、；：""''（）\[\]【】\s,.!?;:'"()\-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2); // 过滤单字符
    return new Set(tokens);
  };

  const set1 = tokenize(text1);
  const set2 = tokenize(text2);

  if (set1.size === 0 || set2.size === 0) return 0;

  let intersection = 0;
  for (const token of set1) {
    if (set2.has(token)) intersection++;
  }

  // Jaccard 系数
  const union = set1.size + set2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 执行引用一致性快检
 *
 * @param fullContent 完整的 LLM 生成回答
 * @param citations 引用列表
 * @returns 快检结果
 */
export function validateCitationConsistency(
  fullContent: string,
  citations: Citation[],
): ValidationResult {
  const startTime = Date.now();

  // 如果未启用校验，直接返回 unchecked
  if (!ragStrategyConfig.validationEnabled) {
    return {
      validCitations: 0,
      invalidCitations: 0,
      uncheckedCitations: citations.length,
      qualityLabel: "unchecked",
      durationMs: Date.now() - startTime,
    };
  }

  // 提取回答中的引用标记
  const refs = extractCitationReferences(fullContent);

  // 如果回答中无引用标记
  if (refs.length === 0) {
    return {
      validCitations: 0,
      invalidCitations: 0,
      uncheckedCitations: citations.length,
      qualityLabel: citations.length > 0 ? "partial" : "unchecked",
      durationMs: Date.now() - startTime,
    };
  }

  let validCount = 0;
  let invalidCount = 0;

  for (const ref of refs) {
    // 检查引用编号是否在范围内 (1-based index)
    if (ref.index < 1 || ref.index > citations.length) {
      invalidCount++;
      continue;
    }

    const citation = citations[ref.index - 1];

    // 检查引用上下文与 citation 内容的关键词重叠率
    const overlap = keywordOverlap(ref.context, citation.content);

    // 重叠率 >= 0.05 视为有效引用（阈值故意设低，避免误判）
    if (overlap >= 0.05) {
      validCount++;
    } else {
      invalidCount++;
    }

    // 超时保护
    if (Date.now() - startTime > ragStrategyConfig.validationTimeoutMs) {
      const unchecked = refs.length - validCount - invalidCount;
      return {
        validCitations: validCount,
        invalidCitations: invalidCount,
        uncheckedCitations: unchecked,
        qualityLabel: "unchecked",
        durationMs: Date.now() - startTime,
      };
    }
  }

  // 确定质量标签
  const totalChecked = validCount + invalidCount;
  let qualityLabel: "verified" | "partial" | "unchecked";

  if (totalChecked === 0) {
    qualityLabel = "unchecked";
  } else if (invalidCount === 0) {
    qualityLabel = "verified";
  } else {
    qualityLabel = "partial";
  }

  return {
    validCitations: validCount,
    invalidCitations: invalidCount,
    uncheckedCitations: 0,
    qualityLabel,
    durationMs: Date.now() - startTime,
  };
}
