/**
 * RAG 模块导出
 */

export {
  retrieveChunks,
  deduplicateChunks,
  RAG_CONFIG,
  type RetrievedChunk,
  type RetrievalResult,
} from './retriever'

export {
  buildContext,
  buildMessages,
  buildCitations,
  SYSTEM_PROMPT,
  NO_EVIDENCE_RESPONSE,
  type Citation,
} from './prompt'
