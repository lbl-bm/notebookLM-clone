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
  chatModel: process.env.ZHIPU_CHAT_MODEL || 'glm-4.7',
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

// 对话可用的智谱模型列表
export const zhipuChatModels: ModelConfig[] = [
  {
    id: 'glm-4.7',
    provider: 'zhipu',
    model: 'glm-4.7',
    displayName: 'GLM-4.7(质量最高)',
    description: '最新旗舰模型',
    icon: 'zap',
  },
  {
    id: 'glm-4.7-flashx',
    provider: 'zhipu',
    model: 'glm-4.7-flashx',
    displayName: 'GLM-4.7 FlashX',
    description: '极速版模型',
    icon: 'zap',
  },
  {
    id: 'glm-4.5-airx',
    provider: 'zhipu',
    model: 'glm-4.5-airx',
    displayName: 'GLM-4.5 AirX',
    description: '轻量高性价比',
    icon: 'zap',
  },
  {
    id: 'glm-4-flash',
    provider: 'zhipu',
    model: 'glm-4-flash',
    displayName: 'GLM-4 Flash(速度最快)',
    description: '免费体验版',
    icon: 'zap',
  },
]

// 可用的所有模型列表
export const availableModels: ModelConfig[] = [
  ...zhipuChatModels,
  {
    id: 'longcat',
    provider: 'longcat',
    model: longcatConfig.chatModel,
    displayName: longcatConfig.chatModel,
    description: '精准模式（推理模型）',
    icon: 'target',
  },
]

// 获取模型配置
export function getModelConfig(modelId: string = 'glm-4.7') {
  const selected = availableModels.find(m => m.id === modelId) || availableModels[0]
  
  if (selected.provider === 'longcat') {
    return {
      apiKey: longcatConfig.apiKey,
      baseUrl: longcatConfig.baseUrl,
      model: selected.model,
      provider: 'longcat' as const,
    }
  }
  return {
    apiKey: zhipuConfig.apiKey,
    baseUrl: zhipuConfig.baseUrl,
    model: selected.model,
    provider: 'zhipu' as const,
  }
}

// 根据模型 ID 判断是否为 longcat
export function isLongCatModel(modelId: string): boolean {
  const model = availableModels.find(m => m.id === modelId)
  return model?.provider === 'longcat'
}

// 根据模型 ID 获取显示名称
export function getModelDisplayName(modelId: string): string {
  const model = availableModels.find(m => m.id === modelId)
  return model?.displayName || modelId
}

export function getStudioModelConfig() {
  // 强制使用 LongCat 配置
  return {
    apiKey: longcatConfig.apiKey,
    baseUrl: longcatConfig.baseUrl,
    model: longcatConfig.chatModel,
    provider: 'longcat' as const,
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
