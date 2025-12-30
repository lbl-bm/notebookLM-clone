/**
 * Studio 模块导出
 * US-008: Studio 动作生成产物
 */

export { generateArtifact, type StudioMode, type GenerateResult } from './generator'
export { getPrompt, type ArtifactType } from './prompts'
export { 
  getSourceContentSmart, 
  getSourceContentsForMapReduce,
  getChunksStats,
  estimateTokens,
  type ContentStats 
} from './content'
export { 
  parseQuiz, 
  parseMindMap, 
  safeParseJSON,
  type Quiz,
  type MindMap,
  type MindMapNode,
  QUIZ_FALLBACK,
  MINDMAP_FALLBACK
} from './parser'
