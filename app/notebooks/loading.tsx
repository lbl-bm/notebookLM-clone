/**
 * Notebook 列表页加载状态
 */

import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen } from 'lucide-react'

export default function NotebooksLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Personal NotebookLM</h1>
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">我的知识库</h2>
            <p className="text-muted-foreground mt-1">
              管理你的 AI 知识库，开始智能问答
            </p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Notebook 列表骨架 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-card rounded-lg border p-4 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
