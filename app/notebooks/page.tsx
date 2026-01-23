/**
 * Notebook 列表页面
 * US-002: 创建和管理 Notebook
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/db/prisma'
import { NotebookList } from '@/components/notebook/notebook-list'
import { CreateNotebookButton } from '@/components/notebook/create-notebook-button'
import { UserNav } from '@/components/common/user-nav'
import { BookOpen } from 'lucide-react'

export default async function NotebooksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 获取用户的 Notebook 列表
  const notebooks = await prisma.notebook.findMany({
    where: { ownerId: user.id },
    orderBy: { lastOpenedAt: 'desc' },
    include: {
      _count: {
        select: { sources: true, messages: true },
      },
    },
  })

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
          <UserNav user={user} />
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
          <CreateNotebookButton />
        </div>

        <NotebookList notebooks={notebooks} />
      </main>
    </div>
  )
}
