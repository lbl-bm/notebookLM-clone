/**
 * 可调整大小的面板组件
 * 支持拖动边界调整宽度
 */

'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  side?: 'left' | 'right' // 拖动手柄在哪一侧
  className?: string
}

export function ResizablePanel({
  children,
  defaultWidth = 300,
  minWidth = 200,
  maxWidth = 600,
  side = 'right',
  className = '',
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return

      const panelRect = panelRef.current.getBoundingClientRect()
      
      // 根据 side 计算新宽度
      const newWidth = side === 'right' 
        ? e.clientX - panelRect.left
        : panelRect.right - e.clientX

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, minWidth, maxWidth, side])

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: `${width}px` }}
    >
      {children}
      
      {/* 拖动手柄 */}
      <div
        className={`absolute top-0 bottom-0 w-1 cursor-col-resize group hover:bg-primary/20 transition-colors ${
          side === 'right' ? 'right-0' : 'left-0'
        }`}
        onMouseDown={() => setIsResizing(true)}
      >
        <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity ${
          side === 'right' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
        }`}>
          <div className="bg-border rounded-full p-1 shadow-sm">
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  )
}
