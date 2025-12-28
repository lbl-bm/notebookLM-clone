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
  Globe,
  Sparkles,
  ArrowRight,
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
  inModal = false,
}: SourceSearchBoxProps) {
  const [searchValue, setSearchValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // 处理智能搜索/添加URL
  const handleSearch = async () => {
    if (!searchValue.trim()) return
    
    setIsSearching(true)

    try {
      // 检测是否为URL
      const isUrl = /^https?:\/\//i.test(searchValue.trim())
      
      if (isUrl) {
        // 直接添加URL
        const response = await fetch('/api/sources/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notebookId,
            url: searchValue.trim(),
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || '添加失败')
        }

        setSearchValue('')
        onSuccess?.()
      } else {
        // TODO: 实现AI智能搜索功能
        console.log('AI Smart search:', searchValue)
        // 暂时模拟搜索过程
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error('Search/Add error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className={`border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/50 ${inModal ? '' : ''}`}>
      {/* 搜索输入框 */}
      <div className="flex items-center px-4 py-3">
        <Search className="h-4 w-4 text-slate-400 mr-3 flex-shrink-0" />
        <input
          type="text"
          placeholder="在网络中搜索新来源"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
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
  )
}
