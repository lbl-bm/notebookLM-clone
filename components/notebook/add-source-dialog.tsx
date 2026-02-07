/**
 * 搜索来源组件
 * US-003 & US-004: 智能搜索/添加来源入口
 * 支持边栏模式（不遮挡下方内容）和模态框模式（控制高度）
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Search,
  ChevronUp,
  ChevronDown,
  Check,
  Plus,
  X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface SearchResult {
  title: string
  link: string
  content: string
  media?: string
  publish_date?: string
}

interface SourceSearchBoxProps {
  notebookId: string
  onSuccess?: () => void
  /** 展示模式 */
  mode?: 'sidebar' | 'modal'
  /** 收起状态（受控） */
  collapsed?: boolean
  /** 收起状态变化回调 */
  onCollapsedChange?: (collapsed: boolean) => void
}

export function SourceSearchBox({
  notebookId,
  onSuccess,
  mode = 'sidebar',
  collapsed: controlledCollapsed,
  onCollapsedChange,
}: SourceSearchBoxProps) {
  const [searchValue, setSearchValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set<number>())
  const [isExpanded, setIsExpanded] = useState(true)
  const [searchMode, setSearchMode] = useState<'precision' | 'exploration' | 'deep'>('exploration')
  const { toast } = useToast()

  const isModal = mode === 'modal'
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : !isExpanded

  const isValidUrl = useCallback((str: string): boolean => {
    try {
      const url = new URL(str)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  const addUrlSource = useCallback(async (url: string) => {
    const response = await fetch('/api/sources/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notebookId,
        url,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.error || '添加失败')
    }

    if (data?.warning) {
      toast({ title: '提示', description: data.warning, variant: 'warning' })
    }

    return data
  }, [notebookId, toast])

  const handleBatchAdd = useCallback(async () => {
    if (selectedResults.size === 0) return

    setIsSearching(true)

    try {
      // 所有结果都有链接，直接添加
      const selectedItems = Array.from(selectedResults).map(
        (idx) => searchResults[idx]
      )

      for (const item of selectedItems) {
        await addUrlSource(item.link)
      }

      toast({
        title: '添加成功',
        description: `已将 ${selectedItems.length} 条来源添加到知识库`,
        variant: 'success',
      })

      setSearchValue('')
      setSearchResults([])
      setSelectedResults(new Set())
      setIsExpanded(false)
      onCollapsedChange?.(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: '添加失败',
        description: (err as Error).message,
        variant: 'error',
      })
    } finally {
      setIsSearching(false)
    }
  }, [selectedResults, searchResults, addUrlSource, toast, onSuccess, onCollapsedChange])

  const toggleResult = useCallback((index: number) => {
    setSelectedResults((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedResults.size === searchResults.length) {
      setSelectedResults(new Set())
    } else {
      setSelectedResults(new Set(searchResults.keys()))
    }
  }, [selectedResults, searchResults])

  const handleSearch = useCallback(async () => {
    const value = searchValue.trim()
    if (!value) return

    setIsSearching(true)

    try {
      if (isValidUrl(value)) {
        await addUrlSource(value)
        setSearchValue('')
        setSearchResults([])
        setSelectedResults(new Set())
        setIsExpanded(false)
        onCollapsedChange?.(false)
        return
      }

      const res = await fetch('/api/sources/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: value,
          type: searchMode,
          notebookId, // 传递 notebookId 用于去重
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || '搜索失败')
      }

      const results = Array.isArray(data?.results) ? data.results : []
      setSearchResults(results)
      setSelectedResults(new Set(results.keys()))
      setIsExpanded(true)
      onCollapsedChange?.(true)

      if (results.length === 0) {
        toast({ title: '未找到结果', description: '请尝试换个关键词', variant: 'warning' })
      }
    } catch (err) {
      toast({
        title: '操作失败',
        description: (err as Error).message,
        variant: 'error',
      })
    } finally {
      setIsSearching(false)
    }
  }, [searchValue, isValidUrl, addUrlSource, toast, onCollapsedChange])

  const toggleExpanded = useCallback(() => {
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    onCollapsedChange?.(newExpanded)
  }, [isExpanded, onCollapsedChange])

  const clearSearch = useCallback(() => {
    setSearchValue('')
    setSearchResults([])
    setSelectedResults(new Set())
    setIsExpanded(false)
    onCollapsedChange?.(false)
  }, [onCollapsedChange])

  return (
    <div className={isModal ? 'relative' : ''}>
      <div
        className={`
          border border-slate-200 dark:border-slate-700 rounded-xl 
          overflow-hidden bg-slate-50 dark:bg-slate-800/50
          ${isModal ? 'shadow-sm' : ''}
        `}
      >
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入关键词搜索..."
            className={cn(
              "h-10 w-full rounded-md border border-input bg-background pl-9 pr-24 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              !isModal && "pr-24" // 侧边栏模式留出更多空间
            )}
            disabled={isSearching}
          />
          
          {/* 搜索模式选择器 - 仅在非 URL 输入时显示 */}
          {!isValidUrl(searchValue) && searchValue && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2">
              <Select
                value={searchMode}
                onValueChange={(v) => setSearchMode(v as any)}
              >
                <SelectTrigger className="h-7 w-[65px] border-0 bg-transparent px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="min-w-[75px]">
                  <SelectItem value="precision">精确</SelectItem>
                  <SelectItem value="exploration">探索</SelectItem>
                  <SelectItem value="deep">深度</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {searchValue && (
            <button
              onClick={() => setSearchValue('')}
              className="absolute right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {searchResults.length > 0 && !isCollapsed && (
          <div
            className={`
              border-t border-slate-200 dark:border-slate-700
              ${isModal ? 'absolute top-full left-0 right-0 z-50 shadow-lg rounded-b-xl max-h-56 overflow-y-auto bg-white dark:bg-slate-900' : 'max-h-48 overflow-y-auto'}
            `}
          >
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 sticky top-0">
              <button
                onClick={toggleExpanded}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ChevronUp className="h-3 w-3" />
                收起
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  onClick={toggleAll}
                >
                  {selectedResults.size === searchResults.length ? '取消全选' : '全选'}
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={selectedResults.size === 0 || isSearching}
                  onClick={handleBatchAdd}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  添加 ({selectedResults.size})
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {searchResults.map((item, i) => (
                <div
                  key={`${item.link}_${i}`}
                  className={`
                    flex items-start gap-3 p-3 cursor-pointer
                    hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors
                    ${selectedResults.has(i) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                  `}
                  onClick={() => toggleResult(i)}
                >
                  <div
                    className={`
                      w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5
                      transition-colors
                      ${selectedResults.has(i)
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                      }
                    `}
                  >
                    {selectedResults.has(i) && <Check className="h-3 w-3" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                      {item.title || item.link}
                    </p>
                    {item.link && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 truncate mt-0.5">
                        {item.link}
                      </p>
                    )}
                    {item.content && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                        {item.content}
                      </p>
                    )}
                    {item.publish_date && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {item.publish_date}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchResults.length > 0 && isCollapsed && (
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleExpanded}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <ChevronDown className="h-3 w-3" />
                展开
              </button>
              <span className="text-xs text-slate-500">
                已找到 {searchResults.length} 条结果
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                onClick={toggleAll}
              >
                {selectedResults.size === searchResults.length ? '取消全选' : '全选'}
              </Button>
              <button
                onClick={clearSearch}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <X className="h-3 w-3" />
                清空
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
