/**
 * 测试自适应切分功能
 * 运行: npx tsx scripts/test-adaptive-splitting.ts
 */

import { RecursiveTextSplitter } from '../lib/processing/text-splitter'
import { analyzeContent } from '../lib/processing/content-analyzer'

// 测试文本样本
const samples = {
  // 高密度内容 - 代码
  code: `
function calculateSum(arr: number[]): number {
  return arr.reduce((sum, num) => sum + num, 0);
}

interface User {
  id: string;
  name: string;
  email: string;
}

const users: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
];
`.trim(),

  // 高密度内容 - 表格
  table: `
| 指标 | 基线 | 优化后 | 提升 |
|------|------|--------|------|
| Precision@8 | 0.65 | 0.80 | +23% |
| Recall@8 | 0.50 | 0.60 | +20% |
| MRR | 0.55 | 0.70 | +27% |
`.trim(),

  // 低密度内容 - 叙述性文本
  narrative: `
在一个宁静的小镇上,住着一位热爱阅读的老人。每天清晨,他都会来到镇上唯一的图书馆,
坐在靠窗的位置,翻阅着各种各样的书籍。阳光透过窗户洒在书页上,仿佛也在认真阅读着那些文字。
老人喜欢历史类的书籍,尤其是关于古代文明的故事。他常常沉浸在那些遥远的时代,
想象着当时人们的生活。图书馆管理员都认识他,每当有新书到馆,总会第一时间告诉他。
`.trim(),

  // 中等密度内容 - 技术文档
  technical: `
RAG(检索增强生成)是一种结合了信息检索和文本生成的技术。它的核心思想是:
当需要回答问题时,首先从知识库中检索相关文档,然后将这些文档作为上下文,
传递给大语言模型进行生成。这种方法相比纯粹的生成,可以提供更准确、更有依据的答案。

向量切分是RAG系统中的关键环节。合理的切分策略可以:
1. 提高检索精度:chunk大小适中,既包含完整语义又不会过于冗长
2. 减少噪声:避免将无关内容混入同一个chunk
3. 优化成本:控制embedding和检索的计算量
`.trim(),
}

async function testAdaptiveSplitting() {
  console.log('='.repeat(80))
  console.log('自适应切分功能测试')
  console.log('='.repeat(80))
  console.log()

  // 创建固定切分器和自适应切分器
  const fixedSplitter = new RecursiveTextSplitter({ enableAdaptive: false })
  const adaptiveSplitter = new RecursiveTextSplitter({ enableAdaptive: true })

  for (const [type, text] of Object.entries(samples)) {
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`测试样本类型: ${type}`)
    console.log(`─'.repeat(80)}`)
    console.log(`\n原始文本长度: ${text.length} 字符`)
    
    // 分析内容特征
    const analysis = analyzeContent(text)
    console.log('\n内容分析结果:')
    console.log(`  - 内容密度: ${analysis.density}`)
    console.log(`  - 内容类型: ${analysis.type}`)
    console.log(`  - 信息熵: ${analysis.infoEntropy.toFixed(2)}`)
    console.log(`  - 符号密度: ${(analysis.symbolDensity * 100).toFixed(1)}%`)
    console.log(`  - 换行密度: ${analysis.lineBreakDensity.toFixed(2)}`)

    // 固定切分
    const fixedChunks = fixedSplitter.splitText(text, `${type}-sample`, 'text')
    console.log(`\n固定切分结果:`)
    console.log(`  - Chunk 数量: ${fixedChunks.length}`)
    console.log(`  - 平均 Token 数: ${Math.round(fixedChunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / fixedChunks.length)}`)
    
    // 自适应切分
    const adaptiveChunks = adaptiveSplitter.splitText(text, `${type}-sample`, 'text')
    console.log(`\n自适应切分结果:`)
    console.log(`  - Chunk 数量: ${adaptiveChunks.length}`)
    console.log(`  - 平均 Token 数: ${Math.round(adaptiveChunks.reduce((sum, c) => sum + c.metadata.tokenCount, 0) / adaptiveChunks.length)}`)
    console.log(`  - 策略: ${adaptiveChunks[0]?.metadata.chunkStrategy}`)
    console.log(`  - 调整原因: ${adaptiveChunks[0]?.metadata.adaptiveReason}`)
    
    // 显示第一个 chunk 的详细信息
    if (adaptiveChunks.length > 0) {
      const firstChunk = adaptiveChunks[0]
      console.log(`\n第一个 Chunk 预览:`)
      console.log(`  ${firstChunk.content.substring(0, 100)}${firstChunk.content.length > 100 ? '...' : ''}`)
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('测试完成!')
  console.log('='.repeat(80))
}

// 运行测试
testAdaptiveSplitting().catch(console.error)
