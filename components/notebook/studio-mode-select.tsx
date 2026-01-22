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
import { Zap, Target } from 'lucide-react'
import type { StudioMode } from '@/hooks/use-studio-mode'

interface StudioModeSelectProps {
  value: StudioMode
  onChange: (mode: StudioMode) => void
  disabled?: boolean
}

export function StudioModeSelect({ value, onChange, disabled }: StudioModeSelectProps) {
  return (
    <div className="w-[140px]">
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
  )
}
