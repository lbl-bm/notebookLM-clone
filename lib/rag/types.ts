/**
 * M2 集中类型定义
 * 供 fusion / context-budget / dynamic-topk / query-rewriter / reranker 共用
 */

import type { QuestionType } from "./prompt";

/**
 * 问题复杂度（由 context-budget 判定）
 */
export type QuestionComplexity = "simple" | "moderate" | "complex";

/**
 * 查询分析结果
 */
export interface QueryAnalysis {
  /** 原始查询 */
  originalQuery: string;
  /** 问题类型 (来自 prompt.ts classifyQuestion) */
  questionType: QuestionType;
  /** 问题复杂度 */
  complexity: QuestionComplexity;
  /** M2b: 提取的关键词列表 */
  keywords: string[];
  /** M2b: 查询扩展文本列表 */
  expansions: string[];
}

/**
 * 候选 chunk（融合前，携带路由信息）
 */
export interface FusionCandidate {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  metadata: {
    page?: number;
    startChar: number;
    endChar: number;
    tokenCount: number;
  };
  /** 归一化前的原始分数 */
  rawScore: number;
  /** min-max 归一化后的分数 (0-1) */
  normalizedScore: number;
  /** 来源路由标识 */
  route: "primary" | "expansion";
  /** 向量分数 */
  vectorScore?: number;
  /** 全文检索分数 */
  ftsScore?: number;
}

/**
 * 融合结果
 */
export interface FusionResult {
  /** 融合后的候选列表 */
  candidates: FusionCandidate[];
  /** 融合诊断 */
  diagnostics: FusionDiagnostics;
}

/**
 * 融合诊断信息
 */
export interface FusionDiagnostics {
  /** 各路由的候选数 */
  routeCounts: Record<string, number>;
  /** 去重前总数 */
  totalBeforeDedup: number;
  /** 近似重复移除数 */
  nearDuplicatesRemoved: number;
  /** 来源多样性截断数 */
  diversityTruncated: number;
  /** 融合后总数 */
  totalAfterFusion: number;
}

/**
 * 动态 topK 诊断
 */
export interface DynamicTopKDiagnostics {
  /** 基础 topK */
  baseTopK: number;
  /** 复杂度调整量 */
  complexityAdjust: number;
  /** 问题类型调整量 */
  typeAdjust: number;
  /** 最终 topK */
  finalTopK: number;
}

/**
 * Context Budget 诊断
 */
export interface BudgetDiagnostics {
  /** 总预算 tokens */
  totalBudget: number;
  /** 实际使用 tokens */
  usedTokens: number;
  /** 选中的 chunk 数 */
  selectedChunks: number;
  /** 被截断的 chunk 数（超预算时） */
  truncatedChunks: number;
  /** 复杂度 */
  complexity: QuestionComplexity;
}

/**
 * M2b: 查询改写诊断
 */
export interface QueryRewriteDiagnostics {
  /** 原始查询 */
  originalQuery: string;
  /** 提取的关键词 */
  keywords: string[];
  /** 生成的扩展查询 */
  expansions: string[];
  /** 耗时 ms */
  durationMs: number;
}

/**
 * M2b: Stage-2 重排诊断
 */
export interface RerankDiagnostics {
  /** 重排前 chunk 数 */
  inputCount: number;
  /** 重排后 chunk 数 */
  outputCount: number;
  /** 关键词权重 */
  keywordWeight: number;
  /** 分数变化统计 */
  scoreChanges: {
    maxDelta: number;
    avgDelta: number;
  };
  /** 耗时 ms */
  durationMs: number;
}

/**
 * M2 管线诊断汇总（传递到前端）
 */
export interface M2PipelineDiagnostics {
  /** 动态 topK 诊断 */
  dynamicTopK?: DynamicTopKDiagnostics;
  /** 融合诊断 */
  fusion?: FusionDiagnostics;
  /** 预算诊断 */
  budget?: BudgetDiagnostics;
  /** M2b: 查询改写诊断 */
  queryRewrite?: QueryRewriteDiagnostics;
  /** M2b: 重排诊断 */
  rerank?: RerankDiagnostics;
  /** 管线各阶段耗时 */
  stageTiming?: Record<string, number>;
}
