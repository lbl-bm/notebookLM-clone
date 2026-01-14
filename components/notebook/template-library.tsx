/**
 * 模板库组件
 * US-009: Prompt 模板库
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Play, Edit2, Trash2, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import type { PromptTemplate } from '@/types'

interface TemplateLibraryProps {
  notebookId: string
  onArtifactGenerated: (artifact: any) => void
  disabled?: boolean
}

export function TemplateLibrary({
  notebookId,
  onArtifactGenerated,
  disabled,
}: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [runningTemplateId, setRunningTemplateId] = useState<string | null>(null)
  
  // 编辑/创建相关
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<PromptTemplate> | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 运行相关
  const [isRunningDialogOpen, setIsRunningDialogOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})

  // 加载模板
  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/templates')
      if (response.ok) {
        const data = await response.json()
        setTemplates(data)
      }
    } catch (error) {
      console.error('加载模板失败:', error)
      toast({
        title: '加载模板失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 保存模板
  const handleSaveTemplate = async () => {
    if (!editingTemplate?.name || !editingTemplate?.template) {
      toast({
        title: '名称和内容不能为空',
        variant: 'destructive',
      })
      return
    }

    setIsSaving(true)
    try {
      const isEditing = !!editingTemplate.id
      const url = isEditing ? `/api/templates/${editingTemplate.id}` : '/api/templates'
      const method = isEditing ? 'PATCH' : 'POST'

      // 自动提取变量
      const variableMatches = editingTemplate.template.match(/\{\{(?!context)(.*?)\}\}/g) || []
      const variables = Array.from(new Set(variableMatches.map(m => m.replace(/\{\{|\}\}/g, ''))))

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingTemplate,
          variables,
        }),
      })

      if (response.ok) {
        toast({
          title: isEditing ? '已更新' : '已创建',
        })
        setIsDialogOpen(false)
        loadTemplates()
      } else {
        const data = await response.json()
        throw new Error(data.error || '保存失败')
      }
    } catch (error) {
      console.error('保存模板失败:', error)
      toast({
        title: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 删除模板
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast({
          title: '已删除',
        })
        loadTemplates()
      } else {
        throw new Error('删除失败')
      }
    } catch (error) {
      console.error('删除模板失败:', error)
      toast({
        title: '删除失败',
        variant: 'destructive',
      })
    }
  }

  // 运行模板
  const handleRunTemplate = async () => {
    if (!selectedTemplate) return

    setIsRunning(true)
    setRunningTemplateId(selectedTemplate.id)
    try {
      const response = await fetch(`/api/templates/${selectedTemplate.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          variables,
        }),
      })

      const data = await response.json()
      if (response.ok) {
        toast({
          title: '生成成功',
        })
        onArtifactGenerated(data.artifact)
        setIsRunningDialogOpen(false)
      } else {
        throw new Error(data.error || '运行失败')
      }
    } catch (error) {
      console.error('运行模板失败:', error)
      toast({
        title: (error as Error).message,
        variant: 'destructive',
      })
    } finally {
      setIsRunning(false)
      setRunningTemplateId(null)
    }
  }

  const openRunDialog = (template: PromptTemplate) => {
    setSelectedTemplate(template)
    const initialVars: Record<string, string> = {}
    template.variables.forEach(v => {
      initialVars[v] = ''
    })
    setVariables(initialVars)
    setIsRunningDialogOpen(true)
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">加载模板中...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">模板库</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingTemplate({ name: '', template: '', description: '', variables: [] })
            setIsDialogOpen(true)
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          新建模板
        </Button>
      </div>

      <div className="grid gap-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="group relative flex flex-col p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{template.name}</span>
                {template.isSystem && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    系统
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!template.isSystem && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingTemplate(template)
                        setIsDialogOpen(true)
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            
            {template.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                {template.description}
              </p>
            )}

            <Button
              variant="secondary"
              size="sm"
              className="w-full mt-auto"
              disabled={disabled || isRunning}
              onClick={() => openRunDialog(template)}
            >
              {isRunning && runningTemplateId === template.id ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              运行
            </Button>
          </div>
        ))}

        {templates.length === 0 && (
          <div className="text-center py-8 border rounded-lg border-dashed">
            <p className="text-sm text-muted-foreground">暂无模板</p>
          </div>
        )}
      </div>

      {/* 编辑/创建对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingTemplate?.id ? '编辑模板' : '新建模板'}</DialogTitle>
            <DialogDescription>
              创建一个自定义 Prompt 模板。使用 {"{{variable}}"} 定义变量。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={editingTemplate?.name || ''}
                onChange={(e) => setEditingTemplate(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：提取核心论点"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">描述</Label>
              <Input
                id="description"
                value={editingTemplate?.description || ''}
                onChange={(e) => setEditingTemplate(prev => ({ ...prev, description: e.target.value }))}
                placeholder="简短描述模板用途"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template">Prompt 内容</Label>
              <textarea
                id="template"
                className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={editingTemplate?.template || ''}
                onChange={(e) => setEditingTemplate(prev => ({ ...prev, template: e.target.value }))}
                placeholder="请输入 Prompt 内容... 使用 {{context}} 引用资料内容。"
              />
              <p className="text-[10px] text-muted-foreground">
                提示：使用 {"{{context}}"} 占位符将自动替换为选中的资料内容。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveTemplate} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 运行对话框 */}
      <Dialog open={isRunningDialogOpen} onOpenChange={setIsRunningDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>运行模板: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              填写以下变量以生成产物。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedTemplate?.variables.filter(v => v !== 'context').map((variable) => (
              <div key={variable} className="grid gap-2">
                <Label htmlFor={variable}>{variable}</Label>
                <Input
                  id={variable}
                  value={variables[variable] || ''}
                  onChange={(e) => setVariables(prev => ({ ...prev, [variable]: e.target.value }))}
                  placeholder={`请输入 ${variable}`}
                />
              </div>
            ))}
            {selectedTemplate?.variables.filter(v => v !== 'context').length === 0 && (
              <p className="text-sm text-muted-foreground">此模板无需额外变量。</p>
            )}
            {selectedTemplate?.template.includes('{{context}}') && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                <Info className="h-3.5 w-3.5" />
                将基于当前选中的资料生成
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRunningDialogOpen(false)}>取消</Button>
            <Button onClick={handleRunTemplate} disabled={isRunning}>
              {isRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              运行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
