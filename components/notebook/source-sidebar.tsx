/**
 * 知识源边栏组件
 * US-003: 显示和管理知识源列表
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus, X, FileText, Globe, ChevronLeft } from 'lucide-react'
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
  createdAt: Date
}

interface SourceSidebarProps {
  notebookId: string
  sources: Source[]
}

// 处理中的状态列表
const PROCESSING_STATUSES = ['pending', 'downloading', 'fetching', 'parsing', 'chunking', 'embedding']

export function SourceSidebar({ notebookId, sources: initialSources }: SourceSidebarProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { highlightedSourceId, selectedCitation, selectCitation } = useCitation()
  const [showModal, setShowModal] = useState(false)
  const [sources, setSources] = useState(initialSources)

  // 检查是否有正在处理的 Source
  const hasProcessingSources = sources.some(s => PROCESSING_STATUSES.includes(s.status))

  // 轮询刷新状态
  useEffect(() => {
    if (!hasProcessingSources) return

    const interval = setInterval(() => {
      router.refresh()
    }, 3000) // 每 3 秒刷新一次

    return () => clearInterval(interval)
  }, [hasProcessingSources, router])

  // 同步 props 更新
  useEffect(() => {
    setSources(initialSources)
  }, [initialSources])

  const handleAddSuccess = () => {
    toast({
      title: '添加成功',
      description: '来源已添加，正在处理中...',
    })
    router.refresh()
  }

  const handleModalSuccess = () => {
    setShowModal(false)
    handleAddSuccess()
  }

  const handleSourceDelete = () => {
    router.refresh()
  }

  // 如果有选中的引用，显示引用详情视图
  if (selectedCitation) {
    return (
      <CitationDetailView 
        citation={selectedCitation} 
        onBack={() => selectCitation(null)} 
      />
    )
  }

  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base text-slate-900 dark:text-slate-50">来源</h2>
          <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            {sources.length}
          </span>
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
                onDelete={handleSourceDelete}
                isHighlighted={highlightedSourceId === source.id}
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
    </>
  )
}

/**
 * 引用详情视图 - 在边栏中展示
 */
function CitationDetailView({ 
  citation, 
  onBack 
}: { 
  citation: NonNullable<ReturnType<typeof useCitation>['selectedCitation']>
  onBack: () => void 
}) {
  const Icon = citation.sourceType === 'file' ? FileText : Globe
  const similarity = Math.round(citation.similarity * 100)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          返回来源列表
        </button>
        
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            citation.sourceType === 'file' 
              ? 'bg-red-100 dark:bg-red-900/30' 
              : 'bg-blue-100 dark:bg-blue-900/30'
          }`}>
            <Icon className={`w-5 h-5 ${
              citation.sourceType === 'file' 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-blue-600 dark:text-blue-400'
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-slate-900 dark:text-slate-100 truncate">
              {citation.sourceTitle}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full font-medium">
                相关度 {similarity}%
              </span>
              {citation.metadata.page && (
                <span className="text-xs text-slate-500">
                  第 {citation.metadata.page} 页
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 引用内容 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-3">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            引用片段
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {citation.content}
            </p>
          </div>
          
          {/* 位置信息 */}
          <div className="flex items-center gap-4 text-xs text-slate-500 pt-2">
            <span>片段 #{citation.metadata.chunkIndex + 1}</span>
            {citation.metadata.page && (
              <span>第 {citation.metadata.page} 页</span>
            )}
            <span>字符 {citation.metadata.startChar}-{citation.metadata.endChar}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
