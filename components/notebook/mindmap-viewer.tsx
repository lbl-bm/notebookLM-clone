/**
 * 思维导图查看器组件
 * US-008: 使用 React Flow 渲染思维导图
 */

'use client'

import { useMemo, useCallback, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
} from '@xyflow/react'
import { toPng } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Download, Maximize2 } from 'lucide-react'
import { message } from 'antd'
import { MindMapNode } from './mindmap-node'
import type { MindMap, MindMapNode as MindMapNodeType } from '@/lib/studio/parser'

import '@xyflow/react/dist/style.css'

interface MindMapViewerProps {
  mindmap: MindMap
}

const nodeTypes = {
  mindmapNode: MindMapNode,
}

// 将 MindMap 数据转换为 React Flow 格式
function mindmapToFlow(mindmap: MindMap): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 计算每个层级的节点数量，用于布局
  const levelCounts: number[] = []
  const levelCurrentIndex: number[] = []

  // 第一遍：统计每层节点数
  function countLevels(node: MindMapNodeType, level: number) {
    levelCounts[level] = (levelCounts[level] || 0) + 1
    node.children?.forEach((child) => countLevels(child, level + 1))
  }
  countLevels(mindmap.root, 0)

  // 初始化当前索引
  levelCounts.forEach((_, i) => {
    levelCurrentIndex[i] = 0
  })

  // 第二遍：生成节点和边
  function traverse(node: MindMapNodeType, level: number, parentId?: string) {
    const nodeId = node.id

    // 计算位置
    const x = level * 220
    const totalAtLevel = levelCounts[level]
    const currentIndex = levelCurrentIndex[level]
    const spacing = 80
    const totalHeight = (totalAtLevel - 1) * spacing
    const y = currentIndex * spacing - totalHeight / 2

    levelCurrentIndex[level]++

    nodes.push({
      id: nodeId,
      type: 'mindmapNode',
      position: { x, y },
      data: {
        label: node.label,
        description: node.description,
        level,
      },
    })

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      })
    }

    node.children?.forEach((child) => {
      traverse(child, level + 1, nodeId)
    })
  }

  traverse(mindmap.root, 0)

  return { nodes, edges }
}

export function MindMapViewer({ mindmap }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 转换数据
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => mindmapToFlow(mindmap),
    [mindmap]
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // 导出 PNG
  const handleExport = useCallback(async () => {
    const element = containerRef.current?.querySelector('.react-flow') as HTMLElement
    if (!element) return

    try {
      const dataUrl = await toPng(element, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      })

      const link = document.createElement('a')
      link.download = `${mindmap.title || '思维导图'}.png`
      link.href = dataUrl
      link.click()
      message.success('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      message.error('导出失败')
    }
  }, [mindmap.title])

  return (
    <div className="space-y-3">
      {/* 标题和操作 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{mindmap.title}</h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1" />
          导出 PNG
        </Button>
      </div>

      {/* 思维导图 */}
      <div 
        ref={containerRef}
        className="h-[400px] border rounded-lg bg-slate-50 overflow-hidden"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          attributionPosition="bottom-left"
        >
          <Controls showInteractive={false} />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>

      {/* 提示 */}
      <p className="text-xs text-muted-foreground text-center">
        滚轮缩放 · 拖拽移动 · 悬停节点查看详情
      </p>
    </div>
  )
}
