import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const systemTemplates = [
    {
      name: '生成摘要',
      description: '基于选中的资料生成一份简洁的摘要（200-300 字）。',
      template: `请基于以下资料生成一份简洁的摘要（200-300 字）：

要求：
- 提取核心观点
- 保留关键数据
- 使用简洁语言

资料内容：
{{context}}`,
      variables: ['context'],
      isSystem: true,
      ownerId: '00000000-0000-0000-0000-000000000000',
    },
    {
      name: '提取关键词',
      description: '从资料中提取 10-15 个关键词，并按重要性排序。',
      template: `请从以下资料中提取 10-15 个关键词，并按重要性排序：

资料内容：
{{context}}

输出格式：
1. 关键词 1 - 简短说明
2. 关键词 2 - 简短说明
...`,
      variables: ['context'],
      isSystem: true,
      ownerId: '00000000-0000-0000-0000-000000000000',
    },
  ]

  console.log('开始同步系统模板...')

  for (const t of systemTemplates) {
    // 使用固定的 UUID 确保可重复运行且符合数据库约束
    const id = t.name === '生成摘要' 
      ? '00000000-0000-0000-0000-000000000001' 
      : '00000000-0000-0000-0000-000000000002'
    
    await prisma.promptTemplate.upsert({
      where: { id },
      update: {
        name: t.name,
        description: t.description,
        template: t.template,
        variables: t.variables,
      },
      create: {
        id,
        ...t,
      },
    })
  }

  console.log('系统模板同步完成！')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
