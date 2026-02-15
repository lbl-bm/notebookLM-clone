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
