import { NextResponse } from 'next/server'
import { zhipuConfig } from '@/lib/config'
import { getCurrentUserId } from '@/lib/db/supabase'

/**
 * 网络搜索 API
 * 优化搜索结果质量和数量
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const query = typeof body?.query === 'string' ? body.query.trim() : ''

    if (!query) {
      return NextResponse.json({ error: '缺少 query' }, { status: 400 })
    }

    // 优化搜索查询：添加关键词提示
    const enhancedQuery = query.length < 50 ? query : query.slice(0, 50)
    
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
            search_prompt: '搜索相关网页，收集尽可能多的相关结果',
            count: 15, // 增加搜索结果数量
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
    
    // 只保留有有效链接的结果
    const results = webSearchResults
      .map((r: any) => ({
        title: typeof r?.title === 'string' ? r.title : '',
        link: typeof r?.link === 'string' ? r.link : '',
        content: typeof r?.content === 'string' ? r.content : '',
        media: typeof r?.media === 'string' ? r.media : '',
        publish_date: typeof r?.publish_date === 'string' ? r.publish_date : '',
      }))
      .filter((r: any) => r.link && r.link.startsWith('http')) // 确保有有效的 HTTP(S) 链接
    
    // 记录日志
    if (process.env.NODE_ENV === 'development') {
      console.log('[Web Search] 搜索结果:', {
        query: enhancedQuery,
        rawCount: webSearchResults.length,
        validCount: results.length,
        droppedCount: webSearchResults.length - results.length
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

