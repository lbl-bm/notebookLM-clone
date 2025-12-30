/**
 * Citation 状态管理 Context
 * US-007: 引文高亮与来源定位
 * 
 * 管理选中的 Citation，在左侧边栏展示引用详情
 */

'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface Citation {
  id: string
  sourceId: string
  sourceTitle: string
  sourceType: 'file' | 'url'
  content: string
  similarity: number
  metadata: {
    page?: number
    chunkIndex: number
    startChar: number
    endChar: number
  }
  // 引用编号（1, 2, 3...）
  index?: number
}

interface CitationContextValue {
  // 当前选中的 Citation
  selectedCitation: Citation | null
  // 所有 citations（用于编号映射）
  citations: Citation[]
  // 设置 citations 列表
  setCitations: (citations: Citation[]) => void
  // 选中 Citation（在边栏展示详情）
  selectCitation: (citation: Citation | null) => void
  // 通过编号选中 Citation
  selectCitationByIndex: (index: number) => void
  // 高亮的 Source ID
  highlightedSourceId: string | null
}

const CitationContext = createContext<CitationContextValue | null>(null)

export function CitationProvider({ children }: { children: ReactNode }) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null)
  const [citations, setCitationsState] = useState<Citation[]>([])
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null)

  const setCitations = useCallback((newCitations: Citation[]) => {
    // 只有当 citations 真正变化时才更新
    setCitationsState(prev => {
      // 简单比较：长度不同或第一个元素 id 不同
      if (prev.length !== newCitations.length || 
          (prev.length > 0 && newCitations.length > 0 && prev[0].id !== newCitations[0].id)) {
        return newCitations.map((c, i) => ({ ...c, index: i + 1 }))
      }
      return prev
    })
  }, [])

  const selectCitation = useCallback((citation: Citation | null) => {
    setSelectedCitation(citation)
    setHighlightedSourceId(citation?.sourceId || null)
  }, [])

  const selectCitationByIndex = useCallback((index: number) => {
    const citation = citations.find(c => c.index === index)
    if (citation) {
      selectCitation(citation)
    }
  }, [citations, selectCitation])

  return (
    <CitationContext.Provider
      value={{
        selectedCitation,
        citations,
        setCitations,
        selectCitation,
        selectCitationByIndex,
        highlightedSourceId,
      }}
    >
      {children}
    </CitationContext.Provider>
  )
}

export function useCitation() {
  const context = useContext(CitationContext)
  if (!context) {
    throw new Error('useCitation must be used within CitationProvider')
  }
  return context
}
