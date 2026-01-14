/**
 * 产物卡片组件
 * US-008: 展示生成的产物，支持展开/收起
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  FileText, 
  List, 
  HelpCircle, 
  Network,
  Copy,
  Trash2,
  Check,
  Edit2,
  X
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
  title?: string | null
  content: string
  createdAt: string
}

interface ArtifactCardProps {
  artifact: Artifact
  index: number
  onDelete: (id: string) => void
  onSelect: (artifact: Artifact) => void
  onTitleUpdate: (id: string, title: string) => void
}

const typeConfig: Record<ArtifactType, { icon: React.ReactNode; label: string }> = {
  summary: { icon: <FileText className="h-4 w-4" />, label: '摘要' },
  outline: { icon: <List className="h-4 w-4" />, label: '大纲' },
  quiz: { icon: <HelpCircle className="h-4 w-4" />, label: '测验' },
  mindmap: { icon: <Network className="h-4 w-4" />, label: '思维导图' },
  custom: { icon: <Sparkles className="h-4 w-4" />, label: '自定义' },
}

export function ArtifactCard({ artifact, index, onDelete, onSelect, onTitleUpdate }: ArtifactCardProps) {
  const [copied, setCopied] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(artifact.title || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const config = typeConfig[artifact.type]

  // 生成默认标题
  const defaultTitle = `${config.label} #${index + 1}`
  const displayTitle = artifact.title || defaultTitle

  // 编辑标题时自动聚焦
  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingTitle])

  // 保存标题
  const handleSaveTitle = async () => {
    const newTitle = editTitle.trim()
    if (newTitle && newTitle !== artifact.title) {
      try {
        const response = await fetch(`/api/artifacts/${artifact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: newTitle }),
        })

        if (!response.ok) {
          throw new Error('更新失败')
        }

        onTitleUpdate(artifact.id, newTitle)
        message.success('标题已更新')
      } catch (error) {
        message.error('更新标题失败')
        if (process.env.NODE_ENV === 'development') {
          console.error(error)
        }
      }
    }
    setIsEditingTitle(false)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditTitle(artifact.title || '')
    setIsEditingTitle(false)
  }

  // 回车键保存
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

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
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-blue-600 flex-shrink-0">{config.icon}</span>
          {isEditingTitle ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="h-6 text-sm px-2"
                placeholder={defaultTitle}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSaveTitle()
                }}
              >
                <Check className="h-3.5 w-3.5 text-green-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancelEdit()
                }}
              >
                <X className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          ) : (
            <div 
              className="flex items-center gap-1 flex-1 min-w-0 group cursor-text"
              onClick={(e) => {
                e.stopPropagation()
                setEditTitle(artifact.title || '')
                setIsEditingTitle(true)
              }}
            >
              <span className="font-medium text-sm truncate">{displayTitle}</span>
              <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </div>
          )}
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
