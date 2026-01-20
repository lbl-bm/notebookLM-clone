/**
 * 知识源边栏组件
 * US-003: 显示和管理知识源列表
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus, X, FileText, Globe, ChevronLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SourceCard } from './source-card'
import { SourceSearchBox } from './add-source-dialog'
import { AddSourceModal } from './source-uploader'
import { useCitation } from './citation-context'

interface Source {
  id: string
  type: string
  title: string
  status: string
  meta: unknown
  queueStatus?: string | null
  queuePriority?: number | null
  queueAttempts?: number | null
  queueErrorMessage?: string | null
  queuedAt?: Date | string | null
  queuePosition?: number | null
  createdAt: Date
}

interface SourceSidebarProps {
  notebookId: string
  sources: Source[]
}

// 处理中的状态列表
const ACTIVE_PROCESSING_STATUSES = ['downloading', 'fetching', 'parsing', 'chunking', 'embedding']

export function SourceSidebar({ notebookId, sources: initialSources }: SourceSidebarProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { highlightedSourceId, selectedCitation, selectCitation } = useCitation()
  const [showModal, setShowModal] = useState(false)
  const [showQueueDialog, setShowQueueDialog] = useState(false)
  const [sources, setSources] = useState(initialSources)
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set())
  const sourceRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // 检查是否有正在处理的 Source
  const hasActiveProcessingSources = sources.some(s => ACTIVE_PROCESSING_STATUSES.includes(s.status))
  const hasQueuedPendingSources = sources.some(s => s.status === 'pending' && s.queueStatus === 'pending')

  // 轮询刷新状态
  useEffect(() => {
    if (!hasActiveProcessingSources && !hasQueuedPendingSources) return

    const intervalMs = hasActiveProcessingSources ? 5000 : 15000

    const interval = setInterval(() => {
      // 只有在页面可见时才刷新
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }, intervalMs)

    return () => clearInterval(interval)
  }, [hasActiveProcessingSources, hasQueuedPendingSources, router])

  // 同步 props 更新
  useEffect(() => {
    setSources(initialSources)
  }, [initialSources])

  const handleAddSuccess = useCallback(() => {
    toast({
      title: '添加成功',
      description: '来源已添加，正在处理中...',
    })
    router.refresh()
  }, [toast, router])

  const handleModalSuccess = useCallback(() => {
    setShowModal(false)
    handleAddSuccess()
  }, [handleAddSuccess])

  const handleSourceDelete = useCallback(() => {
    router.refresh()
  }, [router])

  const queuedSources = sources
    .filter(s => s.queueStatus === 'pending' || s.queueStatus === 'processing')
    .sort((a, b) => (a.queuePosition ?? Number.POSITIVE_INFINITY) - (b.queuePosition ?? Number.POSITIVE_INFINITY))

  const handleProcessNow = useCallback(async (sourceId: string, title: string) => {
    try {
      const res = await fetch(`/api/sources/${sourceId}/process`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '处理失败')
      }
      toast({ title: '已开始处理', description: `"${title}" 正在处理...` })
      router.refresh()
    } catch (error) {
      toast({
        title: '处理失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }, [router, toast])

  const handleCancelQueue = useCallback(async (sourceId: string, title: string) => {
    try {
      const res = await fetch(`/api/sources/${sourceId}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '取消失败')
      }
      toast({ title: '已取消排队', description: `"${title}" 已从队列移除` })
      router.refresh()
    } catch (error) {
      toast({
        title: '取消失败',
        description: (error as Error).message,
        variant: 'destructive',
      })
    }
  }, [router, toast])

  // 监听 selectedCitation 变化，自动滚动到对应 Source
  useEffect(() => {
    if (!selectedCitation) return

    const targetSourceId = selectedCitation.sourceId
    const sourceElement = sourceRefs.current.get(targetSourceId)

    if (sourceElement) {
      // 展开对应的 Source
      setExpandedSourceIds(prev => new Set(prev).add(targetSourceId))

      // 平滑滚动到 Source 位置
      setTimeout(() => {
        sourceElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [selectedCitation])

  const handleSourceRefUpdate = useCallback((sourceId: string, element: HTMLDivElement | null) => {
    if (element) {
      sourceRefs.current.set(sourceId, element)
    } else {
      sourceRefs.current.delete(sourceId)
    }
  }, [])

  const toggleSourceExpanded = useCallback((sourceId: string) => {
    setExpandedSourceIds(prev => {
      const next = new Set(prev)
      if (next.has(sourceId)) {
        next.delete(sourceId)
      } else {
        next.add(sourceId)
      }
      return next
    })
  }, [])

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base text-slate-900 dark:text-slate-50">来源</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowQueueDialog(true)}
            >
              队列 {queuedSources.length}
            </Button>
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {sources.length}
            </span>
          </div>
        </div>

        {/* 添加来源按钮 - 点击打开模态框 */}
        <Button
          variant="outline"
          className="w-full justify-center gap-2 h-10 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          onClick={() => setShowModal(true)}
        >
          <Plus className="h-4 w-4" />
          添加来源
        </Button>
      </div>

      {/* 搜索框组件 - 嵌入在边栏中 */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <SourceSearchBox
          notebookId={notebookId}
          onSuccess={handleAddSuccess}
        />
      </div>

      {/* Sources 列表 */}
      <div className="flex-1 overflow-auto p-2">
        {sources.length === 0 ? (
          <div className="text-center py-8 px-4">
            <p className="text-sm text-slate-500">
              还没有添加来源
            </p>
            <p className="text-xs text-slate-400 mt-1">
              使用上方搜索框或点击添加来源
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                notebookId={notebookId}
                onDelete={handleSourceDelete}
                isHighlighted={highlightedSourceId === source.id}
                isExpanded={expandedSourceIds.has(source.id)}
                onToggleExpanded={() => toggleSourceExpanded(source.id)}
                onRefUpdate={handleSourceRefUpdate}
                selectedCitationId={selectedCitation?.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加来源模态框 */}
      <AddSourceModal
        open={showModal}
        onOpenChange={setShowModal}
        notebookId={notebookId}
        currentSourceCount={sources.length}
        maxSourceCount={50}
        onSuccess={handleModalSuccess}
      />

      <Dialog open={showQueueDialog} onOpenChange={setShowQueueDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>处理队列</DialogTitle>
            <DialogDescription>仅展示当前 Notebook 的排队任务</DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2 max-h-[360px] overflow-auto">
            {queuedSources.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">暂无排队任务</div>
            ) : (
              queuedSources.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.queueStatus === 'processing'
                        ? '处理中'
                        : s.queuePosition
                          ? `队列第 ${s.queuePosition} 位`
                          : '队列中'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.queueStatus === 'pending' && (
                      <>
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleProcessNow(s.id, s.title)}>
                          立即处理
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleCancelQueue(s.id, s.title)}>
                          取消
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setShowQueueDialog(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
