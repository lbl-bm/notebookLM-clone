/**
 * 文档处理模块导出
 */

// 文本切分
export {
  RecursiveTextSplitter,
  textSplitter,
  countTokens,
  computeContentHash,
  CHUNK_CONFIG,
  type Chunk,
  type ChunkMetadata,
} from './text-splitter'

// PDF 解析
export {
  parsePdf,
  downloadFromStorage,
  processPdfFromStorage,
  isScannedPdf,
  type PdfParseResult,
} from './pdf-parser'

// 网页解析
export {
  processWebpage,
  fetchWebpage,
  extractContent,
  downloadPdfFromUrl,
  detectUrlType,
  WEB_FETCH_CONFIG,
  type WebParseResult,
} from './web-parser'

// Embedding 生成
export {
  generateEmbeddings,
  type ChunkWithEmbedding,
} from './embedding'

// 主处理流程
export {
  processSource,
  processPdfSource,
  processUrlSource,
  deleteSourceWithCleanup,
  type ProcessingStage,
  type ProcessingLog,
} from './processor'
