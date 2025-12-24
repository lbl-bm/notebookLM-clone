/**
 * 创建 Notebook 按钮组件
 * US-002: 创建新的 Notebook
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Plus, Loader2 } from 'lucide-react'

export function CreateNotebookButton() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!title.trim()) {
      setError('名称不能为空')
      return
    }
    if (title.length > 100) {
      setError('名称不能超过 100 个字符')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '创建失败')
      }

      const notebook = await res.json()
      setOpen(false)
      setTitle('')
      
      // 显示成功提示
      toast({
        title: '创建成功',
        description: `知识库"${notebook.title}"已创建`,
      })
      
      // 刷新当前页面以显示新创建的 Notebook
      router.refresh()
      
      // 延迟跳转，让用户看到列表更新
      setTimeout(() => {
        router.push(`/notebooks/${notebook.id}`)
      }, 500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setTitle('')
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          新建知识库
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建知识库</DialogTitle>
          <DialogDescription>
            创建一个新的知识库来组织你的文档和笔记
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notebook-title">名称</Label>
            <Input
              id="notebook-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="例如：AI 学习笔记"
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  handleCreate()
                }
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
