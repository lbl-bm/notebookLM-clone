import { NextResponse } from 'next/server'
import { zhipuConfig } from '@/lib/config'
import { getCurrentUserId } from '@/lib/db/supabase'
import { prisma } from '@/lib/db/prisma'

/**
 * 搜索类型
 */
type SearchType = 'precision' | 'exploration' | 'deep'

/**
 * 搜索结果接口
 */
interface SearchResult {
  title: string
  link: string
  content: string
  media?: string
  publish_date?: string
  score?: number
  isExisting?: boolean
}

/**
 * 网络搜索 API
 * 优化搜索结果质量和数量，支持知识库联动
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    const notebookId = typeof body?.notebookId === 'string' ? body.notebookId : undefined
    const searchType: SearchType = ['precision', 'exploration', 'deep'].includes(body?.type) 
      ? body.type 
      : 'exploration'

    if (!query) {
      return NextResponse.json({ error: '缺少 query' }, { status: 400 })
    }

    // 1. 根据搜索类型配置参数
    let searchCount = 15 // 默认 exploration
    if (searchType === 'precision') searchCount = 8
    if (searchType === 'deep') searchCount = 20

    // 2. 优化搜索查询：添加关键词提示
    const enhancedQuery = query.length < 50 ? query : query.slice(0, 50)
    
    // 3. 获取现有知识库 URL (用于联动去重)
    const existingUrls = new Set<string>()
    if (notebookId) {
      const sources = await prisma.source.findMany({
        where: { notebookId, type: 'url' },
        select: { url: true }
      })
      sources.forEach(s => {
        if (s.url) existingUrls.add(s.url)
      })
    }

    const apiUrl = `${zhipuConfig.baseUrl}/paas/v4/chat/completions`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${zhipuConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [{ role: 'user', content: enhancedQuery }],
        tools: [{
          type: 'web_search',
          web_search: {
            enable: 'True',
            search_engine: 'search_pro',
            search_result: 'True',
            search_prompt: searchType === 'deep' 
              ? '深入搜索相关技术文档和详细资料' 
              : '搜索相关网页，优先选择高质量内容',
            count: searchCount,
            content_size: 'high',
          },
        }],
        stream: false,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const message = typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : 'Web Search 调用失败'
      
      console.error('[Web Search] API 错误:', {
        status: response.status,
        message,
        query: enhancedQuery
      })
      
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const webSearchResults = data?.web_search || []
    
    // 4. 结果处理：清洗、去重、评分
    let results: SearchResult[] = webSearchResults
      .map((r: any) => ({
        title: typeof r?.title === 'string' ? r.title : '',
        link: typeof r?.link === 'string' ? r.link : '',
        content: typeof r?.content === 'string' ? r.content : '',
        media: typeof r?.media === 'string' ? r.media : '',
        publish_date: typeof r?.publish_date === 'string' ? r.publish_date : '',
      }))
      .filter((r: SearchResult) => r.link && r.link.startsWith('http')) // 确保有有效的 HTTP(S) 链接

    // 评分与标记
    results = results.map(r => {
      let score = 1.0
      
      // 内容长度评分
      if (r.content.length > 200) score += 0.2
      if (r.content.length < 50) score -= 0.3
      
      // 域名可信度评分 (简单示例)
      const domain = new URL(r.link).hostname.toLowerCase()
      if (domain.includes('github.com') || 
          domain.includes('stackoverflow.com') || 
          domain.includes('wikipedia.org') ||
          domain.endsWith('.edu') ||
          domain.endsWith('.gov')) {
        score += 0.3
      }
      
      // 知识库联动标记
      const isExisting = existingUrls.has(r.link)
      
      return { ...r, score, isExisting }
    })

    // 5. 过滤与排序
    // 过滤掉得分过低的低质量结果 (除非已存在于知识库)
    results = results.filter(r => r.score && r.score > 0.6 || r.isExisting)
    
    // 排序：已存在的排前面，然后按分数降序
    results.sort((a, b) => {
      if (a.isExisting && !b.isExisting) return -1
      if (!a.isExisting && b.isExisting) return 1
      return (b.score || 0) - (a.score || 0)
    })
    
    // 记录日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[Web Search] 搜索结果:', {
        query: enhancedQuery,
        type: searchType,
        rawCount: webSearchResults.length,
        validCount: results.length,
        existingCount: results.filter(r => r.isExisting).length
      })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[Web Search] 未预期错误:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

