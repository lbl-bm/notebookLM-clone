# 向量切分策略优化 - 自适应 Chunk 大小

## 实现功能

已完成**方向一:向量切分策略优化 - 方案1:自适应Chunk大小**的开发。

### 核心特性

1. **内容分析器** (`lib/processing/content-analyzer.ts`)
   - 信息熵计算:使用香农熵公式衡量内容复杂度
   - 特殊符号密度分析:识别代码、数据密集型内容
   - 换行密度检测:识别列表、代码结构
   - 内容类型识别:自动识别表格、代码、列表、普通段落

2. **自适应切分逻辑**
   - **高密度内容**(代码/表格/技术文档): 400 tokens/chunk,15%重叠
   - **中等密度内容**: 800 tokens/chunk,12.5%重叠(默认)
   - **低密度内容**(叙述性文本): 1200 tokens/chunk,10%重叠

3. **元数据增强**
   - 新增 `chunkStrategy` 字段:标识使用的切分策略(adaptive/fixed)
   - 新增 `adaptiveReason` 字段:记录自适应调整的原因
   - 新增 `contentAnalysis` 字段:保存完整的内容分析结果

### 技术实现

#### 内容密度判断规则

```typescript
高密度条件(满足任一):
- 信息熵 > 4.5
- 符号密度 > 15%
- 换行密度 > 3
- 内容类型为代码或表格

低密度条件(需同时满足):
- 信息熵 < 3.5
- 符号密度 < 5%
- 换行密度 < 1

其他情况为中等密度
```

#### 使用方式

```typescript
import { RecursiveTextSplitter } from './lib/processing/text-splitter'

// 创建自适应切分器(默认启用)
const splitter = new RecursiveTextSplitter({ enableAdaptive: true })

// 创建固定切分器(禁用自适应)
const fixedSplitter = new RecursiveTextSplitter({ enableAdaptive: false })

// 切分文本
const chunks = splitter.splitText(text, 'source-title', 'file')

// 检查切分策略
console.log(chunks[0].metadata.chunkStrategy) // 'adaptive'
console.log(chunks[0].metadata.adaptiveReason) // 调整原因
```

### 测试结果

运行测试脚本:
```bash
npx tsx scripts/test-adaptive-splitting.ts
```

测试覆盖了4种内容类型:
- ✅ 代码块:正确识别为高密度内容
- ✅ 表格:正确识别为高密度内容
- ✅ 叙述性文本:根据信息熵判断密度
- ✅ 技术文档:根据综合指标判断密度

### 预期效果

根据设计文档:
- 技术文档/代码的检索准确率预计提升 **10-15%**
- 叙述性文本的上下文完整性预计提升 **8-12%**

### 向后兼容

- 默认启用自适应切分,无需修改现有代码
- 可通过 `enableAdaptive: false` 禁用,完全兼容旧版行为
- 元数据字段为可选,不影响现有数据结构

## 下一步计划

根据设计文档,后续可实现:

1. **方案2:特殊内容类型识别**
   - 实现表格保护机制
   - 实现代码块边界识别
   - 实现列表项分组

2. **方案3:语义边界检测**(可选)
   - 集成智谱 Embedding API
   - 实现语义相似度计算
   - 添加成本控制机制

3. **轻量级评估**
   - 选取 3-5 个真实 Source
   - 对比优化前后的检索效果
   - 记录量化提升指标

## 技术栈

- TypeScript
- Node.js crypto (MD5哈希)
- 纯算法实现,无外部依赖

## 开发者

实现时间: 2026-01-23
基于设计文档: `/Users/baimu/lbl/notebookLM-clone/.qoder/quests/rag-optimization-and-new-feature-exploration.md`
