/**
 * Next.js Middleware
 * US-001: 路由保护和 Session 管理
 * 
 * 性能优化：
 * - 只对需要认证检查的路由调用 auth API
 * - 使用更精确的 matcher 减少中间件调用
 * - API 路由跳过 middleware（由 API 自行验证）
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 需要登录才能访问的路由前缀
const protectedPrefixes = ['/notebooks']

// 已登录用户不应访问的路由
const authRoutes = ['/auth/login']

// 检查路径是否需要认证
function needsAuth(pathname: string): boolean {
  return protectedPrefixes.some(prefix => pathname.startsWith(prefix))
}

// 检查路径是否是登录页
function isAuthRoute(pathname: string): boolean {
  return authRoutes.some(route => pathname.startsWith(route))
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // 快速路径：如果不是受保护路由也不是登录页，直接放行
  const needsAuthCheck = needsAuth(pathname)
  const isAuth = isAuthRoute(pathname)
  
  if (!needsAuthCheck && !isAuth) {
    return NextResponse.next()
  }

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

  // 只有需要认证检查时才调用 getUser
  const { data: { user }, error } = await supabase.auth.getUser()

  // 未登录用户访问受保护路由 -> 重定向到登录页
  if (needsAuthCheck && !user) {
    const redirectUrl = new URL('/auth/login', request.url)
    // 添加 session 过期提示参数
    if (error?.message?.includes('expired')) {
      redirectUrl.searchParams.set('expired', 'true')
    }
    // 添加来源 URL，登录后可以跳转回去
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // 已登录用户访问登录页 -> 重定向到 notebooks
  if (isAuth && user) {
    return NextResponse.redirect(new URL('/notebooks', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * 匹配所有路由，排除：
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico
     * - 常见静态资源扩展名
     * - api 路由（由 API 自行验证，减少中间件开销）
     */
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
  ],
}
