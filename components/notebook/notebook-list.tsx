/**
 * Notebook 列表组件
 * US-002: 显示 Notebook 卡片列表
 */

'use client'

import { NotebookCard } from './notebook-card'
import { BookOpen } from 'lucide-react'

interface Notebook {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  lastOpenedAt: Date
  _count: {
    sources: number
    messages: number
  }
}

interface NotebookListProps {
  notebooks: Notebook[]
}

export function NotebookList({ notebooks }: NotebookListProps) {
  if (notebooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <BookOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">还没有知识库</h3>
        <p className="text-muted-foreground max-w-sm">
          点击右上角的"新建知识库"按钮，开始创建你的第一个 AI 知识库
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {notebooks.map((notebook) => (
        <NotebookCard key={notebook.id} notebook={notebook} />
      ))}
    </div>
  )
}
