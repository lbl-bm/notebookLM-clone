/**
 * 应用配置
 * 包含向量维度一致性检查（架构风险 8.1）
 */

// 向量维度配置（必须与数据库 vector(D) 一致！）
export const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '1024')

// ✅ P0-5: 启动时强化维度校验
if (isNaN(EMBEDDING_DIM) || EMBEDDING_DIM <= 0) {
  throw new Error(
    `❌ 向量维度配置无效！EMBEDDING_DIM (${EMBEDDING_DIM}) 必须为正整数。` +
    `\n请检查 .env.local 文件。`
  )
}

// ✅ P0-5: 强制锁定维度为 1024（智谱 embedding-3）
const REQUIRED_DIM = 1024
if (EMBEDDING_DIM !== REQUIRED_DIM) {
  throw new Error(
    `❌ 向量维度配置错误！\n` +
    `当前系统仅支持 ${REQUIRED_DIM} 维向量（智谱 AI embedding-3 模型）。\n` +
    `您的配置: EMBEDDING_DIM=${EMBEDDING_DIM}\n\n` +
    `修复方法：\n` +
    `1. 在 .env.local 中设置 EMBEDDING_DIM=${REQUIRED_DIM}\n` +
    `2. 如需使用其他模型，请执行数据库迁移重建 document_chunks 表\n` +
    `3. 参考文档：docs/VECTOR_DATABASE.md`
  )
}

// Supabase 配置
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  secretKey: process.env.SUPABASE_SECRET_KEY!,
}

// LongCat 配置
export const longcatConfig = {
  apiKey: process.env.LONGCAT_API_KEY!,
  baseUrl: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai',
  chatModel: process.env.LONGCAT_CHAT_MODEL || 'LongCat-Flash-Thinking',
}

// 智谱 AI 配置
export const zhipuConfig = {
  apiKey: process.env.ZHIPU_API_KEY!,
  baseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api',
  embeddingModel: process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3',
  chatModel: process.env.ZHIPU_CHAT_MODEL || 'glm-4-flash',
  studioModel: process.env.ZHIPU_STUDIO_MODEL || longcatConfig.chatModel || 'LongCat-Flash-Thinking',
}

// 模型提供商配置
export type ModelProvider = 'zhipu' | 'longcat'

export const STUDIO_DEFAULT_MODEL: ModelProvider = 'longcat'

export interface ModelConfig {
  id: string
  provider: ModelProvider
  model: string
  displayName: string
  description: string
  icon: 'zap' | 'target'
}

export const availableModels: ModelConfig[] = [
  {
    id: 'fast',
    provider: 'zhipu',
    model: zhipuConfig.chatModel,
    displayName: zhipuConfig.chatModel,
    description: '',
    icon: 'zap',
  },
  {
    id: 'precise',
    provider: 'longcat',
    model: longcatConfig.chatModel,
    displayName: longcatConfig.chatModel,
    description: '',
    icon: 'target',
  },
]

// 获取模型配置
export function getModelConfig(mode: 'fast' | 'precise' = 'fast') {
  const selected = availableModels.find(m => m.id === mode) || availableModels[0]
  
  if (selected.provider === 'longcat') {
    return {
      apiKey: longcatConfig.apiKey,
      baseUrl: longcatConfig.baseUrl,
      model: longcatConfig.chatModel,
      provider: 'longcat' as const,
    }
  }
  return {
    apiKey: zhipuConfig.apiKey,
    baseUrl: zhipuConfig.baseUrl,
    model: zhipuConfig.chatModel,
    provider: 'zhipu' as const,
  }
}

export function getStudioModelConfig() {
  if (STUDIO_DEFAULT_MODEL === 'longcat') {
    return {
      apiKey: longcatConfig.apiKey,
      baseUrl: longcatConfig.baseUrl,
      model: longcatConfig.chatModel,
      provider: 'longcat' as const,
    }
  }
  return {
    apiKey: zhipuConfig.apiKey,
    baseUrl: zhipuConfig.baseUrl,
    model: zhipuConfig.studioModel,
    provider: 'zhipu' as const,
  }
}

// 应用配置
export const appConfig = {
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  chunkSize: 1000, // tokens per chunk
  topK: 8, // 检索 topK chunks
  similarityThreshold: 0.7, // 相似度阈值
}

// 验证必需的环境变量
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'DATABASE_URL',
    'ZHIPU_API_KEY',
    'EMBEDDING_DIM',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `❌ 缺少必需的环境变量: ${missing.join(', ')}\n` +
      `请复制 .env.example 到 .env.local 并填写实际值。`
    )
  }
}
