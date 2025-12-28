/**
 * 知识源边栏组件
 * US-003: 显示和管理知识源列表
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Plus } from 'lucide-react'
import { SourceCard } from './source-card'
import { SourceSearchBox } from './add-source-dialog'
import { AddSourceModal } from './source-uploader'

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

export function SourceSidebar({ notebookId, sources }: SourceSidebarProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)

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
