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
  AlertCircle,
} from 'lucide-react'

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
  const [error, setError] = useState('')

  // 检测是否为有效 URL
  const isValidUrl = (str: string): boolean => {
    try {
      const url = new URL(str)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  // 处理智能搜索/添加URL
  const handleSearch = async () => {
    const value = searchValue.trim()
    if (!value) return
    
    setError('')
    setIsSearching(true)

    try {
      // 检测是否为URL
      if (isValidUrl(value)) {
        // 直接添加URL
        const response = await fetch('/api/sources/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId,
            url: value,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || '添加失败')
        }

        // 如果有警告信息，显示但不阻止成功
        if (data.warning) {
          setError(data.warning)
          setTimeout(() => setError(''), 3000)
        }

        setSearchValue('')
        onSuccess?.()
      } else {
        // TODO: 实现AI智能搜索功能
        // 暂时提示用户输入有效URL
        setError('请输入有效的网址（以 http:// 或 https:// 开头）')
      }
    } catch (err) {
      setError((err as Error).message)
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
            placeholder="在网络中搜索新来源"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value)
              setError('')
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

      {/* 错误/警告提示 */}
      {error && (
        <div className="flex items-start gap-2 px-1">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>
        </div>
      )}
    </div>
  )
}
