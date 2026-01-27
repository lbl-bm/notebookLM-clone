/**
 * Notebook 详情页加载状态
 * 在页面数据加载时显示骨架屏
 */

import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen, Loader2 } from 'lucide-react'

export default function NotebookLoading() {
  return (
    <div className="h-screen bg-muted/30 flex flex-col overflow-hidden">
      {/* Header 骨架 */}
      <header className="border-b bg-card flex-shrink-0 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-24" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary/50" />
              </div>
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* 内容骨架 */}
      <main className="flex-1 flex min-h-0 p-4 gap-4">
        {/* 左侧栏骨架 */}
        <div className="w-80 flex-shrink-0">
          <div className="h-full bg-card rounded-lg border p-4 space-y-4 shadow-sm">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-10 w-full" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </div>

        {/* 中间栏骨架 */}
        <div className="flex-1 min-w-0">
          <div className="h-full bg-card rounded-lg border p-4 flex flex-col items-center justify-center shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">加载知识库...</p>
          </div>
        </div>

        {/* 右侧栏骨架 */}
        <div className="w-80 flex-shrink-0">
          <div className="h-full bg-card rounded-lg border p-4 space-y-4 shadow-sm">
            <Skeleton className="h-8 w-24" />
            <div className="space-y-2">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
