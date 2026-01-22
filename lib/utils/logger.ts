/**
 * 统一日志工具
 * 仅在开发环境输出日志，生产环境静默
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

/**
 * ✅ P1-6: 向量操作日志结构
 */
export interface VectorOperationLog {
  operation: 'insert' | 'search' | 'hybrid_search' | 'delete'
  sourceId?: string
  notebookId?: string
  chunkCount?: number
  duration: number
  success: boolean
  error?: string
  metadata?: {
    inserted?: number
    skipped?: number
    topK?: number
    threshold?: number
    similarityAvg?: number
    [key: string]: any
  }
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development'

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.isDev && level !== 'error') return

    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`

    switch (level) {
      case 'error':
        console.error(prefix, message, ...args)
        break
      case 'warn':
        console.warn(prefix, message, ...args)
        break
      case 'info':
        console.log(prefix, message, ...args)
        break
      case 'debug':
        if (this.isDev) {
          console.log(prefix, message, ...args)
        }
        break
    }
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args)
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args)
  }

  error(message: string, ...args: any[]) {
    this.log('error', message, ...args)
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args)
  }

  /**
   * ✅ P1-6: 向量操作专用日志
   */
  vectorOperation(log: VectorOperationLog) {
    const level: LogLevel = log.success ? 'info' : 'error'
    const message = `[VectorStore] ${log.operation} ${log.success ? 'success' : 'failed'}`
    
    const details = {
      operation: log.operation,
      notebookId: log.notebookId,
      sourceId: log.sourceId,
      chunkCount: log.chunkCount,
      duration: `${log.duration}ms`,
      success: log.success,
      ...log.metadata,
    }

    if (log.error) {
      this.log(level, message, { ...details, error: log.error })
    } else {
      this.log(level, message, details)
    }
  }
}

export const logger = new Logger()
