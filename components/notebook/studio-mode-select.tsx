/**
 * Studio 模式选择下拉框
 * US-008: 快速模式 / 精准模式
 */

'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Zap, Target } from 'lucide-react'
import type { StudioMode } from '@/hooks/use-studio-mode'

interface StudioModeSelectProps {
  value: StudioMode
  onChange: (mode: StudioMode) => void
  disabled?: boolean
}

export function StudioModeSelect({ value, onChange, disabled }: StudioModeSelectProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-[110px]">
            <Select value={value} onValueChange={onChange} disabled={disabled}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-yellow-500" /> 快速
                  </span>
                </SelectItem>
                <SelectItem value="precise">
                  <span className="flex items-center gap-1">
                    <Target className="h-3 w-3 text-blue-500" /> 精准
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <div className="text-xs space-y-1">
            <p className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-yellow-500" />
              <strong>快速模式</strong>：智能采样，5-15秒
            </p>
            <p className="flex items-center gap-1">
              <Target className="h-3 w-3 text-blue-500" />
              <strong>精准模式</strong>：Map-Reduce，30-90秒
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
