/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb', // 支持大文件上传
    },
    // 优化客户端路由缓存时间
    staleTimes: {
      dynamic: 30,  // 动态页面缓存 30 秒（减少重复请求）
      static: 180,  // 静态页面缓存 3 分钟
    },
  },

  // 优化构建
  compiler: {
    // 生产环境移除 console.log（保留 error/warn）
    removeConsole: process.env.NODE_ENV === 'production' 
      ? { exclude: ['error', 'warn'] } 
      : false,
  },

  // 优化打包
  modularizeImports: {
    // 优化 lucide-react 的导入（按需加载图标）
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  // 添加响应头优化缓存
  async headers() {
    return [
      {
        // 静态资源缓存策略
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // API 响应不缓存
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
