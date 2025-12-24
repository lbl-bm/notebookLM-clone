/**
 * 返回按钮组件
 * 确保返回时刷新页面数据
 */

'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface BackButtonProps {
  href: string
  label?: string
}

export function BackButton({ href, label }: BackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    router.push(href)
    // 确保目标页面刷新数据
    router.refresh()
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleBack} title={label || '返回'}>
      <ArrowLeft className="h-5 w-5" />
    </Button>
  )
}
