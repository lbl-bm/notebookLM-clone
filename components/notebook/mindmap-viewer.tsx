/**
 * 思维导图查看器组件
 * US-008: 使用 React Flow + dagre 布局渲染思维导图
 * 
 * 功能：
 * - 使用 dagre 算法自动计算布局
 * - 支持节点展开/收起，默认只展开前 2 级
 * - 提供"重置视图"按钮
 */

'use client'

import { useMemo, useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  BackgroundVariant,
  ReactFlowProvider,
} from '@xyflow/react'
import dagre from 'dagre'
import { toPng } from 'html-to-image'
import { Button } from '@/components/ui/button'
import { Download, RotateCcw } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { MindMapNode } from './mindmap-node'
import type { MindMap, MindMapNode as MindMapNodeType } from '@/lib/studio/parser'

import '@xyflow/react/dist/style.css'

interface MindMapViewerProps {
  mindmap: MindMap
}

const nodeTypes = {
  mindmapNode: MindMapNode,
}

// dagre 图配置
const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

const nodeWidth = 180
const nodeHeight = 60

// 使用 dagre 算法计算布局
function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 50 })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// 将 MindMap 数据转换为 React Flow 格式
function mindmapToFlow(
  mindmap: MindMap,
  collapsedNodes: Set<string>
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  function traverse(node: MindMapNodeType, level: number, parentId?: string) {
    const nodeId = node.id
    const hasChildren = node.children && node.children.length > 0
    const isCollapsed = collapsedNodes.has(nodeId)

    nodes.push({
      id: nodeId,
      type: 'mindmapNode',
      position: { x: 0, y: 0 }, // 位置将由 dagre 计算
      data: {
        label: node.label,
        description: node.description,
        level,
        hasChildren,
        isCollapsed,
      },
    })

    if (parentId) {
      edges.push({
        id: `${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        animated: level <= 1, // 前两级边动画
      })
    }

    // 如果节点未折叠，遍历子节点
    if (!isCollapsed && node.children) {
      node.children.forEach((child) => {
        traverse(child, level + 1, nodeId)
      })
    }
  }

  traverse(mindmap.root, 0)

  return getLayoutedElements(nodes, edges)
}

// 内部组件，使用 useReactFlow
function MindMapContent({ mindmap }: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()

  // 默认折叠 2 级以下的节点
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => {
    const collapsed = new Set<string>()
    function findDeepNodes(node: MindMapNodeType, level: number) {
      if (level >= 2 && node.children) {
        collapsed.add(node.id)
      }
      node.children?.forEach((child) => findDeepNodes(child, level + 1))
    }
    findDeepNodes(mindmap.root, 0)
    return collapsed
  })

  // 转换数据
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => mindmapToFlow(mindmap, collapsedNodes),
    [mindmap, collapsedNodes]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // 当折叠状态改变时，重新计算布局
  useMemo(() => {
    const { nodes: newNodes, edges: newEdges } = mindmapToFlow(mindmap, collapsedNodes)
    setNodes(newNodes)
    setEdges(newEdges)
    // 延迟执行 fitView 以确保布局已更新
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
  }, [collapsedNodes, mindmap, setNodes, setEdges, fitView])

  // 处理节点点击（展开/折叠）
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const hasChildren = node.data.hasChildren
    if (!hasChildren) return

    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node.id)) {
        next.delete(node.id)
      } else {
        next.add(node.id)
      }
      return next
    })
  }, [])

  // 重置视图
  const handleResetView = useCallback(() => {
    // 重置折叠状态
    const collapsed = new Set<string>()
    function findDeepNodes(node: MindMapNodeType, level: number) {
      if (level >= 2 && node.children) {
        collapsed.add(node.id)
      }
      node.children?.forEach((child) => findDeepNodes(child, level + 1))
    }
    findDeepNodes(mindmap.root, 0)
    setCollapsedNodes(collapsed)
    
    // 重置视图位置
    setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 100)
    
    toast({
      title: '视图已重置',
      description: '已恢复默认展开状态',
    })
  }, [mindmap, fitView])

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
      toast({
        title: '导出成功',
        description: '思维导图已保存到本地',
      })
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('导出失败:', error)
      }
      toast({
        title: '导出失败',
        description: '请稍后重试',
        variant: 'error',
      })
    }
  }, [mindmap.title])

  return (
    <div className="space-y-3">
      {/* 标题和操作 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{mindmap.title}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleResetView}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            重置视图
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            导出 PNG
          </Button>
        </div>
      </div>

      {/* 思维导图 */}
      <div 
        ref={containerRef}
        className="h-[500px] border rounded-lg bg-slate-50 overflow-hidden"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          attributionPosition="bottom-left"
        >
          <Controls showInteractive={false} />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </div>

      {/* 提示 */}
      <p className="text-xs text-muted-foreground text-center">
        滚轮缩放 · 拖拽移动 · 点击节点展开/收起 · 悬停查看详情
      </p>
    </div>
  )
}

// 主组件，提供 ReactFlow Provider
export function MindMapViewer({ mindmap }: MindMapViewerProps) {
  return (
    <ReactFlowProvider>
      <MindMapContent mindmap={mindmap} />
    </ReactFlowProvider>
  )
}
