/**
 * Notebook 内容组件
 * 三栏可调整布局
 * 
 * 性能优化：
 * - 使用 dynamic import 延迟加载重型组件
 * - SourceSidebar 和 StudioPanel 使用动态导入
 */

'use client'

import { useMemo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { ResizablePanel } from '@/components/common/resizable-panel'
import { ChatPanel } from './chat-panel'
import { CitationProvider } from './citation-context'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'

// 动态导入重型组件（减少初始 bundle 体积）
const SourceSidebar = dynamic(
  () => import('./source-sidebar').then(mod => ({ default: mod.SourceSidebar })),
  {
    loading: () => (
      <div className="h-full p-4 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    ),
    ssr: false, // 客户端组件，禁用 SSR
  }
)

const StudioPanel = dynamic(
  () => import('./studio-panel').then(mod => ({ default: mod.StudioPanel })),
  {
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-8 w-24" />
        <div className="space-y-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
)

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

interface Citation {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: 'file' | 'url'
  content: string
  similarity: number
  metadata: {
    page?: number
    chunkIndex: number
    startChar: number
    endChar: number
  }
}

interface Message {
  id: string
  role: string
  content: string
  createdAt: Date
  citations?: Citation[] | null | unknown
  answerMode?: string | null
  metadata?: any
}

interface Notebook {
  id: string
  title: string
  sources: Source[]
  messages: Message[]
  _count: {
    sources: number
    messages: number
  }
}

interface NotebookContentProps {
  notebook: Notebook
}

export function NotebookContent({ notebook }: NotebookContentProps) {
  // 计算 ready 状态的 source 数量
  const readySourceCount = useMemo(() => {
    return notebook.sources.filter(s => s.status === 'ready').length
  }, [notebook.sources])

  // 预处理消息，提取 metadata 中的 retrievalDetails
  const processedMessages = useMemo(() => {
    return notebook.messages.map(msg => ({
      ...msg,
      retrievalDetails: (msg.metadata as any)?.retrievalDetails
    }))
  }, [notebook.messages])

  return (
    <CitationProvider>
      <main className="flex-1 flex min-h-0 p-4 gap-4">
        {/* 左侧栏 - Sources */}
        <ResizablePanel
          defaultWidth={320}
          minWidth={280}
          maxWidth={500}
        >
          <Card className="h-full flex flex-col shadow-sm overflow-hidden">
            <SourceSidebar
              notebookId={notebook.id}
              sources={notebook.sources}
            />
          </Card>
        </ResizablePanel>

        {/* 中间栏 - Chat */}
        <div className="flex-1 min-w-0 h-full">
          <ChatPanel
            notebookId={notebook.id}
            initialMessages={processedMessages as any}
          />
        </div>

        {/* 右侧栏 - Studio */}
        <ResizablePanel
          defaultWidth={320}
          minWidth={280}
          maxWidth={500}
          side="left"
        >
          <Card className="h-full p-4 shadow-sm overflow-hidden">
            <StudioPanel
              notebookId={notebook.id}
              readySourceCount={readySourceCount}
            />
          </Card>
        </ResizablePanel>
      </main>
    </CitationProvider>
  )
}
