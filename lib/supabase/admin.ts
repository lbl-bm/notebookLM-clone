/**
 * Supabase Admin 客户端
 * 使用 Secret Key，绕过 RLS，仅用于服务端管理操作
 * ⚠️ 警告：此客户端拥有完全权限，仅在服务端使用
 */

import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
