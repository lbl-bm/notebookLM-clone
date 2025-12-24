/**
 * Notebook 卡片组件
 * US-002: 显示单个 Notebook 信息，支持重命名和删除
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils/date'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { MoreHorizontal, Pencil, Trash2, FileText, MessageSquare, Loader2 } from 'lucide-react'

interface Notebook {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  lastOpenedAt: Date
  _count: {
    sources: number
    messages: number
  }
}

interface NotebookCardProps {
  notebook: Notebook
}

export function NotebookCard({ notebook }: NotebookCardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [newTitle, setNewTitle] = useState(notebook.title)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRename = async () => {
    if (!newTitle.trim()) {
      setError('标题不能为空')
      return
    }
    if (newTitle.length > 100) {
      setError('标题不能超过 100 个字符')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/notebooks/${notebook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '重命名失败')
      }

      setShowRenameDialog(false)
      toast({
        title: '重命名成功',
        description: `已更新为"${newTitle.trim()}"`,
      })
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)

    try {
      const res = await fetch(`/api/notebooks/${notebook.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '删除失败')
      }

      setShowDeleteDialog(false)
      toast({
        title: '删除成功',
        description: `知识库"${notebook.title}"已删除`,
      })
      router.refresh()
    } catch (err) {
      toast({
        title: '删除失败',
        description: (err as Error).message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const lastOpenedText = formatRelativeTime(notebook.lastOpenedAt)

  return (
    <>
      <Card className="group hover:border-primary/50 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <Link href={`/notebooks/${notebook.id}`} className="flex-1 min-w-0">
              <CardTitle className="text-lg truncate hover:text-primary transition-colors">
                {notebook.title}
              </CardTitle>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">更多操作</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setNewTitle(notebook.title)
                  setError(null)
                  setShowRenameDialog(true)
                }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <Link href={`/notebooks/${notebook.id}`}>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                <span>{notebook._count.sources} 个资料</span>
              </div>
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>{notebook._count.messages} 条对话</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {lastOpenedText}打开
            </p>
          </Link>
        </CardContent>
      </Card>

      {/* 重命名对话框 */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名知识库</DialogTitle>
            <DialogDescription>
              为你的知识库设置一个新名称
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">名称</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value)
                  setError(null)
                }}
                placeholder="输入知识库名称"
                maxLength={100}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              取消
            </Button>
            <Button onClick={handleRename} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除吗？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，包括所有对话和资料。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
