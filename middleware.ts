/**
 * Next.js Middleware
 * US-001: 路由保护和 Session 管理
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 需要登录才能访问的路由
const protectedRoutes = ['/notebooks']

// 已登录用户不应访问的路由
const authRoutes = ['/auth/login']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // 刷新 session
  const { data: { user }, error } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // 检查是否是受保护的路由
  const isProtectedRoute = protectedRoutes.some(route => 
    pathname.startsWith(route)
  )

  // 检查是否是认证路由
  const isAuthRoute = authRoutes.some(route => 
    pathname.startsWith(route)
  )

  // 未登录用户访问受保护路由 -> 重定向到登录页
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/auth/login', request.url)
    // 添加 session 过期提示参数
    if (error?.message?.includes('expired')) {
      redirectUrl.searchParams.set('expired', 'true')
    }
    return NextResponse.redirect(redirectUrl)
  }

  // 已登录用户访问登录页 -> 重定向到 notebooks
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/notebooks', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
