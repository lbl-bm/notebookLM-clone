/**
 * Notebook 详情页面
 * US-002 & US-003: 查看和管理 Notebook，上传知识源
 * 
 * 性能优化：
 * - 并行化数据查询
 * - 异步更新 lastOpenedAt（不阻塞页面加载）
 * - 使用 Suspense 进行流式渲染
 */

import { redirect, notFound } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { UserNav } from '@/components/common/user-nav'
import { BackButton } from '@/components/common/back-button'
import { NotebookContent } from '@/components/notebook/notebook-content'
import { BookOpen, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  params: Promise<{ id: string }>
}

// 异步更新最近打开时间（不阻塞页面加载）
async function updateLastOpenedAt(id: string) {
  try {
    await prisma.notebook.update({
      where: { id },
      data: { lastOpenedAt: new Date() },
    })
  } catch (e) {
    // 静默失败，不影响用户体验
    console.error('[updateLastOpenedAt] 失败:', e)
  }
}

// Notebook 内容加载骨架屏
function NotebookContentSkeleton() {
  return (
    <main className="flex-1 flex min-h-0 p-4 gap-4">
      {/* 左侧栏骨架 */}
      <div className="w-80 flex-shrink-0">
        <div className="h-full bg-card rounded-lg border p-4 space-y-4">
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
        <div className="h-full bg-card rounded-lg border p-4 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">加载对话中...</p>
        </div>
      </div>
      {/* 右侧栏骨架 */}
      <div className="w-80 flex-shrink-0">
        <div className="h-full bg-card rounded-lg border p-4 space-y-4">
          <Skeleton className="h-8 w-24" />
          <div className="space-y-2">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

// 异步加载 Notebook 内容的组件
async function NotebookContentLoader({ 
  notebookId, 
  userId 
}: { 
  notebookId: string
  userId: string 
}) {
  // 先获取 Notebook 数据
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    include: {
      sources: {
        orderBy: { createdAt: 'desc' },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
      _count: {
        select: { sources: true, messages: true },
      },
    },
  })

  // 检查 Notebook 是否存在
  if (!notebook) {
    notFound()
  }

  // 检查权限
  if (notebook.ownerId !== userId) {
    redirect('/403')
  }

  // 异步更新 lastOpenedAt（不阻塞渲染）
  updateLastOpenedAt(notebookId)

  // 获取 source IDs 后再查询 queue 数据（只有在有 sources 时才查询）
  const sourceIds = notebook.sources.map(s => s.id)
  const queueRows = sourceIds.length > 0
    ? await prisma.processingQueue.findMany({
        where: { sourceId: { in: sourceIds } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    : []

  // 处理 queue 数据
  const latestQueueBySourceId = new Map<string, typeof queueRows[number]>()
  for (const row of queueRows) {
    if (!latestQueueBySourceId.has(row.sourceId)) {
      latestQueueBySourceId.set(row.sourceId, row)
    }
  }

  const pendingQueue = Array.from(latestQueueBySourceId.values())
    .filter(r => r.status === 'pending')
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

  const queuePositionBySourceId = new Map<string, number>()
  pendingQueue.forEach((r, index) => {
    queuePositionBySourceId.set(r.sourceId, index + 1)
  })

  const notebookWithQueue = {
    ...notebook,
    sources: notebook.sources.map(s => {
      const q = latestQueueBySourceId.get(s.id)
      return {
        ...s,
        queueStatus: q?.status ?? null,
        queuePriority: q?.priority ?? null,
        queueAttempts: q?.attempts ?? null,
        queueErrorMessage: q?.errorMessage ?? null,
        queuedAt: q?.createdAt ?? null,
        queuePosition: queuePositionBySourceId.get(s.id) ?? null,
      }
    }),
  }

  return <NotebookContent notebook={notebookWithQueue} />
}

export default async function NotebookDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 快速获取 Notebook 基本信息（用于 Header）
  const notebookBasic = await prisma.notebook.findUnique({
    where: { id },
    select: { 
      id: true, 
      title: true, 
      ownerId: true 
    },
  })

  if (!notebookBasic) {
    notFound()
  }

  if (notebookBasic.ownerId !== user.id) {
    redirect('/403')
  }

  return (
    <div className="h-screen bg-muted/30 flex flex-col overflow-hidden">
      {/* Header - 立即渲染 */}
      <header className="border-b bg-card flex-shrink-0 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton href="/notebooks" label="返回知识库列表" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-semibold truncate max-w-md">
                {notebookBasic.title}
              </h1>
            </div>
          </div>
          <UserNav user={user} />
        </div>
      </header>

      {/* Main Content - 流式加载 */}
      <Suspense fallback={<NotebookContentSkeleton />}>
        <NotebookContentLoader notebookId={id} userId={user.id} />
      </Suspense>
    </div>
  )
}
