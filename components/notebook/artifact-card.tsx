/**
 * 产物卡片组件
 * US-008: 展示生成的产物，支持展开/收起
 */

'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FileText, 
  List, 
  HelpCircle, 
  Network,
  Copy,
  Trash2,
  Check
} from 'lucide-react'
import { Tooltip, Popconfirm, message } from 'antd'
import { Sparkles } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { formatDistanceToNow } = require('date-fns')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { zhCN } = require('date-fns/locale')

export type ArtifactType = 'summary' | 'outline' | 'quiz' | 'mindmap' | 'custom'

export interface Artifact {
  id: string
  type: ArtifactType
  content: string
  createdAt: string
}

interface ArtifactCardProps {
  artifact: Artifact
  onDelete: (id: string) => void
  onSelect: (artifact: Artifact) => void
}

const typeConfig: Record<ArtifactType, { icon: React.ReactNode; label: string }> = {
  summary: { icon: <FileText className="h-4 w-4" />, label: '摘要' },
  outline: { icon: <List className="h-4 w-4" />, label: '大纲' },
  quiz: { icon: <HelpCircle className="h-4 w-4" />, label: '测验' },
  mindmap: { icon: <Network className="h-4 w-4" />, label: '思维导图' },
  custom: { icon: <Sparkles className="h-4 w-4" />, label: '自定义' },
}

export function ArtifactCard({ artifact, onDelete, onSelect }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false)
  const config = typeConfig[artifact.type]

  // 获取预览文本
  const getPreview = () => {
    if (artifact.type === 'quiz' || artifact.type === 'mindmap') {
      try {
        const data = JSON.parse(artifact.content)
        if (artifact.type === 'quiz') {
          return `${data.questions?.length || 0} 道题目`
        }
        // 计算思维导图节点数
        const countNodes = (node: { children?: unknown[] }): number => {
          if (!node) return 0
          return 1 + (node.children?.reduce((sum: number, child: unknown) => 
            sum + countNodes(child as { children?: unknown[] }), 0) || 0)
        }
        return `${countNodes(data.root)} 个节点`
      } catch {
        return '解析失败'
      }
    }
    // Markdown 内容取前 80 字
    const text = artifact.content.replace(/[#*`\n]/g, ' ').trim()
    return text.length > 80 ? text.slice(0, 80) + '...' : text
  }

  // 复制内容
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      message.success('已复制到剪贴板')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      message.error('复制失败')
    }
  }

  // 删除
  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    onDelete(artifact.id)
  }

  return (
    <Card 
      className="p-3 cursor-pointer transition-all hover:shadow-md hover:border-blue-300"
      onClick={() => onSelect(artifact)}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-blue-600">{config.icon}</span>
          <span className="font-medium text-sm">{config.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(artifact.createdAt), { 
            addSuffix: true, 
            locale: zhCN 
          })}
        </span>
      </div>

      {/* 预览 */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {getPreview()}
      </p>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 justify-end">
        <Tooltip title="复制">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </Tooltip>
        <Popconfirm
          title="确定删除此产物？"
          onConfirm={handleDelete}
          okText="删除"
          cancelText="取消"
          placement="left"
        >
          <Tooltip title="删除">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </Popconfirm>
      </div>
    </Card>
  )
}
