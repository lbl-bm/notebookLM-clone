/**
 * Notebook 列表页面
 * US-002: 创建和管理 Notebook
 *
 * 性能优化：并行化 auth 和 notebook 查询（先启动 auth，获取 userId 后立刻查 DB）
 */

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db/prisma";
import { NotebookList } from "@/components/notebook/notebook-list";
import { CreateNotebookButton } from "@/components/notebook/create-notebook-button";
import { UserNav } from "@/components/common/user-nav";
import { BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function NotebookListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="p-6 border rounded-lg bg-card space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

async function NotebookListLoader({ userId }: { userId: string }) {
  const notebooks = await prisma.notebook.findMany({
    where: { ownerId: userId },
    orderBy: { lastOpenedAt: "desc" },
    include: {
      _count: {
        select: { sources: true, messages: true },
      },
    },
  });

  return <NotebookList notebooks={notebooks} />;
}

export default async function NotebooksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header - 立即渲染 */}
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

      {/* Main Content - Notebook 列表流式加载 */}
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

        <Suspense fallback={<NotebookListSkeleton />}>
          <NotebookListLoader userId={user.id} />
        </Suspense>
      </main>
    </div>
  );
}
