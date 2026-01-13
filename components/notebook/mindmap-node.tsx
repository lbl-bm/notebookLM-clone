/**
 * 思维导图自定义节点
 * US-008: React Flow 节点样式 + 展开/折叠指示器
 */

'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface MindMapNodeData {
  label: string
  description?: string
  level: number
  hasChildren?: boolean
  isCollapsed?: boolean
}

const levelColors = [
  'bg-blue-500 text-white',      // Level 0 - 根节点
  'bg-green-500 text-white',     // Level 1
  'bg-purple-500 text-white',    // Level 2
  'bg-orange-500 text-white',    // Level 3
  'bg-pink-500 text-white',      // Level 4+
]

const levelSizes = [
  'text-base font-bold px-4 py-2',  // Level 0
  'text-sm font-semibold px-3 py-1.5', // Level 1
  'text-xs font-medium px-2.5 py-1',   // Level 2
  'text-xs px-2 py-1',                 // Level 3+
]

function MindMapNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData
  const colorClass = levelColors[Math.min(nodeData.level, levelColors.length - 1)]
  const sizeClass = levelSizes[Math.min(nodeData.level, levelSizes.length - 1)]

  const content = (
    <div className={`rounded-lg shadow-md ${colorClass} ${sizeClass} max-w-[180px] relative cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-white/50 transition-all`}>
      <div className="text-center">
        <span className="line-clamp-2">{nodeData.label}</span>
      </div>
      {nodeData.hasChildren && (
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 bg-white rounded-full p-0.5 shadow-sm">
          {nodeData.isCollapsed ? (
            <ChevronRight className="h-3 w-3 text-slate-600" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-600" />
          )}
        </div>
      )}
    </div>
  )

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      {nodeData.description ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {content}
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{nodeData.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        content
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </>
  )
}

export const MindMapNode = memo(MindMapNodeComponent)
