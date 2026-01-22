import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { processSource } from '@/lib/processing/processor'

// Vercel Hobby 限制 Serverless Function 执行时间 (通常为 10s 或 60s)
// 我们每次只处理少量任务，避免超时
const BATCH_SIZE = 2

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const { searchParams } = new URL(request.url)
    const isManual = searchParams.get('manual') === 'true'

    // 我们采用混合验证：
    // 1. Bearer Token 验证 (GitHub Actions)
    // 2. 没有任何验证 (公开)? 不安全。
    // 3. 用户 Session 验证 (前端触发)
    
    let isAuthorized = false
    
    if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
      isAuthorized = true
    } else {
    }

    // 简单起见，我们允许：
    // 1. 带正确 Bearer Token 的请求
    // 2. 带 manual=true 参数的请求 (视作前端触发，需自行承担风险，或后续加 Session 验证)
    
    if (!isAuthorized && !isManual && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       // 如果不是 manual 且 密钥不对
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 获取待处理任务
    // 优先处理 ProcessingQueue 中 pending 的任务
    const queueItems = await prisma.processingQueue.findMany({
      where: { 
        status: 'pending',
        attempts: { lt: 3 } // 重试次数小于 3
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' }
      ],
      take: BATCH_SIZE,
    })

    const results = []

    // 3. 处理任务
    if (queueItems.length > 0) {
      for (const item of queueItems) {
        try {
          // 更新为 processing
          await prisma.processingQueue.update({
            where: { id: item.id },
            data: { status: 'processing', startedAt: new Date() }
          })
          
          // 更新 Source 状态 (兼容旧逻辑)
          await prisma.source.update({
             where: { id: item.sourceId },
             data: { status: 'processing', errorMessage: null }
          })

          // 执行处理 (不等待，防止超时? 不，Cron Job 应该等待结果记录日志)
          // 但 Vercel Function 有时间限制。
          // 我们这里选择 await，但只处理少量。
          await processSource(item.sourceId)
          
          // 完成
          await prisma.processingQueue.update({
            where: { id: item.id },
            data: { status: 'completed', completedAt: new Date() }
          })
          
          results.push({ id: item.id, status: 'success' })
          
        } catch (error) {
          console.error(`Failed to process item ${item.id}:`, error)
          const err = error as Error
          
          // 失败记录
          await prisma.processingQueue.update({
            where: { id: item.id },
            data: { 
              status: 'failed', 
              errorMessage: err.message,
              attempts: { increment: 1 }
            }
          })
          
          // 如果达到最大重试次数，标记 Source 为失败
          if (item.attempts + 1 >= 3) {
             await prisma.source.update({
               where: { id: item.sourceId },
               data: { status: 'failed', errorMessage: err.message }
             })
          }
          
          results.push({ id: item.id, status: 'failed', error: err.message })
        }
      }
    } else {
      // 如果队列空，检查 Sources 表是否有漏网之鱼 (状态为 pending 但不在队列中)
      // 这是一种自我修复机制
      const stuckSources = await prisma.source.findMany({
        where: { status: 'pending' },
        take: BATCH_SIZE,
        orderBy: { createdAt: 'asc' }
      })
      
      for (const source of stuckSources) {
         // 检查是否已在队列
         const inQueue = await prisma.processingQueue.findFirst({
           where: { sourceId: source.id, status: { in: ['pending', 'processing'] } }
         })
         
         if (!inQueue) {
            // 加入队列并立即处理
            // ...逻辑同上，简化处理直接调用 processSource
            // 为保持一致性，先加队列
            const q = await prisma.processingQueue.create({
              data: { sourceId: source.id, status: 'processing', startedAt: new Date() }
            })
            
            try {
               await processSource(source.id)
               await prisma.processingQueue.update({
                 where: { id: q.id },
                 data: { status: 'completed', completedAt: new Date() }
               })
               results.push({ sourceId: source.id, status: 'success (recovered)' })
            } catch (error) {
               const err = error as Error
               await prisma.processingQueue.update({
                 where: { id: q.id },
                 data: { status: 'failed', errorMessage: err.message, attempts: 1 }
               })
               await prisma.source.update({
                 where: { id: source.id },
                 data: { status: 'failed', errorMessage: err.message }
               })
               results.push({ sourceId: source.id, status: 'failed (recovered)', error: err.message })
            }
         }
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length, 
      results 
    })

  } catch (error) {
    console.error('Cron job failed:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
