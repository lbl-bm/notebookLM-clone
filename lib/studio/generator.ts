/**
 * 内容生成模块
 * US-008: Studio 动作生成产物
 */

import { zhipuConfig, longcatConfig, getStudioModelConfig } from '@/lib/config'
import { 
  getPrompt, 
  MAP_PROMPTS, 
  REDUCE_PROMPTS, 
  type ArtifactType 
} from './prompts'
import { 
  getSourceContentSmart, 
  getSourceContentsForMapReduce,
  truncateContextSmart,
  estimateTokens,
  type ContentStats 
} from './content'
import { parseQuiz, parseMindMap } from './parser'

// 配置
const MAX_OUTPUT_TOKENS = 4096  // 增加 token 限制，推理模型需要更多空间
const TIMEOUT_FAST = 90000     // 快速模式 90 秒（推理模型需要更长时间）
const TIMEOUT_PRECISE = 180000 // 精准模式 180 秒
const TIMEOUT_MAP_STEP = 45000 // Map 步骤 45 秒

// 强制使用 LongCat 配置
const studioModelConfig = {
  apiKey: longcatConfig.apiKey,
  baseUrl: longcatConfig.baseUrl,
  model: longcatConfig.chatModel,
  provider: 'longcat' as const,
}

const studioChatUrl = `${studioModelConfig.baseUrl}/v1/chat/completions`

export type StudioMode = 'fast' | 'precise'

export interface GenerateResult {
  content: string
  stats: ContentStats & {
    mode: StudioMode
    strategy: string
    duration: number
  }
  parseSuccess?: boolean
}

/**
 * 带超时的 LLM 调用
 */
async function callLLM(
  prompt: string,
  timeoutMs: number = TIMEOUT_FAST
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(studioChatUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studioModelConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: studioModelConfig.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const error = await response.text()
      console.error('[LLM] API 错误:', response.status, error)
      throw new Error(`API 错误: ${response.status}`)
    }

    const data = await response.json()
    
    // 优先使用 content，如果为空则尝试从 reasoning_content 提取（针对推理模型）
    const finishReason = data.choices[0]?.finish_reason
    let content = data.choices[0]?.message?.content || ''
    
    // 如果 content 为空但有 reasoning_content，尝试从中提取 JSON
    if (!content && data.choices[0]?.message?.reasoning_content) {
      const reasoning = data.choices[0].message.reasoning_content
      
      // 尝试从推理内容中提取 JSON
      const jsonMatch = reasoning.match(/```json\s*([\s\S]*?)```/) || 
                        reasoning.match(/\{[\s\S]*"root"[\s\S]*\}/) ||
                        reasoning.match(/\{[\s\S]*"questions"[\s\S]*\}/)
      if (jsonMatch) {
        content = jsonMatch[1] || jsonMatch[0]
      }
    }
    
    // 仅在开发环境记录空响应
    if (!content && process.env.NODE_ENV === 'development') {
      console.error('[LLM] 返回内容为空，完整响应:', JSON.stringify(data))
    }
    
    return content
  } catch (error) {
    clearTimeout(timeoutId)
    if ((error as Error).name === 'AbortError') {
      throw new Error('TIMEOUT')
    }
    throw error
  }
}

/**
 * 快速模式生成 - 智能采样
 */
async function generateFast(
  notebookId: string,
  type: ArtifactType,
  sourceIds?: string[]
): Promise<GenerateResult> {
  const startTime = Date.now()

  // 获取采样内容
  const { content: context, stats } = await getSourceContentSmart(notebookId, sourceIds)

  // 获取 prompt 并替换上下文
  const prompt = getPrompt(type).replace('{context}', context)

  // 调用 LLM
  const rawContent = await callLLM(prompt, TIMEOUT_FAST)

  // 处理结果
  let content = rawContent
  let parseSuccess = true

  if (type === 'quiz') {
    const { quiz, success } = parseQuiz(rawContent)
    content = JSON.stringify(quiz)
    parseSuccess = success
    if (!success && process.env.NODE_ENV === 'development') {
      console.error(`[Studio] Quiz 解析失败，原始内容:`, rawContent)
    }
  } else if (type === 'mindmap') {
    const { mindmap, success } = parseMindMap(rawContent)
    content = JSON.stringify(mindmap)
    parseSuccess = success
    if (!success && process.env.NODE_ENV === 'development') {
      console.error(`[Studio] MindMap 解析失败，原始内容:`, rawContent)
    }
  }

  return {
    content,
    stats: {
      ...stats,
      mode: 'fast',
      strategy: 'smart_sampling',
      duration: Date.now() - startTime,
    },
    parseSuccess,
  }
}

/**
 * 精准模式生成 - Map-Reduce
 */
async function generatePrecise(
  notebookId: string,
  type: ArtifactType,
  sourceIds?: string[]
): Promise<GenerateResult> {
  const startTime = Date.now()

  // 获取每个 Source 的内容
  const { sources, stats } = await getSourceContentsForMapReduce(notebookId, sourceIds)

  // Map 阶段：对每个 Source 生成中间结果
  const mapPromptTemplate = MAP_PROMPTS[type]
  const intermediateResults: string[] = []

  for (const source of sources) {
    const mapPrompt = mapPromptTemplate
      .replace('{source_title}', source.sourceTitle)
      .replace('{content}', source.content)

    try {
      const result = await callLLM(mapPrompt, TIMEOUT_MAP_STEP)
      intermediateResults.push(`## ${source.sourceTitle}\n${result}`)
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`[Map] Source ${source.sourceTitle} 处理失败:`, error)
      }
      // 继续处理其他 source
    }
  }

  if (intermediateResults.length === 0) {
    throw new Error('GENERATION_FAILED')
  }

  // Reduce 阶段：合并所有中间结果
  const reducePromptTemplate = REDUCE_PROMPTS[type]
  const combinedInput = intermediateResults.join('\n\n---\n\n')
  const truncatedCombined = truncateContextSmart(combinedInput, 6000)

  const reducePrompt = reducePromptTemplate.replace('{intermediate_results}', truncatedCombined)
  const rawContent = await callLLM(reducePrompt, TIMEOUT_PRECISE)

  // 处理结果
  let content = rawContent
  let parseSuccess = true

  if (type === 'quiz') {
    const { quiz, success } = parseQuiz(rawContent)
    content = JSON.stringify(quiz)
    parseSuccess = success
  } else if (type === 'mindmap') {
    const { mindmap, success } = parseMindMap(rawContent)
    content = JSON.stringify(mindmap)
    parseSuccess = success
  }

  return {
    content,
    stats: {
      ...stats,
      mode: 'precise',
      strategy: 'map_reduce',
      duration: Date.now() - startTime,
    },
    parseSuccess,
  }
}

/**
 * 生成产物 - 统一入口
 */
export async function generateArtifact(params: {
  notebookId: string
  type: ArtifactType
  mode: StudioMode
  sourceIds?: string[]
}): Promise<GenerateResult> {
  const { notebookId, type, mode, sourceIds } = params

  try {
    if (mode === 'precise') {
      return await generatePrecise(notebookId, type, sourceIds)
    } else {
      return await generateFast(notebookId, type, sourceIds)
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[Studio] 生成失败:`, error)
    }
    throw error
  }
}

/**
 * 基于模板生成产物
 */
export async function generateFromTemplate(params: {
  notebookId: string
  template: string
  variables: Record<string, string>
  sourceIds?: string[]
}): Promise<GenerateResult> {
  const { notebookId, template, variables, sourceIds } = params
  const startTime = Date.now()

  // 1. 获取上下文（如果模板包含 {{context}}）
  let finalPrompt = template
  let stats: ContentStats = {
    totalChunks: 0,
    usedChunks: 0,
    estimatedTokens: 0,
    sourceCount: 0,
  }

  if (template.includes('{{context}}')) {
    const { content: context, stats: contextStats } = await getSourceContentSmart(notebookId, sourceIds)
    finalPrompt = finalPrompt.replaceAll('{{context}}', context)
    stats = contextStats
  }

  // 2. 替换其他变量
  for (const [key, value] of Object.entries(variables)) {
    if (key === 'context') continue // 已经处理过了
    const placeholder = `{{${key}}}`
    finalPrompt = finalPrompt.replaceAll(placeholder, value)
  }

  // 3. 调用 LLM
  const content = await callLLM(finalPrompt, TIMEOUT_PRECISE)

  return {
    content,
    stats: {
      ...stats,
      mode: 'precise',
      strategy: 'template',
      duration: Date.now() - startTime,
    },
  }
}
