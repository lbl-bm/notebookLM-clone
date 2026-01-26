/**
 * 内容分析器
 * 用于分析文本内容特征,为自适应切分提供决策依据
 */

/**
 * 内容密度等级
 */
export enum ContentDensity {
  HIGH = 'high',      // 高密度：技术文档、代码、数据密集
  MEDIUM = 'medium',  // 中密度：普通文本
  LOW = 'low',        // 低密度：叙述性强、结构简单
}

/**
 * 内容类型
 */
export enum ContentType {
  TABLE = 'table',      // 表格
  CODE = 'code',        // 代码块
  LIST = 'list',        // 列表
  PARAGRAPH = 'paragraph', // 普通段落
}

/**
 * 内容分析结果
 */
export interface ContentAnalysis {
  density: ContentDensity
  type: ContentType
  infoEntropy: number       // 信息熵
  symbolDensity: number     // 特殊符号密度
  lineBreakDensity: number  // 换行密度
}

/**
 * 自适应切分配置
 */
export interface AdaptiveChunkConfig {
  chunkSize: number
  chunkOverlap: number
  reason: string // 调整原因
}

/**
 * 计算文本的信息熵(香农熵)
 * 用于衡量内容的复杂度/信息密度
 */
export function calculateInfoEntropy(text: string): number {
  if (text.length === 0) return 0

  // 统计字符频率
  const charFreq = new Map<string, number>()
  for (const char of text) {
    charFreq.set(char, (charFreq.get(char) || 0) + 1)
  }

  // 计算香农熵: H = -Σ(p(x) * log2(p(x)))
  let entropy = 0
  const totalChars = text.length

  for (const count of Array.from(charFreq.values())) {
    const probability = count / totalChars
    entropy -= probability * Math.log2(probability)
  }

  return entropy
}

/**
 * 计算特殊符号密度
 * 特殊符号多说明内容结构复杂(如代码、数据)
 */
export function calculateSymbolDensity(text: string): number {
  if (text.length === 0) return 0

  // 统计特殊符号：标点、数字、符号
  const specialChars = text.match(/[^\w\s\u4e00-\u9fff]/g) || []
  const numbers = text.match(/\d/g) || []
  
  return (specialChars.length + numbers.length) / text.length
}

/**
 * 计算换行密度
 * 高换行密度可能是列表或代码
 */
export function calculateLineBreakDensity(text: string): number {
  if (text.length === 0) return 0

  const lines = text.split('\n').length
  // 每100字符的换行次数
  return (lines / text.length) * 100
}

/**
 * 检测内容类型
 */
export function detectContentType(text: string): ContentType {
  const trimmed = text.trim()
  
  // 检测表格(Markdown 表格或纯文本表格)
  if (isTable(trimmed)) {
    return ContentType.TABLE
  }
  
  // 检测代码块
  if (isCodeBlock(trimmed)) {
    return ContentType.CODE
  }
  
  // 检测列表
  if (isList(trimmed)) {
    return ContentType.LIST
  }
  
  return ContentType.PARAGRAPH
}

/**
 * 判断是否为表格
 */
function isTable(text: string): boolean {
  const lines = text.split('\n')
  
  // Markdown 表格检测：至少有一行包含 | 且有分隔行 |---|
  const hasPipeLines = lines.filter(line => line.includes('|')).length
  const hasSeparator = lines.some(line => /^\s*\|?\s*[-:]+\s*\|/.test(line))
  
  if (hasPipeLines >= 2 && hasSeparator) {
    return true
  }
  
  // 纯文本表格检测：连续多行有对齐的空格或Tab
  const alignedLines = lines.filter(line => 
    line.includes('\t') || /\s{3,}/.test(line)
  ).length
  
  return alignedLines >= 3 && alignedLines / lines.length > 0.5
}

/**
 * 判断是否为代码块
 */
function isCodeBlock(text: string): boolean {
  // Markdown 代码块标记
  if (text.startsWith('```') || text.includes('\n```')) {
    return true
  }
  
  const lines = text.split('\n')
  
  // 检测持续缩进(代码特征)
  const indentedLines = lines.filter(line => 
    line.startsWith('    ') || line.startsWith('\t')
  ).length
  
  // 如果超过60%的行有缩进,可能是代码
  if (indentedLines / lines.length > 0.6) {
    return true
  }
  
  // 检测代码特征：括号、分号、等号密集
  const codeSymbols = (text.match(/[{}()\[\];=]/g) || []).length
  const codeSymbolRatio = codeSymbols / text.length
  
  return codeSymbolRatio > 0.05 // 代码符号占比超过5%
}

/**
 * 判断是否为列表
 */
function isList(text: string): boolean {
  const lines = text.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) return false
  
  // 有序列表：1. 2. 3. 或 1) 2) 3)
  const orderedListLines = lines.filter(line => 
    /^\s*\d+[.)]/.test(line)
  ).length
  
  // 无序列表：- * •
  const unorderedListLines = lines.filter(line => 
    /^\s*[-*•]/.test(line)
  ).length
  
  const listRatio = (orderedListLines + unorderedListLines) / lines.length
  
  return listRatio > 0.5 // 超过50%的行是列表项
}

/**
 * 分析内容特征
 */
export function analyzeContent(text: string): ContentAnalysis {
  const infoEntropy = calculateInfoEntropy(text)
  const symbolDensity = calculateSymbolDensity(text)
  const lineBreakDensity = calculateLineBreakDensity(text)
  const type = detectContentType(text)
  
  // 根据多个指标综合判断密度
  let density: ContentDensity
  
  // 高密度判断条件：
  // 1. 信息熵高(>4.5)
  // 2. 符号密度高(>0.15)
  // 3. 换行密集(>3)
  // 4. 是代码或表格
  if (
    infoEntropy > 4.5 || 
    symbolDensity > 0.15 || 
    lineBreakDensity > 3 ||
    type === ContentType.CODE ||
    type === ContentType.TABLE
  ) {
    density = ContentDensity.HIGH
  }
  // 低密度判断条件：
  // 1. 信息熵低(<3.5)
  // 2. 符号密度低(<0.05)
  // 3. 换行稀疏(<1)
  else if (
    infoEntropy < 3.5 && 
    symbolDensity < 0.05 && 
    lineBreakDensity < 1
  ) {
    density = ContentDensity.LOW
  }
  else {
    density = ContentDensity.MEDIUM
  }
  
  return {
    density,
    type,
    infoEntropy,
    symbolDensity,
    lineBreakDensity,
  }
}

/**
 * 根据内容分析结果获取自适应切分配置
 */
export function getAdaptiveChunkConfig(
  analysis: ContentAnalysis,
  baseChunkSize: number = 800
): AdaptiveChunkConfig {
  let chunkSize = baseChunkSize
  let chunkOverlap = Math.floor(baseChunkSize * 0.125) // 默认12.5%
  let reason = ''
  
  switch (analysis.density) {
    case ContentDensity.HIGH:
      // 高密度内容：缩小chunk,增加重叠
      chunkSize = Math.floor(baseChunkSize * 0.5) // 400 tokens
      chunkOverlap = Math.floor(chunkSize * 0.15) // 15% 重叠
      reason = `高密度内容(${analysis.type}): 信息熵=${analysis.infoEntropy.toFixed(2)}, 符号密度=${(analysis.symbolDensity * 100).toFixed(1)}%`
      break
      
    case ContentDensity.LOW:
      // 低密度内容：扩大chunk,减少重叠
      chunkSize = Math.floor(baseChunkSize * 1.5) // 1200 tokens
      chunkOverlap = Math.floor(chunkSize * 0.1) // 10% 重叠
      reason = `低密度内容(叙述性): 信息熵=${analysis.infoEntropy.toFixed(2)}, 换行密度=${analysis.lineBreakDensity.toFixed(2)}`
      break
      
    case ContentDensity.MEDIUM:
    default:
      // 中等密度：使用默认配置
      chunkSize = baseChunkSize
      chunkOverlap = Math.floor(baseChunkSize * 0.125)
      reason = `中等密度内容: 使用默认配置`
      break
  }
  
  return {
    chunkSize,
    chunkOverlap,
    reason,
  }
}

/**
 * 特殊内容区域
 */
export interface ProtectedRegion {
  type: ContentType           // 区域类型
  startChar: number           // 起始字符位置
  endChar: number             // 结束字符位置
  content: string             // 区域内容
  canSplit: boolean           // 是否可以内部切分
}

/**
 * 查找文本中的特殊内容边界
 * 返回需要保护的区域列表
 */
export function findSpecialContentBoundaries(text: string): ProtectedRegion[] {
  const regions: ProtectedRegion[] = []
  
  // 1. 查找 Markdown 代码块
  const codeBlockRegex = /```[\s\S]*?```/g
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(text)) !== null) {
    regions.push({
      type: ContentType.CODE,
      startChar: match.index,
      endChar: match.index + match[0].length,
      content: match[0],
      canSplit: match[0].length > 2000, // 超长代码块可以切分
    })
  }
  
  // 2. 查找 Markdown 表格
  const lines = text.split('\n')
  let tableStart = -1
  let currentPos = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // 检测表格分隔行（|---|---| 格式）
    if (/^\s*\|?\s*[-:]+\s*\|/.test(line)) {
      // 向前找表头
      if (i > 0 && tableStart === -1) {
        tableStart = currentPos - lines[i - 1].length - 1
      }
    }
    // 检测表格结束（非表格行）
    else if (tableStart !== -1 && !line.includes('|')) {
      const tableEnd = currentPos
      const tableContent = text.slice(tableStart, tableEnd)
      regions.push({
        type: ContentType.TABLE,
        startChar: tableStart,
        endChar: tableEnd,
        content: tableContent,
        canSplit: false, // 表格不可切分
      })
      tableStart = -1
    }
    
    currentPos += line.length + 1 // +1 for newline
  }
  
  // 处理未结束的表格
  if (tableStart !== -1) {
    regions.push({
      type: ContentType.TABLE,
      startChar: tableStart,
      endChar: text.length,
      content: text.slice(tableStart),
      canSplit: false,
    })
  }
  
  // 3. 查找有序/无序列表块
  const listBlocks = findListBlocks(text)
  regions.push(...listBlocks)
  
  // 按起始位置排序
  regions.sort((a, b) => a.startChar - b.startChar)
  
  // 合并重叠区域
  return mergeOverlappingRegions(regions)
}

/**
 * 查找列表块
 */
function findListBlocks(text: string): ProtectedRegion[] {
  const regions: ProtectedRegion[] = []
  const lines = text.split('\n')
  let listStart = -1
  let listType: 'ordered' | 'unordered' | null = null
  let currentPos = 0
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const isOrderedItem = /^\d+[.)]/.test(line)
    const isUnorderedItem = /^[-*•]/.test(line)
    const isListItem = isOrderedItem || isUnorderedItem
    
    if (isListItem) {
      if (listStart === -1) {
        // 列表开始
        listStart = currentPos
        listType = isOrderedItem ? 'ordered' : 'unordered'
      }
    } else if (listStart !== -1 && line !== '') {
      // 非空行且不是列表项，列表结束
      const listEnd = currentPos
      const listContent = text.slice(listStart, listEnd)
      
      // 只保护长度适中的列表（避免过长列表无法切分）
      if (listContent.length < 1500) {
        regions.push({
          type: ContentType.LIST,
          startChar: listStart,
          endChar: listEnd,
          content: listContent,
          canSplit: false,
        })
      } else {
        // 长列表可以按项切分
        regions.push({
          type: ContentType.LIST,
          startChar: listStart,
          endChar: listEnd,
          content: listContent,
          canSplit: true,
        })
      }
      
      listStart = -1
      listType = null
    }
    
    currentPos += lines[i].length + 1
  }
  
  // 处理未结束的列表
  if (listStart !== -1) {
    const listContent = text.slice(listStart)
    regions.push({
      type: ContentType.LIST,
      startChar: listStart,
      endChar: text.length,
      content: listContent,
      canSplit: listContent.length >= 1500,
    })
  }
  
  return regions
}

/**
 * 合并重叠的保护区域
 */
function mergeOverlappingRegions(regions: ProtectedRegion[]): ProtectedRegion[] {
  if (regions.length === 0) return []
  
  const merged: ProtectedRegion[] = [regions[0]]
  
  for (let i = 1; i < regions.length; i++) {
    const current = regions[i]
    const last = merged[merged.length - 1]
    
    // 检查是否重叠
    if (current.startChar <= last.endChar) {
      // 合并区域
      last.endChar = Math.max(last.endChar, current.endChar)
      last.content = last.content + current.content
      last.canSplit = last.canSplit && current.canSplit
    } else {
      merged.push(current)
    }
  }
  
  return merged
}

/**
 * 检查位置是否在保护区域内部
 */
export function isInProtectedRegion(position: number, regions: ProtectedRegion[]): ProtectedRegion | null {
  for (const region of regions) {
    if (position > region.startChar && position < region.endChar) {
      return region
    }
  }
  return null
}
