/**
 * PDF 解析器
 * 从 Supabase Storage 下载 PDF 并提取文本
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

// pdf-parse 的类型
type PdfParseFunction = (buffer: Buffer) => Promise<{
  text: string
  numpages: number
  info: Record<string, unknown>
}>

// 动态导入 pdf-parse（避免 SSR 问题和测试文件加载）
let pdfParse: PdfParseFunction | null = null

async function getPdfParse(): Promise<PdfParseFunction> {
  if (!pdfParse) {
    // 直接导入 pdf-parse/lib/pdf-parse 避免加载测试文件
    const pdfParseModule = await import('pdf-parse/lib/pdf-parse')
    pdfParse = pdfParseModule.default || pdfParseModule
  }
  return pdfParse
}

/**
 * PDF 解析结果
 */
export interface PdfParseResult {
  text: string
  pageCount: number
  wordCount: number
  pageInfo: { page: number; startChar: number }[]
  error?: string
}

/**
 * 从 Supabase Storage 下载文件
 */
export async function downloadFromStorage(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage
    .from('notebook-sources')
    .download(storagePath)

  if (error) {
    throw new Error(`下载文件失败: ${error.message}`)
  }

  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * 解析 PDF 文件
 */
export async function parsePdf(buffer: Buffer): Promise<PdfParseResult> {
  const parse = await getPdfParse()

  try {
    const data = await parse(buffer)

    // 提取文本和页码信息
    const text = data.text
    const pageCount = data.numpages
    const wordCount = text.replace(/\s+/g, ' ').trim().split(/\s+/).length

    // 构建页码信息（简化处理：按页数均分）
    const pageInfo: { page: number; startChar: number }[] = []
    const avgCharsPerPage = Math.ceil(text.length / pageCount)
    
    for (let i = 0; i < pageCount; i++) {
      pageInfo.push({
        page: i + 1,
        startChar: i * avgCharsPerPage,
      })
    }

    return {
      text,
      pageCount,
      wordCount,
      pageInfo,
    }
  } catch (error) {
    const err = error as Error
    
    // 检测常见错误类型
    if (err.message.includes('encrypted') || err.message.includes('password')) {
      return {
        text: '',
        pageCount: 0,
        wordCount: 0,
        pageInfo: [],
        error: '文件已加密，无法解析',
      }
    }
    
    if (err.message.includes('Invalid PDF') || err.message.includes('corrupt')) {
      return {
        text: '',
        pageCount: 0,
        wordCount: 0,
        pageInfo: [],
        error: '文件损坏，无法读取',
      }
    }
    
    return {
      text: '',
      pageCount: 0,
      wordCount: 0,
      pageInfo: [],
      error: `PDF 解析失败: ${err.message}`,
    }
  }
}

/**
 * 检测是否为扫描件（文本内容过少）
 */
export function isScannedPdf(text: string, pageCount: number): boolean {
  if (pageCount === 0) return false
  
  // 平均每页少于 50 个字符，可能是扫描件
  const avgCharsPerPage = text.length / pageCount
  return avgCharsPerPage < 50
}

/**
 * 完整的 PDF 处理流程
 */
export async function processPdfFromStorage(storagePath: string): Promise<PdfParseResult> {
  // 1. 下载文件
  const buffer = await downloadFromStorage(storagePath)
  
  // 2. 解析 PDF
  const result = await parsePdf(buffer)
  
  // 3. 检测扫描件
  if (!result.error && isScannedPdf(result.text, result.pageCount)) {
    return {
      ...result,
      error: '文件为图片，需要 OCR（暂不支持）',
    }
  }
  
  return result
}
