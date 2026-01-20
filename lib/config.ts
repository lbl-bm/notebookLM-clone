/**
 * 应用配置
 * 包含向量维度一致性检查（架构风险 8.1）
 */

// 向量维度配置（必须与数据库 vector(D) 一致！）
export const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM || '1024')
const EXPECTED_DIM = 1024 // 与 Prisma migration 中的维度一致

// 🔴 架构风险 8.1: 启动时强制检查维度一致性
if (EMBEDDING_DIM !== EXPECTED_DIM) {
  throw new Error(
    `❌ 向量维度不一致！EMBEDDING_DIM (${EMBEDDING_DIM}) 必须等于 ${EXPECTED_DIM}。` +
    `\n请检查 .env.local 文件和数据库 schema。` +
    `\n详见 PROJECT_SPEC.md 第 8.1 章。`
  )
}

// Supabase 配置
export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  secretKey: process.env.SUPABASE_SECRET_KEY!,
}

// 智谱 AI 配置
export const zhipuConfig = {
  apiKey: process.env.ZHIPU_API_KEY!,
  baseUrl: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api',
  embeddingModel: process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3',
  chatModel: process.env.ZHIPU_CHAT_MODEL || 'glm-4-flash',
  studioModel: process.env.ZHIPU_STUDIO_MODEL || process.env.ZHIPU_CHAT_MODEL || 'glm-4-flash',
}

// LongCat 配置
export const longcatConfig = {
  apiKey: process.env.LONGCAT_API_KEY!,
  baseUrl: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai',
  chatModel: process.env.LONGCAT_CHAT_MODEL || 'LongCat-Flash-Thinking',
}

// 模型提供商配置
export type ModelProvider = 'zhipu' | 'longcat'

export interface ModelConfig {
  provider: ModelProvider
  model: string
  displayName: string
}

export const availableModels: ModelConfig[] = [
  {
    provider: 'zhipu',
    model: zhipuConfig.chatModel,
    displayName: '智谱 GLM-4-Flash',
  },
  {
    provider: 'longcat',
    model: longcatConfig.chatModel,
    displayName: 'LongCat 思维模型',
  },
]

// 获取模型配置
export function getModelConfig(provider: ModelProvider) {
  if (provider === 'longcat') {
    return {
      apiKey: longcatConfig.apiKey,
      baseUrl: longcatConfig.baseUrl,
      model: longcatConfig.chatModel,
    }
  }
  return {
    apiKey: zhipuConfig.apiKey,
    baseUrl: zhipuConfig.baseUrl,
    model: zhipuConfig.chatModel,
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
