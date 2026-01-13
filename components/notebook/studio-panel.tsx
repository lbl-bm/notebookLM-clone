/**
 * Studio 面板主组件
 * US-008: Studio 动作生成产物
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudioModeSelect } from './studio-mode-select'
import { StudioActions, type ArtifactType } from './studio-actions'
import { ArtifactList } from './artifact-list'
import { ArtifactViewer } from './artifact-viewer'
import { TemplateLibrary } from './template-library'
import { useStudioMode } from '@/hooks/use-studio-mode'
import type { Artifact } from './artifact-card'

interface StudioPanelProps {
  notebookId: string
  readySourceCount: number
}

export function StudioPanel({ notebookId, readySourceCount }: StudioPanelProps) {
  const { mode, setMode, isLoaded } = useStudioMode()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingType, setGeneratingType] = useState<ArtifactType>()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'artifacts' | 'templates'>('artifacts')
  const [elapsedTime, setElapsedTime] = useState(0)

  // 加载产物列表
  const loadArtifacts = useCallback(async () => {
    try {
      const response = await fetch(`/api/notebooks/${notebookId}/artifacts`)
      if (response.ok) {
        const data = await response.json()
        setArtifacts(data.artifacts || [])
      }
    } catch (error) {
      console.error('加载产物失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [notebookId])

  useEffect(() => {
    loadArtifacts()
  }, [loadArtifacts])

  // 生成产物
  const handleGenerate = async (type: ArtifactType) => {
    if (isGenerating) return

    setIsGenerating(true)
    setGeneratingType(type)
    setElapsedTime(0)

    // 启动计时器
    const startTime = Date.now()
    const interval = setInterval(() => {
      setElapsedTime((Date.now() - startTime) / 1000)
    }, 100)

    const typeLabels: Record<ArtifactType, string> = {
      summary: '摘要',
      outline: '大纲',
      quiz: '测验',
      mindmap: '思维导图',
    }

    try {
      const response = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notebookId,
          type,
          mode,
        }),
      })

      clearInterval(interval)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '生成失败')
      }

      // 添加到列表顶部
      const newArtifact: Artifact = {
        id: data.artifact.id,
        type: data.artifact.type,
        content: data.artifact.content,
        createdAt: data.artifact.createdAt,
      }
      setArtifacts((prev) => [newArtifact, ...prev])
      setSelectedArtifact(newArtifact)

      // 显示统计信息
      const stats = data.stats
      toast({
        title: `${typeLabels[type]}生成成功！`,
        description: `耗时 ${(stats.duration / 1000).toFixed(1)}s`,
      })
    } catch (error) {
      clearInterval(interval)
      if (process.env.NODE_ENV === 'development') {
        console.error('生成失败:', error)
      }
      toast({
        title: '生成失败',
        description: (error as Error).message || '请重试',
        variant: 'destructive',
      })
    } finally {
      clearInterval(interval)
      setIsGenerating(false)
      setGeneratingType(undefined)
      setElapsedTime(0)
    }
  }

  // 删除产物
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/artifacts/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('删除失败')
      }

      setArtifacts((prev) => prev.filter((a) => a.id !== id))
      if (selectedArtifact?.id === id) {
        setSelectedArtifact(null)
      }
      toast({
        title: '已删除',
      })
    } catch (error) {
      console.error('删除失败:', error)
      toast({
        title: '删除失败',
        variant: 'destructive',
      })
    }
  }

  // 选择产物
  const handleSelect = (artifact: Artifact) => {
    setSelectedArtifact(artifact)
  }

  // 更新产物标题
  const handleTitleUpdate = (id: string, title: string) => {
    setArtifacts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, title } : a))
    )
    if (selectedArtifact?.id === id) {
      setSelectedArtifact({ ...selectedArtifact, title })
    }
  }

  // 返回列表
  const handleBack = () => {
    setSelectedArtifact(null)
  }

  const disabled = readySourceCount === 0

  // 详情视图
  if (selectedArtifact) {
    return (
      <div className="h-full flex flex-col">
        {/* 头部 */}
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-semibold">产物详情</h2>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto">
          <ArtifactViewer artifact={selectedArtifact} />
        </div>
      </div>
    )
  }

  // 列表视图
  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Studio</h2>
        {isLoaded && (
          <StudioModeSelect
            value={mode}
            onChange={setMode}
            disabled={isGenerating}
          />
        )}
      </div>

      {/* 精准模式提示 */}
      {mode === 'precise' && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1 mb-3">
          精准模式耗时较长，但结果更全面
        </p>
      )}

      {/* 动作按钮 */}
      <StudioActions
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        generatingType={generatingType}
        disabled={disabled}
        readySourceCount={readySourceCount}
        elapsedTime={elapsedTime}
      />

      {/* 分隔线 */}
      <div className="border-t my-4" />

      {/* 标签切换 */}
      <div className="flex border-b mb-4">
        <button
          className={`flex-1 pb-2 text-sm font-medium transition-colors ${
            activeTab === 'artifacts'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('artifacts')}
        >
          已生成产物
        </button>
        <button
          className={`flex-1 pb-2 text-sm font-medium transition-colors ${
            activeTab === 'templates'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('templates')}
        >
          模板库
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'artifacts' ? (
          <>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                加载中...
              </p>
            ) : (
              <ArtifactList
                artifacts={artifacts}
                onDelete={handleDelete}
                onSelect={handleSelect}
                onTitleUpdate={handleTitleUpdate}
              />
            )}
          </>
        ) : (
          <TemplateLibrary
            notebookId={notebookId}
            onArtifactGenerated={(artifact) => {
              setArtifacts((prev) => [artifact, ...prev])
              setSelectedArtifact(artifact)
              setActiveTab('artifacts')
            }}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}
