'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react'

export default function NotebooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 仅在开发环境打印错误
    if (process.env.NODE_ENV === 'development') {
      console.error('Notebooks 页面错误:', error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full p-6 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          页面加载失败
        </h1>
        
        <p className="text-slate-600 mb-6">
          {process.env.NODE_ENV === 'development' 
            ? error.message 
            : '加载 Notebook 列表时出现问题'}
        </p>

        {error.digest && (
          <p className="text-xs text-slate-400 mb-6 font-mono">
            错误 ID: {error.digest}
          </p>
        )}
        
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => reset()}
            variant="default"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            重新加载
          </Button>
          
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回首页
          </Button>
        </div>
      </Card>
    </div>
  )
}
