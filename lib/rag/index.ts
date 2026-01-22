/**
 * RAG 模块导出
 */

export {
  retrieveChunks,
  hybridRetrieveChunks,
  deduplicateChunks,
  RAG_CONFIG,
  type RetrievedChunk,
  type RetrievalResult,
  type RetrievalType,
  type RetrievalScores,
} from './retriever'

export {
  buildContext,
  buildMessages,
  buildCitations,
  SYSTEM_PROMPT,
  NO_EVIDENCE_RESPONSE,
  type Citation,
} from './prompt'
