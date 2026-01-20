/**
 * 全局类型定义
 * 基于 PROJECT_SPEC.md 数据模型
 */

// ============================================
// 基础类型
// ============================================

export type SourceType = 'file' | 'url' | 'video' | 'text'
export type SourceStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type MessageRole = 'user' | 'assistant' | 'system'
export type AnswerMode = 'grounded' | 'no_evidence'
export type ArtifactType = 'summary' | 'outline' | 'quiz' | 'custom'
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type RetrievalType = 'vector' | 'hybrid' | 'fts'  // 混合检索类型

// ============================================
// Citations 结构（PROJECT_SPEC.md 6.2）
// ============================================

export interface Citation {
  chunkId: number
  sourceId: string
  notebookId: string
  score: number
  locator: {
    page?: number
    startChar?: number
    endChar?: number
    timestamp?: number // 视频时间戳
  }
  excerpt: string // 被引用的原文片段
}

export interface CitationsPayload {
  citations: Citation[]
  answerMode: AnswerMode
}

// ============================================
// 处理日志结构（PROJECT_SPEC.md 8.2）
// ============================================

export interface ProcessingStage {
  status: 'success' | 'partial' | 'failed'
  timestamp: string
  error?: string
}

export interface ProcessingLog {
  stages: {
    upload?: ProcessingStage & { size?: number }
    parse?: ProcessingStage & { pages?: number; chars?: number }
    chunk?: ProcessingStage & { chunks?: number }
    embed?: ProcessingStage & { success?: number; failed?: number }
    index?: ProcessingStage
  }
}

// ============================================
// Message Metadata（RAG 链路可视化）
// ============================================

export interface RetrievalScores {
  vectorScore?: number
  ftsScore?: number
  combinedScore?: number
}

export interface MessageMetadata {
  retrievalMs?: number      // 检索耗时
  generationMs?: number     // 生成耗时
  model?: string            // 使用的模型
  topK?: number             // 检索的 chunk 数量
  chunkCount?: number       // 实际返回的 chunk 数量
  queryEmbeddingMs?: number // query embedding 耗时
  retrievalDetails?: {
    query: string
    retrievalParams: {
      sourceIds: string[]
      topK: number
      threshold: number
      useHybridSearch?: boolean
      retrievalType?: RetrievalType
    }
    model: string
    chunks: Array<{
      id: string
      sourceId: string
      sourceName: string
      score: number
      content: string
      metadata: ChunkMetadata
      scores?: RetrievalScores
    }>
    timing: {
      embedding: number
      retrieval: number
      generation?: number
      total?: number
    }
  }
}

// ============================================
// Chunk 相关
// ============================================

export interface ChunkMetadata {
  page?: number
  paragraph?: number
  url?: string
  timestamp?: number
  title?: string
}

export interface DocumentChunk {
  id: number
  notebookId: string
  sourceId: string
  chunkIndex: number
  content: string
  metadata: ChunkMetadata
  embedding?: number[]
  contentHash?: string
  similarity?: number // 检索时返回
}

// ============================================
// API 请求/响应类型
// ============================================

// Notebook
export interface CreateNotebookRequest {
  title: string
}

export interface UpdateNotebookRequest {
  title?: string
}

// Source
export interface CreateSourceRequest {
  notebookId: string
  type: SourceType
  title: string
  url?: string
}

export interface UploadSourceRequest {
  notebookId: string
  file: File
}

// Chat
export interface ChatRequest {
  notebookId: string
  message: string
  sourceIds?: string[] // 可选：限定检索范围
}

export interface ChatResponse {
  content: string
  citations: Citation[]
  answerMode: AnswerMode
  metadata?: MessageMetadata
}

// Actions
export interface ActionRequest {
  notebookId: string
  sourceIds?: string[]
  templateId?: string
  variables?: Record<string, string>
}

export interface ActionResponse {
  artifactId: string
  type: ArtifactType
  content: string
}

// ============================================
// Prompt 模板
// ============================================

export interface PromptTemplate {
  id: string
  ownerId: string
  name: string
  description?: string | null
  template: string
  variables: string[]
  isSystem: boolean
  createdAt: string
  updatedAt: string
}

export interface PromptVariable {
  name: string
  description?: string
  required?: boolean
  defaultValue?: string
}

export interface PromptTemplateInput {
  name: string
  description?: string
  template: string
  variables: string[]
  isSystem?: boolean
}
