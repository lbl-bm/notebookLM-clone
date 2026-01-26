/**
 * 递归字符切分器
 * 基于 LangChain RecursiveCharacterTextSplitter 思路实现
 * 
 * 特点：
 * - 优先保持自然边界（章节 > 段落 > 句子 > 字符）
 * - 重叠窗口避免关键信息被切断
 * - 使用字符估算 token 数量（中文约 1.5 字符/token，英文约 4 字符/token）
 * - 自适应切分：根据内容密度动态调整 chunk 大小
 */

import { createHash } from 'crypto'
import { 
  analyzeContent, 
  getAdaptiveChunkConfig,
  findSpecialContentBoundaries,
  isInProtectedRegion,
  ContentAnalysis,
  type AdaptiveChunkConfig,
  type ProtectedRegion 
} from './content-analyzer'

// 切分配置
export const CHUNK_CONFIG = {
  chunkSize: 800,      // 目标 chunk 大小（tokens）
  chunkOverlap: 100,   // 重叠大小（tokens），约 12.5%
  separators: [        // 分隔符优先级（从高到低）
    '\n## ',           // Markdown 二级标题
    '\n### ',          // Markdown 三级标题
    '\n\n',            // 段落
    '\n',              // 换行
    '。',              // 中文句号
    '！',              // 中文感叹号
    '？',              // 中文问号
    '. ',              // 英文句号
    '! ',              // 英文感叹号
    '? ',              // 英文问号
    ' ',               // 空格
    '',                // 字符
  ],
}

/**
 * 估算文本的 token 数量
 * 中文约 1.5 字符/token，英文约 4 字符/token
 * 使用混合估算：检测中文比例后加权计算
 */
export function countTokens(text: string): number {
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const totalChars = text.length
  const chineseRatio = totalChars > 0 ? chineseChars / totalChars : 0
  
  // 混合估算：中文 1.5 字符/token，其他 4 字符/token
  const chineseTokens = chineseChars / 1.5
  const otherTokens = (totalChars - chineseChars) / 4
  
  return Math.ceil(chineseTokens + otherTokens)
}

/**
 * 计算内容的 MD5 哈希
 */
export function computeContentHash(content: string): string {
  return createHash('md5').update(content).digest('hex')
}

/**
 * Chunk 元数据
 */
export interface ChunkMetadata {
  page?: number           // 页码（PDF）
  startChar: number       // 起始字符位置
  endChar: number         // 结束字符位置
  tokenCount: number      // token 数量
  sourceTitle: string     // 来源标题
  sourceType: string      // 来源类型 'file' | 'url' | 'text'
  chunkStrategy?: string  // 切分策略标识
  adaptiveReason?: string // 自适应调整原因
  contentAnalysis?: ContentAnalysis // 内容分析结果
  specialContentType?: string // 特殊内容类型标记
}

/**
 * Chunk 结构
 */
export interface Chunk {
  content: string
  contentHash: string
  metadata: ChunkMetadata
  chunkIndex: number
}

/**
 * 递归字符切分器
 */
export class RecursiveTextSplitter {
  private chunkSize: number
  private chunkOverlap: number
  private separators: string[]
  private enableAdaptive: boolean // 是否启用自适应切分
  private enableProtection: boolean // 是否启用特殊内容保护

  constructor(config?: Partial<typeof CHUNK_CONFIG> & { enableAdaptive?: boolean; enableProtection?: boolean }) {
    this.chunkSize = config?.chunkSize ?? CHUNK_CONFIG.chunkSize
    this.chunkOverlap = config?.chunkOverlap ?? CHUNK_CONFIG.chunkOverlap
    this.separators = config?.separators ?? CHUNK_CONFIG.separators
    this.enableAdaptive = config?.enableAdaptive ?? true // 默认启用自适应
    this.enableProtection = config?.enableProtection ?? true // 默认启用保护
  }

  /**
   * 切分文本
   */
  splitText(
    text: string,
    sourceTitle: string,
    sourceType: 'file' | 'url' | 'text',
    pageInfo?: { page: number; startChar: number }[]
  ): Chunk[] {
    // 1. 识别特殊内容保护区域
    let protectedRegions: ProtectedRegion[] = []
    if (this.enableProtection) {
      protectedRegions = findSpecialContentBoundaries(text)
    }
    
    // 2. 如果启用自适应切分,先分析内容特征
    let contentAnalysis: ContentAnalysis | undefined
    let adaptiveConfig: AdaptiveChunkConfig | undefined
    let originalChunkSize = this.chunkSize
    let originalChunkOverlap = this.chunkOverlap
    
    if (this.enableAdaptive) {
      contentAnalysis = analyzeContent(text)
      adaptiveConfig = getAdaptiveChunkConfig(contentAnalysis, CHUNK_CONFIG.chunkSize)
      
      // 临时应用自适应配置
      this.chunkSize = adaptiveConfig.chunkSize
      this.chunkOverlap = adaptiveConfig.chunkOverlap
    }
    
    const chunks: Chunk[] = []
    const splits = this.recursiveSplitWithProtection(text, this.separators, protectedRegions)
    
    let currentChunk = ''
    let currentStartChar = 0
    let chunkIndex = 0

    for (const split of splits) {
      const potentialChunk = currentChunk + split
      const tokenCount = countTokens(potentialChunk)

      if (tokenCount <= this.chunkSize) {
        currentChunk = potentialChunk
      } else {
        // 当前 chunk 已满，保存并开始新 chunk
        if (currentChunk.trim()) {
          const chunk = this.createChunk(
            currentChunk.trim(),
            currentStartChar,
            sourceTitle,
            sourceType,
            chunkIndex,
            pageInfo,
            contentAnalysis,
            adaptiveConfig,
            protectedRegions
          )
          chunks.push(chunk)
          chunkIndex++
        }

        // 计算重叠部分
        const overlapText = this.getOverlapText(currentChunk)
        currentStartChar = currentStartChar + currentChunk.length - overlapText.length
        currentChunk = overlapText + split
      }
    }

    // 处理最后一个 chunk
    if (currentChunk.trim()) {
      const chunk = this.createChunk(
        currentChunk.trim(),
        currentStartChar,
        sourceTitle,
        sourceType,
        chunkIndex,
        pageInfo,
        contentAnalysis,
        adaptiveConfig,
        protectedRegions
      )
      chunks.push(chunk)
    }

    // 恢复原始配置
    if (this.enableAdaptive) {
      this.chunkSize = originalChunkSize
      this.chunkOverlap = originalChunkOverlap
    }

    return chunks
  }


  /**
   * 递归切分文本（带保护区域检查）
   */
  private recursiveSplitWithProtection(
    text: string,
    separators: string[],
    protectedRegions: ProtectedRegion[],
    basePosition: number = 0
  ): string[] {
    if (separators.length === 0) {
      return this.splitByTokens(text)
    }

    const separator = separators[0]
    const remainingSeparators = separators.slice(1)

    if (separator === '') {
      return this.splitByTokens(text)
    }

    const splits = text.split(separator)
    const result: string[] = []
    let currentPosition = basePosition

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i]
      const splitEnd = currentPosition + split.length
      
      // 检查切分点是否在保护区域内部
      const protectedRegion = isInProtectedRegion(splitEnd, protectedRegions)
      
      if (protectedRegion && !protectedRegion.canSplit) {
        // 在保护区域内部，将整个区域作为一个单元
        const regionRelativeStart = protectedRegion.startChar - basePosition
        const regionRelativeEnd = protectedRegion.endChar - basePosition
        
        if (regionRelativeStart >= 0 && regionRelativeStart < text.length) {
          // 将保护区域之前的内容正常处理
          if (regionRelativeStart > 0) {
            const beforeRegion = text.slice(0, regionRelativeStart)
            const beforeSplits = this.recursiveSplitWithProtection(
              beforeRegion,
              separators,
              protectedRegions,
              basePosition
            )
            result.push(...beforeSplits)
          }
          
          // 保护区域作为整体
          result.push(protectedRegion.content)
          
          // 处理保护区域之后的内容
          if (regionRelativeEnd < text.length) {
            const afterRegion = text.slice(regionRelativeEnd)
            const afterSplits = this.recursiveSplitWithProtection(
              afterRegion,
              separators,
              protectedRegions,
              basePosition + regionRelativeEnd
            )
            result.push(...afterSplits)
          }
          
          return result
        }
      }
      
      // 正常切分逻辑
      const tokenCount = countTokens(split)

      if (tokenCount <= this.chunkSize) {
        const withSeparator = i < splits.length - 1 ? split + separator : split
        result.push(withSeparator)
      } else {
        const subSplits = this.recursiveSplitWithProtection(
          split,
          remainingSeparators,
          protectedRegions,
          currentPosition
        )
        if (i < splits.length - 1 && subSplits.length > 0) {
          subSplits[subSplits.length - 1] += separator
        }
        result.push(...subSplits)
      }
      
      currentPosition = splitEnd + separator.length
    }

    return result
  }

  /**
   * 递归切分文本（原始版本，保留用于向后兼容）
   */
  private recursiveSplit(text: string, separators: string[]): string[] {
    if (separators.length === 0) {
      // 没有更多分隔符，按字符切分
      return this.splitByTokens(text)
    }

    const separator = separators[0]
    const remainingSeparators = separators.slice(1)

    if (separator === '') {
      return this.splitByTokens(text)
    }

    const splits = text.split(separator)
    const result: string[] = []

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i]
      const tokenCount = countTokens(split)

      if (tokenCount <= this.chunkSize) {
        // 加回分隔符（除了最后一个）
        const withSeparator = i < splits.length - 1 ? split + separator : split
        result.push(withSeparator)
      } else {
        // 需要进一步切分
        const subSplits = this.recursiveSplit(split, remainingSeparators)
        // 给第一个子切分加上分隔符
        if (i < splits.length - 1 && subSplits.length > 0) {
          subSplits[subSplits.length - 1] += separator
        }
        result.push(...subSplits)
      }
    }

    return result
  }

  /**
   * 按字符数量切分（最后手段）
   * 使用 chunkSize * 2 作为字符数估算
   */
  private splitByTokens(text: string): string[] {
    const result: string[] = []
    const charsPerChunk = this.chunkSize * 2 // 估算每个 chunk 的字符数

    for (let i = 0; i < text.length; i += charsPerChunk) {
      result.push(text.slice(i, i + charsPerChunk))
    }

    return result
  }

  /**
   * 获取重叠文本
   * 使用 chunkOverlap * 2 作为字符数估算
   */
  private getOverlapText(text: string): string {
    const overlapChars = this.chunkOverlap * 2 // 估算重叠字符数
    
    if (text.length <= overlapChars) {
      return text
    }

    return text.slice(-overlapChars)
  }

  /**
   * 创建 Chunk 对象
   */
  private createChunk(
    content: string,
    startChar: number,
    sourceTitle: string,
    sourceType: 'file' | 'url' | 'text',
    chunkIndex: number,
    pageInfo?: { page: number; startChar: number }[],
    contentAnalysis?: ContentAnalysis,
    adaptiveConfig?: AdaptiveChunkConfig,
    protectedRegions?: ProtectedRegion[]
  ): Chunk {
    const endChar = startChar + content.length
    const tokenCount = countTokens(content)

    // 查找页码（如果有）
    let page: number | undefined
    if (pageInfo) {
      for (let i = pageInfo.length - 1; i >= 0; i--) {
        if (pageInfo[i].startChar <= startChar) {
          page = pageInfo[i].page
          break
        }
      }
    }
    
    // 检查是否包含特殊内容
    let specialContentType: string | undefined
    if (protectedRegions) {
      for (const region of protectedRegions) {
        if (region.startChar >= startChar && region.endChar <= endChar) {
          specialContentType = region.type
          break
        }
      }
    }

    return {
      content,
      contentHash: computeContentHash(content),
      chunkIndex,
      metadata: {
        page,
        startChar,
        endChar,
        tokenCount,
        sourceTitle,
        sourceType,
        chunkStrategy: this.enableAdaptive ? 'adaptive' : 'fixed',
        adaptiveReason: adaptiveConfig?.reason,
        contentAnalysis,
        specialContentType,
      },
    }
  }
}

/**
 * 默认切分器实例
 */
export const textSplitter = new RecursiveTextSplitter()
