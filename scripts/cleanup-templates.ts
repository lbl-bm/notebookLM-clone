import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('正在清理旧的系统模板...')
  const deleted = await prisma.promptTemplate.deleteMany({
    where: {
      id: { in: ['system-summary', 'system-keywords'] }
    }
  })
  console.log(`已删除 ${deleted.count} 个旧模板。`)
}

main().finally(() => prisma.$disconnect())
