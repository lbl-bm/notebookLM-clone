/**
 * JSON 安全解析模块
 * US-008: 规避 JSON 解析风险
 */

export interface Quiz {
  title: string
  questions: Array<{
    id: string
    question: string
    options: string[]
    answer: string
    explanation: string
  }>
}

export interface MindMapNode {
  id: string
  label: string
  description?: string
  children?: MindMapNode[]
}

export interface MindMap {
  title: string
  root: MindMapNode
}

// 测验 fallback
export const QUIZ_FALLBACK: Quiz = {
  title: '知识测验',
  questions: [{
    id: 'q1',
    question: '生成失败，请重试',
    options: ['A. 重试', 'B. 重试', 'C. 重试', 'D. 重试'],
    answer: 'A',
    explanation: '请点击重新生成'
  }]
}

// 思维导图 fallback
export const MINDMAP_FALLBACK: MindMap = {
  title: '知识结构',
  root: {
    id: 'root',
    label: '生成失败',
    description: '请重试',
    children: []
  }
}

/**
 * 安全解析 JSON - 规避 JSON 解析风险
 * 处理 LLM 可能返回的各种格式问题
 */
export function safeParseJSON<T>(text: string, fallback: T): { data: T; success: boolean } {
  if (!text || text.trim() === '') {
    console.error('[JSON Parse] 输入为空')
    return { data: fallback, success: false }
  }

  // 预处理：去除可能的 BOM 和首尾空白
  let cleanText = text.trim()
  
  // 移除可能的 markdown 代码块标记
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.slice(7)
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.slice(3)
  }
  if (cleanText.endsWith('```')) {
    cleanText = cleanText.slice(0, -3)
  }
  cleanText = cleanText.trim()

  try {
    // 1. 尝试直接解析
    return { data: JSON.parse(cleanText), success: true }
  } catch (e1) {
    console.log('[JSON Parse] 直接解析失败，尝试提取 JSON...')
    
    try {
      // 2. 尝试提取 JSON 块（处理 markdown 代码块包裹）
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        const extracted = jsonMatch[1].trim()
        console.log('[JSON Parse] 从代码块提取:', extracted.slice(0, 100))
        return { data: JSON.parse(extracted), success: true }
      }
    } catch (e2) {
      console.log('[JSON Parse] 代码块提取失败')
    }

    try {
      // 3. 尝试提取 { } 包裹的内容（贪婪匹配最外层）
      const objectMatch = text.match(/\{[\s\S]*\}/)
      if (objectMatch) {
        const extracted = objectMatch[0]
        console.log('[JSON Parse] 从花括号提取:', extracted.slice(0, 100))
        return { data: JSON.parse(extracted), success: true }
      }
    } catch (e3) {
      console.log('[JSON Parse] 花括号提取失败')
    }

    try {
      // 4. 尝试提取 [ ] 包裹的内容
      const arrayMatch = text.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        const extracted = arrayMatch[0]
        console.log('[JSON Parse] 从方括号提取:', extracted.slice(0, 100))
        return { data: JSON.parse(extracted), success: true }
      }
    } catch (e4) {
      console.log('[JSON Parse] 方括号提取失败')
    }

    console.error('[JSON Parse] 所有解析方法都失败，原始内容:', text.slice(0, 500))
    return { data: fallback, success: false }
  }
}

/**
 * 解析测验 JSON
 */
export function parseQuiz(text: string): { quiz: Quiz; success: boolean } {
  const { data, success } = safeParseJSON<Quiz>(text, QUIZ_FALLBACK)
  
  // 验证结构
  if (success && data.questions && Array.isArray(data.questions) && data.questions.length > 0) {
    // 确保每个问题有必要字段
    const validQuestions = data.questions.filter(q => 
      q.question && q.options && Array.isArray(q.options) && q.answer
    ).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      explanation: q.explanation || '暂无解析'
    }))

    if (validQuestions.length > 0) {
      return {
        quiz: {
          title: data.title || '知识测验',
          questions: validQuestions
        },
        success: true
      }
    }
  }

  return { quiz: QUIZ_FALLBACK, success: false }
}

/**
 * 解析思维导图 JSON
 */
export function parseMindMap(text: string): { mindmap: MindMap; success: boolean } {
  const { data, success } = safeParseJSON<MindMap>(text, MINDMAP_FALLBACK)
  
  // 验证结构
  if (success && data.root && data.root.label) {
    // 确保节点有 id
    const ensureIds = (node: MindMapNode, prefix: string = ''): MindMapNode => {
      const id = node.id || prefix || 'root'
      return {
        ...node,
        id,
        children: node.children?.map((child, i) => 
          ensureIds(child, `${id}-${i + 1}`)
        )
      }
    }

    return {
      mindmap: {
        title: data.title || '知识结构图',
        root: ensureIds(data.root)
      },
      success: true
    }
  }

  return { mindmap: MINDMAP_FALLBACK, success: false }
}
