/**
 * M2a: 动态 Context Token 预算管理
 *
 * 根据问题复杂度动态分配 token 预算，按优先级选择 chunk
 * 避免简单问题塞入过多上下文、复杂问题上下文不足
 */

import { ragStrategyConfig } from "@/lib/config";
import type { QuestionComplexity, BudgetDiagnostics } from "./types";

/**
 * 粗略估算文本 token 数
 * 中文约 1 字 ≈ 1.5 token，英文约 1 word ≈ 1.3 token
 * 采用保守估计确保不超预算
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;

  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [])
    .length;
  // 统计英文单词数
  const englishWords = (text.match(/[a-zA-Z]+(?:[''-][a-zA-Z]+)*/g) || [])
    .length;
  // 其他字符（标点、数字等）
  const otherChars = text.length - chineseChars - englishWords;

  return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + otherChars * 0.5);
}

/**
 * 判断问题复杂度
 * simple: 短问题、事实查询
 * moderate: 中等长度、一般分析
 * complex: 长问题、对比/总结/多步推理
 */
export function classifyComplexity(
  question: string,
  questionType?: string,
): QuestionComplexity {
  const length = question.length;

  // 复杂度指标
  const hasMultipleClauses = /[，,；;、]/.test(question);
  const hasEnumeration = /[和与及].*[和与及]/.test(question);
  const isComparative = questionType === "comparative";
  const isSummary = questionType === "summary";

  // 评分
  let complexityScore = 0;

  // 长度贡献
  if (length > 80) complexityScore += 2;
  else if (length > 40) complexityScore += 1;

  // 结构贡献
  if (hasMultipleClauses) complexityScore += 1;
  if (hasEnumeration) complexityScore += 1;

  // 问题类型贡献
  if (isComparative || isSummary) complexityScore += 1;

  if (complexityScore >= 3) return "complex";
  if (complexityScore >= 1) return "moderate";
  return "simple";
}

/**
 * 根据复杂度计算 token 预算
 */
export function calculateBudget(complexity: QuestionComplexity): number {
  const base = ragStrategyConfig.baseTokenBudget;
  const max = ragStrategyConfig.maxTokenBudget;

  switch (complexity) {
    case "simple":
      return Math.min(base, max);
    case "moderate":
      return Math.min(Math.round(base * 1.3), max);
    case "complex":
      return Math.min(Math.round(base * 1.8), max);
  }
}

/**
 * 按优先级分配预算，选择 chunk 子集
 * chunk 已按分数降序排列，优先选高分 chunk
 *
 * @returns 选中的 chunk 索引列表 + 诊断
 */
export function allocateBudget(
  chunks: Array<{ content: string; similarity: number }>,
  totalBudget: number,
  complexity: QuestionComplexity,
): { selectedIndices: number[]; diagnostics: BudgetDiagnostics } {
  const selectedIndices: number[] = [];
  let usedTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkTokens = estimateTokenCount(chunks[i].content);
    if (usedTokens + chunkTokens <= totalBudget) {
      selectedIndices.push(i);
      usedTokens += chunkTokens;
    }
  }

  return {
    selectedIndices,
    diagnostics: {
      totalBudget,
      usedTokens,
      selectedChunks: selectedIndices.length,
      truncatedChunks: chunks.length - selectedIndices.length,
      complexity,
    },
  };
}
