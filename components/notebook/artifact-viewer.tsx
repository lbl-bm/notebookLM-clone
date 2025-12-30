/**
 * 产物详情查看器
 * US-008: 根据类型渲染不同的产物内容
 */

'use client'

import { useMemo } from 'react'
import { XMarkdown } from '@ant-design/x-markdown'
import { QuizViewer } from './quiz-viewer'
import { MindMapViewer } from './mindmap-viewer'
import type { Artifact, ArtifactType } from './artifact-card'
import type { Quiz, MindMap } from '@/lib/studio/parser'

import '@ant-design/x-markdown/es/XMarkdown/index.css'

interface ArtifactViewerProps {
  artifact: Artifact
}

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  // 解析 JSON 内容
  const parsedContent = useMemo(() => {
    if (artifact.type === 'quiz' || artifact.type === 'mindmap') {
      try {
        return JSON.parse(artifact.content)
      } catch {
        return null
      }
    }
    return null
  }, [artifact.content, artifact.type])

  // 根据类型渲染
  switch (artifact.type) {
    case 'quiz':
      if (!parsedContent) {
        return <ErrorView message="测验数据解析失败" />
      }
      return <QuizViewer quiz={parsedContent as Quiz} />

    case 'mindmap':
      if (!parsedContent) {
        return <ErrorView message="思维导图数据解析失败" />
      }
      return <MindMapViewer mindmap={parsedContent as MindMap} />

    case 'summary':
    case 'outline':
    default:
      return (
        <div className="prose prose-sm prose-slate max-w-none dark:prose-invert">
          <XMarkdown content={artifact.content} />
        </div>
      )
  }
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>{message}</p>
      <p className="text-sm mt-1">请尝试重新生成</p>
    </div>
  )
}
