/**
 * Source 卡片组件
 * US-003: 显示单个知识源信息
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import {
  FileText,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Eye,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  ExternalLink,
  X,
  Youtube,
} from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils/date'

interface Source {
  id: string
  type: string
  title: string
  status: string
  url?: string | null
  meta: unknown
  errorMessage?: string | null
  processingLog?: unknown
  lastProcessedChunkIndex?: number | null
  queueStatus?: string | null
  queuePriority?: number | null
  queueAttempts?: number | null
  queueErrorMessage?: string | null
  queuedAt?: Date | string | null
  queuePosition?: number | null
  createdAt: Date
  updatedAt?: Date
}

interface SourceMeta {
  size?: number
  originalName?: string
  urlType?: string
  warning?: string
  fetchedTitle?: string
  originalUrl?: string
  addedAt?: string
  lastRefetchAt?: string
  wordCount?: number
  contentPreview?: string
}

interface SourceCardProps {
  source: Source
  notebookId: string
  onDelete?: () => void
  isHighlighted?: boolean
  isExpanded?: boolean
  onToggleExpanded?: () => void
  onRefUpdate?: (sourceId: string, element: HTMLDivElement | null) => void
  selectedCitationId?: string
}

const statusConfig: Record<string, {
  icon: typeof Clock
  label: string
  color: string
  bgColor: string
  animate?: boolean
}> = {
  pending: {
    icon: Clock,
    label: '待处理',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  downloading: {
    icon: Loader2,
    label: '下载中',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    animate: true,
  },
  fetching: {
    icon: Loader2,
    label: '抓取中',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    animate: true,
  },
  parsing: {
    icon: Loader2,
    label: '解析中',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    animate: true,
  },
  chunking: {
    icon: Loader2,
    label: '切分中',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    animate: true,
  },
  embedding: {
    icon: Loader2,
    label: '向量化中',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    animate: true,
  },
  processing: {
    icon: Loader2,
    label: '处理中',
    color: 'text-slate-500 dark:text-slate-400',
    bgColor: 'bg-slate-100 dark:bg-slate-800',
    animate: true,
  },
  ready: {
    icon: CheckCircle2,
    label: '就绪',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  failed: {
    icon: AlertCircle,
    label: '失败',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
}

/**
 * Chunk 项组件 - 显示单个 chunk 内容
 */
function ChunkItem({
  chunk,
  index,
  isHighlighted,
  onRefUpdate,
}: {
  chunk: any
  index: number
  isHighlighted: boolean
  onRefUpdate: (element: HTMLDivElement | null) => void
}) {
  const chunkRef = useRef<HTMLDivElement>(null)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  // 更新 ref
  useEffect(() => {
    onRefUpdate(chunkRef.current)
    return () => onRefUpdate(null)
  }, [onRefUpdate])

  // 高亮动画效果
  useEffect(() => {
    if (isHighlighted) {
      setShouldAnimate(true)
      const timer = setTimeout(() => {
        setShouldAnimate(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isHighlighted])

  return (
    <div
      ref={chunkRef}
      className={`p-2 rounded border text-xs transition-all duration-500 ${
        isHighlighted
          ? 'bg-amber-50 dark:bg-amber-900/20 border-orange-400 dark:border-orange-600 shadow-md'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
      } ${
        shouldAnimate ? 'ring-2 ring-orange-300 dark:ring-orange-700' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-muted-foreground">片段 #{index + 1}</span>
        {chunk.metadata?.page && (
          <span className="text-[10px] text-muted-foreground">第 {chunk.metadata.page} 页</span>
        )}
      </div>
      <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
        {chunk.content}
      </p>
    </div>
  )
}

export function SourceCard({ 
  source, 
  notebookId,
  onDelete, 
  isHighlighted,
  isExpanded = false,
  onToggleExpanded,
  onRefUpdate,
  selectedCitationId
}: SourceCardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [chunks, setChunks] = useState<any[]>([])
  const [loadingChunks, setLoadingChunks] = useState(false)
  const sourceCardRef = useRef<HTMLDivElement>(null)
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const loadChunks = useCallback(async () => {
    setLoadingChunks(true)
    try {
      const res = await fetch(`/api/sources/${source.id}/chunks`)
      if (res.ok) {
        const data = await res.json()
        setChunks(data.chunks || [])
      }
    } catch (error) {
      console.error('Failed to load chunks:', error)
    } finally {
      setLoadingChunks(false)
    }
  }, [source.id])

  // 更新 ref 映射
  useEffect(() => {
    onRefUpdate?.(source.id, sourceCardRef.current)
    return () => onRefUpdate?.(source.id, null)
  }, [source.id, onRefUpdate])

  // 当展开时加载 chunks
  useEffect(() => {
    if (isExpanded && source.status === 'ready' && chunks.length === 0) {
      loadChunks()
    }
  }, [isExpanded, source.status, chunks.length, loadChunks])

  // 监听 selectedCitationId 变化，高亮对应 chunk
  useEffect(() => {
    if (!selectedCitationId) return

    const chunkElement = chunkRefs.current.get(selectedCitationId)
    if (chunkElement) {
      // 延迟滚动，等待 Source 展开动画完成
      setTimeout(() => {
        chunkElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 300)
    }
  }, [selectedCitationId])

  const status = statusConfig[source.status] || statusConfig.pending
  const StatusIcon = status.icon
  const meta = (source.meta || {}) as SourceMeta
  const isUrl = source.type === 'url'
  const isVideo = meta.urlType === 'video'

  // 获取图标
  const getSourceIcon = () => {
    if (isVideo) return <Youtube className="w-4 h-4 text-red-500" />
    if (isUrl) return <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
    return <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
  }

  const getIconBg = () => {
    if (isVideo) return 'bg-red-100 dark:bg-red-900/30'
    if (isUrl) return 'bg-blue-100 dark:bg-blue-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('删除失败')
      }

      toast({
        title: '删除成功',
        description: `"${source.title}" 已删除`,
      })
      setShowDeleteDialog(false)
      onDelete?.()
    } catch (error) {
      toast({
        title: '删除失败',
        description: (error as Error).message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async () => {
    setLoading(true)
    try {
      // URL 类型使用 refetch，文件类型使用 retry
      const endpoint = isUrl 
        ? `/api/sources/${source.id}/refetch`
        : `/api/sources/${source.id}/retry`
      
      const res = await fetch(endpoint, {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error(isUrl ? '重新抓取失败' : '重试失败')
      }

      toast({
        title: '已重新加入队列',
        description: isUrl ? '网页将重新抓取' : '文件将重新处理',
      })
      setShowDetailDialog(false)
      router.refresh()
    } catch (error) {
      toast({
        title: isUrl ? '重新抓取失败' : '重试失败',
        description: (error as Error).message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const fileSize = meta.size ? formatFileSize(meta.size) : null
  const processingLog = (source.processingLog || null) as any
  const logStages = processingLog?.stages ? (processingLog.stages as Record<string, any>) : undefined
  const stageOrder = ['download', 'fetch', 'parse', 'chunk', 'embed', 'index']
  const stageLabel: Record<string, string> = {
    download: '下载',
    fetch: '抓取',
    parse: '解析',
    chunk: '切分',
    embed: '向量化',
    index: '写入',
  }
  const stageRows = logStages
    ? stageOrder
      .filter(k => !!logStages[k])
      .map(k => ({ key: k, ...logStages[k] }))
    : []

  const stageProgress: Record<string, number> = {
    pending: 0,
    downloading: 0.15,
    fetching: 0.15,
    parsing: 0.4,
    chunking: 0.6,
    embedding: 0.8,
    ready: 1,
    failed: 1,
  }
  const progressValue = stageProgress[source.status] ?? 0
  const showProgress = ['downloading', 'fetching', 'parsing', 'chunking', 'embedding'].includes(source.status)

  const handleProcessNow = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sources/${source.id}/process`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '处理失败')
      }
      toast({
        title: '已开始处理',
        description: `"${source.title}" 正在处理...`,
      })
      setShowDetailDialog(false)
      router.refresh()
    } catch (error) {
      toast({
        title: '处理失败',
        description: (error as Error).message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelQueue = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sources/${source.id}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '取消失败')
      }
      toast({
        title: '已取消排队',
        description: `"${source.title}" 已从队列移除`,
      })
      setShowDetailDialog(false)
      router.refresh()
    } catch (error) {
      toast({
        title: '取消失败',
        description: (error as Error).message,
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        ref={sourceCardRef}
        className={`group flex flex-col gap-2 p-2 rounded-lg transition-all cursor-pointer ${
          isHighlighted 
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-300 dark:ring-blue-600' 
            : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
        }`}
      >
        {/* Source 头部 */}
        <div 
          className="flex items-center gap-3"
          onClick={() => setShowDetailDialog(true)}
        >
          {/* 文件图标 */}
          <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${getIconBg()}`}>
            {getSourceIcon()}
          </div>

          {/* 标题和状态 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{source.title}</p>
            <div className="mt-0.5 space-y-0.5">
              <div className="flex items-center gap-2">
                <StatusIcon
                  className={`w-3 h-3 ${status.color} ${status.animate ? 'animate-spin' : ''}`}
                />
                <span className={`text-xs ${status.color}`}>{status.label}</span>
              </div>
              {source.status === 'pending' && (
                <div className="text-[11px] text-muted-foreground">
                  {source.queueStatus === 'pending'
                    ? (source.queuePosition ? `队列第 ${source.queuePosition} 位` : '队列中')
                    : source.queueStatus === 'cancelled'
                      ? '已取消排队'
                      : '未入队'}
                </div>
              )}
              {showProgress && (
                <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-slate-500 dark:bg-slate-400" style={{ width: `${Math.round(progressValue * 100)}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-1">
            {/* 展开/折叠按钮 */}
            {source.status === 'ready' && onToggleExpanded && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpanded()
                }}
              >
                {isExpanded ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </Button>
            )}

            {/* 更多菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation()
                  setShowDetailDialog(true)
                }}>
                  <Eye className="mr-2 h-4 w-4" />
                  查看详情
                </DropdownMenuItem>
                {source.status === 'pending' && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleProcessNow()
                    }}
                    disabled={loading}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    立即处理
                  </DropdownMenuItem>
                )}
                {source.status === 'pending' && source.queueStatus === 'pending' && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCancelQueue()
                    }}
                    disabled={loading}
                  >
                    <X className="mr-2 h-4 w-4" />
                    取消排队
                  </DropdownMenuItem>
                )}
                {source.status === 'failed' && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    handleRetry()
                  }} disabled={loading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {isUrl ? '重新抓取' : '重试'}
                  </DropdownMenuItem>
                )}
                {isUrl && source.status === 'ready' && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation()
                    handleRetry()
                  }} disabled={loading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重新抓取
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Chunks 列表（展开时显示） */}
        {isExpanded && (
          <div className="ml-11 space-y-2 border-l-2 border-slate-200 dark:border-slate-700 pl-3">
            {loadingChunks ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
              </div>
            ) : chunks.length > 0 ? (
              chunks.map((chunk, index) => (
                <ChunkItem
                  key={chunk.id}
                  chunk={chunk}
                  index={index}
                  isHighlighted={chunk.id === selectedCitationId}
                  onRefUpdate={(element: HTMLDivElement | null) => {
                    if (element) {
                      chunkRefs.current.set(chunk.id, element)
                    } else {
                      chunkRefs.current.delete(chunk.id)
                    }
                  }}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground py-2">暂无分块数据</p>
            )}
          </div>
        )}
      </div>

      {/* 详情对话框 */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${getIconBg()}`}>
                {getSourceIcon()}
              </div>
              <span className="truncate">{source.title}</span>
            </DialogTitle>
            <DialogDescription>
              来源详情
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 状态 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">状态</span>
              <span className={`text-sm font-medium flex items-center gap-1 ${status.color}`}>
                <StatusIcon className={`w-4 h-4 ${status.animate ? 'animate-spin' : ''}`} />
                {status.label}
              </span>
            </div>

            {/* URL */}
            {source.url && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">链接</span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline break-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  {source.url}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
              </div>
            )}

            {/* 网页标题（如果与显示标题不同） */}
            {meta.fetchedTitle && meta.fetchedTitle !== source.title && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">网页标题</span>
                <span className="text-sm truncate max-w-[200px]">{meta.fetchedTitle}</span>
              </div>
            )}

            {/* 文件大小 */}
            {fileSize && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">文件大小</span>
                <span className="text-sm">{fileSize}</span>
              </div>
            )}

            {/* 字数统计 */}
            {meta.wordCount && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">字数统计</span>
                <span className="text-sm">{meta.wordCount.toLocaleString()} 字</span>
              </div>
            )}

            {/* 添加时间 */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">添加时间</span>
              <span className="text-sm">{formatRelativeTime(source.createdAt)}</span>
            </div>

            {/* 最后抓取时间 */}
            {meta.lastRefetchAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">最后抓取</span>
                <span className="text-sm">{formatRelativeTime(new Date(meta.lastRefetchAt))}</span>
              </div>
            )}

            {/* 内容预览 */}
            {meta.contentPreview && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">内容预览</span>
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg line-clamp-4">
                  {meta.contentPreview}
                </p>
              </div>
            )}

            {stageRows.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">处理日志</span>
                <div className="space-y-1">
                  {stageRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-200">{stageLabel[row.key] || row.key}</span>
                      <span className={row.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {row.status === 'success' ? '成功' : '失败'}
                        {typeof row.duration === 'number' ? ` · ${(row.duration / 1000).toFixed(1)}s` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 警告信息 */}
            {meta.warning && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">{meta.warning}</p>
              </div>
            )}

            {/* 错误信息 */}
            {source.status === 'failed' && source.errorMessage && (
              <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <p className="text-sm text-destructive font-medium mb-1">错误原因</p>
                <p className="text-sm text-destructive/80">{source.errorMessage}</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            {source.status === 'pending' && (
              <Button className="w-full" onClick={handleProcessNow} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" />
                立即处理
              </Button>
            )}
            {source.status === 'pending' && source.queueStatus === 'pending' && (
              <Button variant="outline" className="w-full" onClick={handleCancelQueue} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <X className="mr-2 h-4 w-4" />
                取消排队
              </Button>
            )}
            {(source.status === 'failed' || (isUrl && source.status === 'ready')) && (
              <Button
                className="w-full"
                onClick={handleRetry}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" />
                {isUrl ? '重新抓取' : '重试处理'}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                setShowDetailDialog(false)
                setShowDeleteDialog(true)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              删除来源
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除吗？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将移除文件和所有相关的向量数据，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
