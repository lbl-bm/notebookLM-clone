/**
 * 全局 Providers
 * 包含 Ant Design X 的 XProvider
 */

'use client'

import { XProvider } from '@ant-design/x'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

interface ProvidersProps {
  children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          // 与 shadcn/ui 的 slate 主题保持一致
          colorPrimary: '#0f172a',
          borderRadius: 8,
        },
      }}
    >
      <XProvider>
        {children}
      </XProvider>
    </ConfigProvider>
  )
}
