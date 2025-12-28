/**
 * Notebook 内容组件
 * 三栏可调整布局
 */

'use client'

import { ResizablePanel } from '@/components/common/resizable-panel'
import { SourceSidebar } from './source-sidebar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'

interface Source {
  id: string
  type: string
  title: string
  status: string
  meta: unknown
  createdAt: Date
}

interface Message {
  id: string
  role: string
  content: string
  createdAt: Date
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
  return (
    <main className="flex-1 flex overflow-hidden p-4 gap-4">
      {/* 左侧栏 - Sources */}
      <ResizablePanel
        defaultWidth={320}
        minWidth={280}
        maxWidth={500}
      >
        <Card className="h-full flex flex-col shadow-sm">
          <SourceSidebar
            notebookId={notebook.id}
            sources={notebook.sources}
          />
        </Card>
      </ResizablePanel>

      {/* 中间栏 - Chat */}
      <div className="flex-1 min-w-0">
        <Card className="h-full flex flex-col shadow-sm">
          <div className="flex-1 p-4 overflow-auto">
            {notebook.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">开始对话</h3>
                <p className="text-muted-foreground max-w-sm">
                  添加资料后，你可以向 AI 提问关于这些资料的任何问题
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {notebook.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-muted ml-12'
                        : 'bg-card border mr-12'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Chat Input 占位 */}
          <div className="border-t p-4 bg-muted/30">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="输入你的问题..."
                  className="flex-1 px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  disabled
                />
                <Button disabled>发送</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                聊天功能即将上线
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* 右侧栏 - Studio */}
      <ResizablePanel
        defaultWidth={320}
        minWidth={280}
        maxWidth={500}
        side="left"
      >
        <Card className="h-full p-4 shadow-sm">
          <h2 className="font-semibold mb-4">Studio</h2>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" disabled>
              生成摘要
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              生成大纲
            </Button>
            <Button variant="outline" className="w-full justify-start" disabled>
              生成测验
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Studio 功能即将上线
          </p>
        </Card>
      </ResizablePanel>
    </main>
  )
}
