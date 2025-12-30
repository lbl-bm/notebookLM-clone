/**
 * Studio 面板主组件
 * US-008: Studio 动作生成产物
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudioModeSelect } from './studio-mode-select'
import { StudioActions, type ArtifactType } from './studio-actions'
import { ArtifactList } from './artifact-list'
import { ArtifactViewer } from './artifact-viewer'
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
      message.success(
        `${typeLabels[type]}生成成功！耗时 ${(stats.duration / 1000).toFixed(1)}s`
      )
    } catch (error) {
      console.error('生成失败:', error)
      message.error((error as Error).message || '生成失败，请重试')
    } finally {
      setIsGenerating(false)
      setGeneratingType(undefined)
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
      message.success('已删除')
    } catch (error) {
      console.error('删除失败:', error)
      message.error('删除失败')
    }
  }

  // 选择产物
  const handleSelect = (artifact: Artifact) => {
    setSelectedArtifact(artifact)
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
      />

      {/* 分隔线 */}
      <div className="border-t my-4" />

      {/* 产物列表 */}
      <div className="flex-1 overflow-auto">
        <h3 className="text-sm font-medium mb-2">已生成的产物</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            加载中...
          </p>
        ) : (
          <ArtifactList
            artifacts={artifacts}
            onDelete={handleDelete}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  )
}
