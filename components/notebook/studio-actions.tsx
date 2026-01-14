/**
 * Studio 动作按钮组
 * US-008: 生成摘要/大纲/测验/思维导图
 */

'use client'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FileText, List, HelpCircle, Network, Loader2 } from 'lucide-react'

export type ArtifactType = 'summary' | 'outline' | 'quiz' | 'mindmap'

interface StudioActionsProps {
  onGenerate: (type: ArtifactType) => void
  isGenerating: boolean
  generatingType?: ArtifactType
  disabled: boolean
  readySourceCount: number
  elapsedTime?: number
}

const actions: Array<{
  type: ArtifactType
  icon: React.ReactNode
  label: string
  description: string
}> = [
  {
    type: 'summary',
    icon: <FileText className="h-4 w-4" />,
    label: '生成摘要',
    description: '将资料浓缩为简洁摘要',
  },
  {
    type: 'outline',
    icon: <List className="h-4 w-4" />,
    label: '生成大纲',
    description: '提取结构化知识框架',
  },
  {
    type: 'quiz',
    icon: <HelpCircle className="h-4 w-4" />,
    label: '生成测验',
    description: '生成选择题测试理解',
  },
  {
    type: 'mindmap',
    icon: <Network className="h-4 w-4" />,
    label: '生成思维导图',
    description: '可视化知识结构',
  },
]

export function StudioActions({
  onGenerate,
  isGenerating,
  generatingType,
  disabled,
  readySourceCount,
  elapsedTime,
}: StudioActionsProps) {
  return (
    <div className="space-y-2">
      {actions.map(({ type, icon, label, description }) => {
        const isCurrentGenerating = isGenerating && generatingType === type
        const isDisabled = disabled || (isGenerating && !isCurrentGenerating)

        return (
          <TooltipProvider key={type}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  disabled={isDisabled}
                  onClick={() => onGenerate(type)}
                >
                  {isCurrentGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    icon
                  )}
                  <span className="flex-1 text-left">
                    {isCurrentGenerating ? '生成中...' : label}
                  </span>
                  {isCurrentGenerating && elapsedTime !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {Math.floor(elapsedTime)}s
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{disabled ? '请先上传资料' : description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}

      {/* 来源统计 */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        {disabled ? (
          '请先上传资料'
        ) : (
          `基于 ${readySourceCount} 个来源`
        )}
      </p>
    </div>
  )
}
