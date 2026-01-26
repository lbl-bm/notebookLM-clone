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
    'User-Agent': 'Mozilla/5.0 (compatible; Personal-NotebookLM/1.0)',
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
 * 使用 Jina Reader 获取网页内容 (Fallback)
 * 能够处理 SPA 和反爬页面，返回 Markdown
 */
export async function fetchWithJina(url: string): Promise<WebParseResult> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const headers: Record<string, string> = {
      'User-Agent': WEB_FETCH_CONFIG.headers['User-Agent'], // 复用浏览器 UA
      'X-With-Generated-Alt': 'true',
    }

    // 如果配置了 API Key，添加到请求头
    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
    }

    const response = await fetchWithTimeout(
      jinaUrl,
      { headers },
      WEB_FETCH_CONFIG.timeout
    )

    if (!response.ok) {
      throw new Error(`Jina Reader 错误: ${response.status}`)
    }

    const markdown = await response.text()
    
    // 从 Markdown 中提取标题（第一行通常是标题）
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1] : ''
    
    // 清理可能包含的 Jina 广告尾注
    const cleanMarkdown = markdown.replace(/\[Parsed by Jina Reader\][\s\S]*$/, '').trim()
    
    const wordCount = cleanMarkdown.split(/\s+/).length

    return {
      title,
      content: cleanMarkdown,
      wordCount,
      excerpt: cleanMarkdown.slice(0, 200),
    }
  } catch (error) {
    console.error('[WebParser] Jina Reader fallback failed:', error)
    return {
      title: '',
      content: '',
      wordCount: 0,
      error: `Jina Reader 失败: ${(error as Error).message}`,
    }
  }
}

/**
 * 完整的网页处理流程
 * 策略：Local Fetch -> Readability -> Jina Reader Fallback
 */
export async function processWebpage(url: string): Promise<WebParseResult> {
  try {
    // 1. 尝试本地抓取
    const { html, contentType } = await fetchWebpage(url)
    
    // 2. 检查是否为 PDF
    if (contentType.includes('application/pdf')) {
      return {
        title: '',
        content: '',
        wordCount: 0,
        error: 'PDF_DETECTED',
      }
    }
    
    // 3. 提取正文
    const result = extractContent(html, url)
    
    // 4. 质量检查与回退
    // 如果提取失败，或内容过短（< 100 字），尝试使用 Jina Reader
    if (result.error || result.wordCount < 50) {
      console.log(`[WebParser] 本地解析质量不足 (${result.wordCount} words), 尝试 Jina Reader...`)
      const jinaResult = await fetchWithJina(url)
      
      // 如果 Jina 成功且内容更丰富，使用 Jina 的结果
      if (!jinaResult.error && jinaResult.wordCount > result.wordCount) {
        return {
          ...jinaResult,
          title: jinaResult.title || result.title, // 优先保留本地抓取的标题（如果 Jina 没取到）
        }
      }
    }
    
    return result
  } catch (error) {
    console.warn(`[WebParser] 本地抓取失败: ${(error as Error).message}, 尝试 Jina Reader...`)
    // 本地抓取彻底失败（如 403），直接尝试 Jina
    return fetchWithJina(url)
  }
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
