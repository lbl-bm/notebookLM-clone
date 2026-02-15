/**
 * RAG 模块导出
 */

export {
  retrieveChunks,
  hybridRetrieveChunks,
  deduplicateChunks,
  calculateConfidence,
  computeEvidenceStats,
  determineRetrievalDecision,
  RAG_CONFIG,
  type RetrievedChunk,
  type RetrievalResult,
  type RetrievalType,
  type RetrievalScores,
  type RetrievalDecision,
  type EvidenceStats,
  type ConfidenceResult,
} from "./retriever";

export {
  buildContext,
  buildMessages,
  buildCitations,
  classifyQuestion,
  SYSTEM_PROMPT,
  NO_EVIDENCE_RESPONSE,
  FALLBACK_RESPONSE,
  type Citation,
} from "./prompt";

export {
  validateCitationConsistency,
  type ValidationResult,
} from "./validator";

// M2 模块导出
export {
  estimateTokenCount,
  classifyComplexity,
  calculateBudget,
  allocateBudget,
} from "./context-budget";

export { calculateDynamicTopK } from "./dynamic-topk";

export {
  normalizeRouteScores,
  removeNearDuplicates,
  applySourceDiversityConstraint,
  fuseCandidates,
} from "./fusion";

export { extractKeywords, generateExpansions, rewriteQuery } from "./query-rewriter";

export { stage2Rerank } from "./reranker";

export type {
  QuestionComplexity,
  QueryAnalysis,
  FusionCandidate,
  FusionResult,
  FusionDiagnostics,
  DynamicTopKDiagnostics,
  BudgetDiagnostics,
  QueryRewriteDiagnostics,
  RerankDiagnostics,
  M2PipelineDiagnostics,
} from "./types";
