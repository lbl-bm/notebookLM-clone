/**
 * 产物列表组件
 * US-008: 展示所有生成的产物
 */

'use client'

import { ArtifactCard, type Artifact } from './artifact-card'
import { Package } from 'lucide-react'

interface ArtifactListProps {
  artifacts: Artifact[]
  onDelete: (id: string) => void
  onSelect: (artifact: Artifact) => void
}

export function ArtifactList({ artifacts, onDelete, onSelect }: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          暂无产物
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          点击上方按钮生成
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
