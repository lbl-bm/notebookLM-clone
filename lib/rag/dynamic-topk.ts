/**
 * M2a: 动态 TopK 计算
 *
 * 根据问题复杂度和类型动态调整 topK，
 * 简单问题减少候选、复杂问题增加候选
 */

import { RAG_CONFIG } from "./retriever";
import type { QuestionComplexity, DynamicTopKDiagnostics } from "./types";

/**
 * 计算动态 topK
 */
export function calculateDynamicTopK(params: {
  complexity: QuestionComplexity;
  questionType?: string;
  baseTopK?: number;
}): { topK: number; diagnostics: DynamicTopKDiagnostics } {
  const { complexity, questionType, baseTopK = RAG_CONFIG.topK } = params;

  // 复杂度调整
  let complexityAdjust = 0;
  switch (complexity) {
    case "simple":
      complexityAdjust = -2;
      break;
    case "moderate":
      complexityAdjust = 0;
      break;
    case "complex":
      complexityAdjust = 2;
      break;
  }

  // 问题类型调整
  let typeAdjust = 0;
  if (questionType === "comparative" || questionType === "summary") {
    typeAdjust = 2;
  }

  // 计算最终 topK，限制范围 [4, 16]
  const finalTopK = Math.max(
    4,
    Math.min(16, baseTopK + complexityAdjust + typeAdjust),
  );

  return {
    topK: finalTopK,
    diagnostics: {
      baseTopK,
      complexityAdjust,
      typeAdjust,
      finalTopK,
    },
  };
}
