/**
 * Studio 模式状态管理 Hook
 * US-008: 支持快速/精准模式切换，localStorage 持久化
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

export type StudioMode = 'fast' | 'precise'

const STORAGE_KEY = 'studio-mode'

export function useStudioMode() {
  const [mode, setModeState] = useState<StudioMode>('fast')
  const [isLoaded, setIsLoaded] = useState(false)

  // 从 localStorage 加载
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'fast' || stored === 'precise') {
      setModeState(stored)
    }
    setIsLoaded(true)
  }, [])

  // 设置模式并持久化
  const setMode = useCallback((newMode: StudioMode) => {
    setModeState(newMode)
    localStorage.setItem(STORAGE_KEY, newMode)
  }, [])

  return {
    mode,
    setMode,
    isLoaded,
  }
}
