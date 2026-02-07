import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * ✅ P1-4: DATABASE_URL 配置说明
 *
 * Serverless 环境（Vercel）配置建议：
 * 1. 使用 Supabase Transaction Pooler（端口 6543）
 * 2. 添加连接池参数，示例：
 *    postgresql://user:pass@host.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1
 *
 * 参数说明：
 * - pgbouncer=true: 启用连接池模式
 * - connection_limit=1: 每个 Serverless 实例最多 1 个连接
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const pool =
  globalForPrisma.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // serverless 每实例仅需 1 个连接
    idleTimeoutMillis: 20000, // 20s 空闲后释放连接
    connectionTimeoutMillis: 10000, // 10s 连接超时（跨区域部署需要更长时间）
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export default prisma;
