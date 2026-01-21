import { NextResponse } from 'next/server'
import { zhipuConfig } from '@/lib/config'
import { getCurrentUserId } from '@/lib/db/supabase'

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

    const apiUrl = `${zhipuConfig.baseUrl}/paas/v4/chat/completions`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${zhipuConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4-air',
        messages: [{ role: 'user', content: query }],
        tools: [{
          type: 'web_search',
          web_search: {
            enable: 'True',
            search_engine: 'search_pro',
            search_result: 'True',
            search_prompt: '用简洁的语言总结搜索结果的关键信息，引用来源日期',
            count: 5,
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
      return NextResponse.json({ error: message }, { status: response.status })
    }

    const webSearchResults = data?.web_search || []
    
    const results = webSearchResults.map((r: any) => ({
      title: typeof r?.title === 'string' ? r.title : '',
      link: typeof r?.link === 'string' ? r.link : '',
      content: typeof r?.content === 'string' ? r.content : '',
      media: typeof r?.media === 'string' ? r.media : '',
      publish_date: typeof r?.publish_date === 'string' ? r.publish_date : '',
    })).filter((r: any) => r.link)

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

