/**
 * Source 卡片组件
 * US-003: 显示单个知识源信息
 */

'use client'

import { useState } from 'react'
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
  onDelete?: () => void
  isHighlighted?: boolean
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

export function SourceCard({ source, onDelete, isHighlighted }: SourceCardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [loading, setLoading] = useState(false)

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
        variant: 'destructive',
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
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const fileSize = meta.size ? formatFileSize(meta.size) : null

  return (
    <>
      <div
        className={`group flex items-center gap-3 p-2 rounded-lg transition-all cursor-pointer ${
          isHighlighted 
            ? 'bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-300 dark:ring-blue-600' 
            : 'hover:bg-slate-100 dark:hover:bg-slate-800/50'
        }`}
        onClick={() => setShowDetailDialog(true)}
      >
        {/* 文件图标 */}
        <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${getIconBg()}`}>
          {getSourceIcon()}
        </div>

        {/* 标题和状态 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-slate-900 dark:text-slate-100">{source.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusIcon
              className={`w-3 h-3 ${status.color} ${status.animate ? 'animate-spin' : ''}`}
            />
            <span className={`text-xs ${status.color}`}>{status.label}</span>
          </div>
        </div>

        {/* 操作菜单 */}
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
