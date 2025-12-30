/**
 * Notebook 详情页面
 * US-002 & US-003: 查看和管理 Notebook，上传知识源
 */

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { UserNav } from '@/components/common/user-nav'
import { BackButton } from '@/components/common/back-button'
import { NotebookContent } from '@/components/notebook/notebook-content'
import { BookOpen } from 'lucide-react'

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
    <div className="h-screen bg-muted/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card flex-shrink-0 shadow-sm">
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

      {/* Main Content */}
      <NotebookContent notebook={notebook} />
    </div>
  )
}
