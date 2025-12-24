/**
 * Notebook 详情页面
 * US-002: 查看和管理单个 Notebook
 */

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { UserNav } from '@/components/common/user-nav'
import { BackButton } from '@/components/common/back-button'
import { Button } from '@/components/ui/button'
import { BookOpen, FileText, MessageSquare } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function NotebookDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 获取 Notebook 详情
  const notebook = await prisma.notebook.findUnique({
    where: { id },
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
  if (notebook.ownerId !== user.id) {
    redirect('/403')
  }

  // 更新最近打开时间
  await prisma.notebook.update({
    where: { id },
    data: { lastOpenedAt: new Date() },
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BackButton href="/notebooks" label="返回知识库列表" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-semibold truncate max-w-md">
                {notebook.title}
              </h1>
            </div>
          </div>
          <UserNav user={user} />
        </div>
      </header>

      {/* Main Content - 三栏布局占位 */}
      <main className="flex-1 flex">
        {/* 左侧栏 - Sources */}
        <aside className="w-64 border-r bg-card p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              资料来源
            </h2>
            <span className="text-xs text-muted-foreground">
              {notebook._count.sources}
            </span>
          </div>
          
          {notebook.sources.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                还没有添加资料
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                上传文档或添加链接开始
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notebook.sources.map((source) => (
                <div
                  key={source.id}
                  className="p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <p className="text-sm font-medium truncate">{source.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {source.type}
                  </p>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* 中间栏 - Chat */}
        <div className="flex-1 flex flex-col">
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
          <div className="border-t p-4 bg-card">
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
        </div>

        {/* 右侧栏 - Studio */}
        <aside className="w-72 border-l bg-card p-4 flex-shrink-0">
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
        </aside>
      </main>
    </div>
  )
}
