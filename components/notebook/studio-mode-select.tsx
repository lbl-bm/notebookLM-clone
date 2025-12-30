/**
 * Studio 模式选择下拉框
 * US-008: 快速模式 / 精准模式
 */

'use client'

import { Select, Tooltip } from 'antd'
import { Zap, Target } from 'lucide-react'
import type { StudioMode } from '@/hooks/use-studio-mode'

interface StudioModeSelectProps {
  value: StudioMode
  onChange: (mode: StudioMode) => void
  disabled?: boolean
}

export function StudioModeSelect({ value, onChange, disabled }: StudioModeSelectProps) {
  return (
    <Tooltip 
      title={
        <div className="text-xs space-y-1">
          <p><strong>⚡ 快速模式</strong>：智能采样，5-15秒</p>
          <p><strong>🎯 精准模式</strong>：Map-Reduce，30-90秒</p>
        </div>
      }
      placement="bottomRight"
    >
      <Select
        value={value}
        onChange={onChange}
        size="small"
        disabled={disabled}
        style={{ width: 110 }}
        options={[
          { 
            value: 'fast', 
            label: (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-yellow-500" /> 快速
              </span>
            )
          },
          { 
            value: 'precise', 
            label: (
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3 text-blue-500" /> 精准
              </span>
            )
          },
        ]}
      />
    </Tooltip>
  )
}
