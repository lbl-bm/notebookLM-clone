/**
 * 网页内容解析器
 * 使用 @mozilla/readability 提取正文
 */

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

/**
 * 网页抓取配置
 */
export const WEB_FETCH_CONFIG = {
  timeout: 30000,  // 30秒
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; NotebookLM-Clone/1.0)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  },
}

/**
 * 网页解析结果
 */
export interface WebParseResult {
  title: string
  content: string
  wordCount: number
  excerpt?: string
  error?: string
}

/**
 * 检测 URL 类型
 */
export function detectUrlType(url: string): 'webpage' | 'pdf' | 'youtube' {
  const lowerUrl = url.toLowerCase()
  
  // PDF 链接
  if (lowerUrl.endsWith('.pdf')) {
    return 'pdf'
  }
  
  // YouTube 链接
  if (
    lowerUrl.includes('youtube.com/watch') ||
    lowerUrl.includes('youtu.be/') ||
    lowerUrl.includes('youtube.com/embed/')
  ) {
    return 'youtube'
  }
  
  return 'webpage'
}

/**
 * 带超时的 fetch 封装
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * 抓取网页内容
 */
export async function fetchWebpage(url: string): Promise<{ html: string; contentType: string }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: WEB_FETCH_CONFIG.headers,
        redirect: 'follow',
      },
      WEB_FETCH_CONFIG.timeout
    )

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('需要登录才能访问')
      }
      if (response.status === 403) {
        throw new Error('网站拒绝访问')
      }
      if (response.status === 404) {
        throw new Error('页面不存在')
      }
      throw new Error(`HTTP 错误: ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    
    // 读取 body 也需要超时控制
    const textPromise = response.text()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('读取内容超时')), WEB_FETCH_CONFIG.timeout)
    })
    
    const html = await Promise.race([textPromise, timeoutPromise])

    return { html, contentType }
  } catch (error) {
    const err = error as Error
    
    if (err.name === 'AbortError' || err.message.includes('aborted')) {
      throw new Error('请求超时')
    }
    
    throw err
  }
}

/**
 * 使用 Readability 提取正文
 */
export function extractContent(html: string, url: string): WebParseResult {
  try {
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article || !article.textContent?.trim()) {
      return {
        title: '',
        content: '',
        wordCount: 0,
        error: '无法提取有效内容',
      }
    }

    // 清理文本：移除多余空白
    const content = article.textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim()

    const wordCount = content.split(/\s+/).length

    return {
      title: article.title || '',
      content,
      wordCount,
      excerpt: article.excerpt || content.slice(0, 200),
    }
  } catch (error) {
    const err = error as Error
    return {
      title: '',
      content: '',
      wordCount: 0,
      error: `内容解析失败: ${err.message}`,
    }
  }
}

/**
 * 完整的网页处理流程
 */
export async function processWebpage(url: string): Promise<WebParseResult> {
  // 1. 抓取网页
  const { html, contentType } = await fetchWebpage(url)
  
  // 2. 检查是否为 PDF（通过 Content-Type）
  if (contentType.includes('application/pdf')) {
    return {
      title: '',
      content: '',
      wordCount: 0,
      error: 'PDF_DETECTED', // 特殊标记，需要按 PDF 处理
    }
  }
  
  // 3. 提取正文
  return extractContent(html, url)
}

/**
 * 从 URL 下载 PDF
 */
export async function downloadPdfFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: WEB_FETCH_CONFIG.headers,
        redirect: 'follow',
      },
      WEB_FETCH_CONFIG.timeout
    )

    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    // 读取 body 也需要超时控制
    const bufferPromise = response.arrayBuffer()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('下载超时')), WEB_FETCH_CONFIG.timeout)
    })
    
    const arrayBuffer = await Promise.race([bufferPromise, timeoutPromise])
    return Buffer.from(arrayBuffer)
  } catch (error) {
    const err = error as Error
    
    if (err.name === 'AbortError' || err.message.includes('aborted')) {
      throw new Error('下载超时')
    }
    
    throw err
  }
}
