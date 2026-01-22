/**
 * 递归字符切分器
 * 基于 LangChain RecursiveCharacterTextSplitter 思路实现
 * 
 * 特点：
 * - 优先保持自然边界（章节 > 段落 > 句子 > 字符）
 * - 重叠窗口避免关键信息被切断
 * - 使用字符估算 token 数量（中文约 1.5 字符/token，英文约 4 字符/token）
 */

import crypto from 'crypto'

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
  return crypto.createHash('md5').update(content).digest('hex')
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

  constructor(config?: Partial<typeof CHUNK_CONFIG>) {
    this.chunkSize = config?.chunkSize ?? CHUNK_CONFIG.chunkSize
    this.chunkOverlap = config?.chunkOverlap ?? CHUNK_CONFIG.chunkOverlap
    this.separators = config?.separators ?? CHUNK_CONFIG.separators
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
    const chunks: Chunk[] = []
    const splits = this.recursiveSplit(text, this.separators)
    
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
            pageInfo
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
        pageInfo
      )
      chunks.push(chunk)
    }

    return chunks
  }


  /**
   * 递归切分文本
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
    pageInfo?: { page: number; startChar: number }[]
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
      },
    }
  }
}

/**
 * 默认切分器实例
 */
export const textSplitter = new RecursiveTextSplitter()
