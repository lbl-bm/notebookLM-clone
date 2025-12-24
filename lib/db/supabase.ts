/**
 * Supabase 工具函数
 * 用于 Auth 和权限校验
 */

import { createClient } from '@/lib/supabase/server'

/**
 * 获取当前用户 ID（服务端）
 * 用于 ownerId 校验（架构约束）
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id || null
}

/**
 * 验证用户是否拥有资源
 * 🔴 所有 API 必须调用此函数（架构约束）
 */
export async function verifyOwnership(
  ownerId: string,
  currentUserId: string | null
): Promise<boolean> {
  if (!currentUserId) {
    throw new Error('未登录')
  }
  if (ownerId !== currentUserId) {
    throw new Error('无权访问此资源')
  }
  return true
}

// 重新导出客户端（向后兼容）
export { supabaseAdmin } from '@/lib/supabase/admin'
export { createClient as createBrowserClient } from '@/lib/supabase/client'
export { createClient as createServerClient } from '@/lib/supabase/server'
