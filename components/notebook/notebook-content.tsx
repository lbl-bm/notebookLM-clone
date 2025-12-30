/**
 * Notebook 内容组件
 * 三栏可调整布局
 */

'use client'

import { useMemo } from 'react'
import { ResizablePanel } from '@/components/common/resizable-panel'
import { SourceSidebar } from './source-sidebar'
import { ChatPanel } from './chat-panel'
import { StudioPanel } from './studio-panel'
import { CitationProvider } from './citation-context'
import { Card } from '@/components/ui/card'

interface Source {
  id: string
  type: string
  title: string
  status: string
  meta: unknown
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
            initialMessages={notebook.messages as Message[]}
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
