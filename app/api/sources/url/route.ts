/**
 * URL Source API
 * US-004: 添加网页链接作为知识源
 * POST /api/sources/url
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const urlSchema = z.object({
  notebookId: z.string().uuid('无效的 Notebook ID'),
  url: z.string().url('请输入有效的 URL').refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    '仅支持 http/https 链接'
  ),
})

// 检测 URL 类型
function detectUrlType(url: string): { type: string; warning?: string } {
  const urlLower = url.toLowerCase()
  
  // YouTube 链接
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return { type: 'video', warning: '暂不支持视频内容提取，仅保存链接' }
  }
  
  // PDF 链接
  if (urlLower.endsWith('.pdf')) {
    return { type: 'pdf' }
  }
  
  // 普通网页
  return { type: 'url' }
}

// 尝试获取网页标题
async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotebookLM/1.0)',
      },
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) return null
    
    const html = await response.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim().slice(0, 200) // 限制长度
    }
    
    return null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    
    // 验证输入
    const result = urlSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.errors[0].message },
        { status: 400 }
      )
    }

    const { notebookId, url } = result.data

    // 验证 Notebook 所有权
    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true },
    })

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook 不存在' }, { status: 404 })
    }

    if (notebook.ownerId !== user.id) {
      return NextResponse.json({ error: '无权访问此 Notebook' }, { status: 403 })
    }

    // 检查是否已存在相同 URL
    const existingSource = await prisma.source.findFirst({
      where: {
        notebookId,
        url,
      },
    })

    if (existingSource) {
      return NextResponse.json(
        { error: '该链接已添加' },
        { status: 400 }
      )
    }

    // 检测 URL 类型
    const { type, warning } = detectUrlType(url)
    
    // 尝试获取标题
    const fetchedTitle = await fetchPageTitle(url)
    const title = fetchedTitle || new URL(url).hostname

    // 创建 Source 记录
    const source = await prisma.source.create({
      data: {
        notebookId,
        type: type === 'pdf' ? 'file' : 'url',
        title,
        status: type === 'video' ? 'ready' : 'pending', // 视频链接直接标记为就绪
        url,
        meta: {
          originalUrl: url,
          urlType: type,
          fetchedTitle,
          addedAt: new Date().toISOString(),
          ...(warning && { warning }),
        },
      },
    })

    // 非视频链接添加到处理队列
    if (type !== 'video') {
      await prisma.processingQueue.create({
        data: {
          sourceId: source.id,
          status: 'pending',
          priority: 1,
        },
      })
    }

    return NextResponse.json({
      ...source,
      warning,
    }, { status: 201 })
  } catch (error) {
    console.error('添加 URL Source 失败:', error)
    return NextResponse.json({ error: '添加失败' }, { status: 500 })
  }
}
