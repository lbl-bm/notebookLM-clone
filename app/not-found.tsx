/**
 * 404 页面未找到
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-4">页面未找到</h2>
        <p className="text-muted-foreground mb-8 max-w-sm">
          你访问的页面不存在或已被删除。
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
          <Button asChild>
            <Link href="/notebooks">我的知识库</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
