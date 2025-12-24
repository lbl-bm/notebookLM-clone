/**
 * 测试 Supabase 连接
 * 运行: npx tsx scripts/test-supabase.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

console.log('🔍 测试 Supabase 连接...')
console.log('URL:', supabaseUrl)
console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : '未设置')

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  try {
    // 测试基本连接
    const { data, error } = await supabase.from('notebooks').select('count').limit(1)
    
    if (error) {
      console.error('❌ 连接失败:', error.message)
      console.log('\n💡 可能的原因:')
      console.log('1. 数据库表还未创建（需要运行 prisma migrate）')
      console.log('2. API Key 不正确')
      console.log('3. 数据库 URL 不正确')
      return false
    }
    
    console.log('✅ Supabase 连接成功!')
    return true
  } catch (err) {
    console.error('❌ 连接错误:', err)
    return false
  }
}

testConnection()
