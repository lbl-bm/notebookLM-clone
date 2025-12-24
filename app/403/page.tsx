/**
 * 403 禁止访问页面
 * US-002: 权限隔离 - 无权访问他人资源
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-4xl font-bold mb-2">403</h1>
        <h2 className="text-xl font-semibold mb-4">无权访问</h2>
        <p className="text-muted-foreground mb-8 max-w-sm">
          你没有权限访问此资源。请确认你已登录正确的账户。
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
