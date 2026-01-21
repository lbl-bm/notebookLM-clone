/**
 * 搜索来源组件
 * US-003 & US-004: 智能搜索/添加来源入口
 * 可嵌入边栏或模态框中使用
 */

'use client'

import { useState } from 'react'
import {
  Loader2,
  Search,
  ArrowRight,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface SearchResult {
  title: string
  link: string
  content: string
}

interface SourceSearchBoxProps {
  notebookId: string
  onSuccess?: () => void
  /** 是否显示在模态框中（样式略有不同） */
  inModal?: boolean
}

export function SourceSearchBox({
  notebookId,
  onSuccess,
}: SourceSearchBoxProps) {
  const [searchValue, setSearchValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const { toast } = useToast()

  // 检测是否为有效 URL
  const isValidUrl = (str: string): boolean => {
    try {
      const url = new URL(str)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  const addUrlSource = async (url: string) => {
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

    toast({ title: '已添加来源', description: '来源已成功添加到知识库', variant: 'success' })
    onSuccess?.()
  }

  // 处理智能搜索/添加URL
  const handleSearch = async () => {
    const value = searchValue.trim()
    if (!value) return
    
    setIsSearching(true)

    try {
      // 检测是否为URL
      if (isValidUrl(value)) {
        await addUrlSource(value)
        setSearchValue('')
        setSearchResults([])
      } else {
        const res = await fetch('/api/sources/web-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.error || '搜索失败')
        }

        const results = Array.isArray(data?.results) ? data.results : []
        setSearchResults(results)

        if (results.length === 0) {
          toast({ title: '未找到结果', description: '请尝试换个关键词', variant: 'warning' })
        }
      }
    } catch (err) {
      toast({ title: '操作失败', description: (err as Error).message, variant: 'error' })
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className={`border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/50`}>
        {/* 搜索输入框 */}
        <div className="flex items-center px-4 py-3">
          <Search className="h-4 w-4 text-slate-400 mr-3 flex-shrink-0" />
          <input
            type="text"
            placeholder="在网络中搜索知识来源"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value)
              setSearchResults([])
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          {searchValue && (
            <button
              className="h-7 w-7 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
              onClick={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          {searchResults.map((item, i) => (
            <div
              key={`${item.link}_${i}`}
              className="p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0"
            >
              <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                {item.title || item.link}
              </p>
              {item.content && (
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                  {item.content}
                </p>
              )}
              <button
                className="text-xs text-blue-600 dark:text-blue-400 mt-2 disabled:opacity-50"
                disabled={isSearching}
                onClick={async () => {
                  setIsSearching(true)
                  try {
                    await addUrlSource(item.link)
                    setSearchResults([])
                    setSearchValue('')
                  } catch (err) {
                    toast({ title: '添加失败', description: (err as Error).message, variant: 'error' })
                  } finally {
                    setIsSearching(false)
                  }
                }}
              >
                添加此来源
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
