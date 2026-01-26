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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ type, icon, label, description }) => {
          const isCurrentGenerating = isGenerating && generatingType === type
          const isDisabled = disabled || (isGenerating && !isCurrentGenerating)

          return (
            <TooltipProvider key={type}>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-auto py-3 flex flex-col items-center justify-center gap-2 text-center bg-card hover:bg-accent/50 border-muted-foreground/20 hover:border-primary/20 transition-all duration-300"
                    disabled={isDisabled}
                    onClick={() => onGenerate(type)}
                  >
                    <div className={`p-2 rounded-full bg-primary/5 ${isCurrentGenerating ? 'animate-pulse' : ''}`}>
                      {isCurrentGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <div className="text-primary">{icon}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-sm font-medium">
                        {isCurrentGenerating ? '生成中...' : label}
                      </span>
                      {isCurrentGenerating && elapsedTime !== undefined && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {Math.floor(elapsedTime)}s
                        </span>
                      )}
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                  <p>{disabled ? '请先上传资料' : description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        })}
      </div>

      {/* 来源统计 */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="h-px w-12 bg-border/50" />
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          {disabled ? (
            '请先上传资料'
          ) : (
            `基于 ${readySourceCount} 个来源`
          )}
        </p>
        <div className="h-px w-12 bg-border/50" />
      </div>
    </div>
  )
}
