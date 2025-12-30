/**
 * 思维导图自定义节点
 * US-008: React Flow 节点样式
 */

'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Tooltip } from 'antd'

interface MindMapNodeData {
  label: string
  description?: string
  level: number
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
    <div className={`rounded-lg shadow-md ${colorClass} ${sizeClass} max-w-[180px] text-center`}>
      <span className="line-clamp-2">{nodeData.label}</span>
    </div>
  )

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      {nodeData.description ? (
        <Tooltip title={nodeData.description} placement="top">
          {content}
        </Tooltip>
      ) : (
        content
      )}
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </>
  )
}

export const MindMapNode = memo(MindMapNodeComponent)
