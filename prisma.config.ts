/**
 * Prisma 7 配置文件
 * CLI 命令（migrate, db push）会读取这个文件来获取数据库连接
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
})
