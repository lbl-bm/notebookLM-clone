# 关键 Review 意见 - 深度分析与修正方案

**生成时间**: 2026-03-26
**来源**: 项目 Review 反馈
**优先级**: P0（影响 Phase 1 的可行性）

---

## 📌 Issue 1: 多路召回的技术可行性验证

### 问题诊断

✅ **当前文档的假设**:
- 文档假设可以用 BM25 做稀疏检索
- 配合 pgvector 稠密检索做混合召回
- 预期工作量：1 工程日

❌ **实际技术现状**:
1. **Supabase + PostgreSQL 的局限**:
   - pgvector 本身只支持向量操作，**不支持 BM25**
   - Supabase 的全文搜索使用 PostgreSQL 原生的 `tsvector`
   - `tsvector` **≠ BM25**（tsvector 是简单的词频加权，BM25 是更复杂的概率排序）

2. **当前项目的 tsvector 实现**:
   - 项目已在 `.qoder/repowiki` 文档中提到了 `content_tsv`
   - 有 GIN 索引支持
   - **但这不是 BM25**，是 PostgreSQL 的标准全文搜索

3. **两条技术路线的成本对比**:

```
┌─────────────────────────────────────────────────────────┐
│ 方案 A: 使用 pg_bm25 / paradedb                       │
├─────────────────────────────────────────────────────────┤
│                                                        │
│ 优点:                                                  │
│ ✓ BM25 排序质量好，学术界标准                          │
│ ✓ 不需要额外中间件，运维简单                           │
│ ✓ 成本低，性能好                                      │
│                                                        │
│ 缺点:                                                  │
│ ✗ ParadeDB 是 Supabase 生态的第三方插件                │
│ ✗ 需要 PostgreSQL 14+ (Supabase 支持)                 │
│ ✗ 需要自己编译或使用官方预构建                        │
│ ✗ 可靠性与维护承诺不如 pg_trgm                        │
│                                                        │
│ 工作量:                                                │
│ • 调研与评估: 2-3d                                     │
│ • 集成与测试: 2-3d                                     │
│ • 总计: 4-6d (非 1d)                                  │
│                                                        │
│ 风险:                                                  │
│ 🟠 中等 - 第三方插件的生态和支持问题                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 方案 B: 引入 Elasticsearch / Typesense                 │
├─────────────────────────────────────────────────────────┤
│                                                        │
│ 优点:                                                  │
│ ✓ ES 是业界标准，支持复杂搜索                         │
│ ✓ 搜索质量最好，支持 BM25 + 多种算法                  │
│ ✓ 可扩展性强，支持数百万级别文档                      │
│ ✓ 有完整的社区和生态                                  │
│                                                        │
│ 缺点:                                                  │
│ ✗ 引入新中间件，运维复杂度 +50%                       │
│ ✗ 成本增加：ES 云服务 $50-200/月                      │
│ ✗ 数据一致性问题：pg <-> ES 双写                      │
│ ✗ 故障风险增加：多个系统故障积压                      │
│ ✗ 开发调试困难：需要同步维护两套搜索                  │
│                                                        │
│ 工作量:                                                │
│ • 选型与采购: 2-3d                                     │
│ • 集成双写: 3-5d                                       │
│ • 同步与去重: 2-3d                                     │
│ • 故障处理: 2-3d                                       │
│ • 监控告警: 1-2d                                       │
│ • 总计: 10-16d (不是 1d, 是 2 周!)                    │
│                                                        │
│ 风险:                                                  │
│ 🔴 高 - 系统复杂度、成本、运维                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 方案 C: 改进 tsvector + RRF 融合                       │
├─────────────────────────────────────────────────────────┤
│                                                        │
│ 核心思路:                                              │
│ 现有的 PostgreSQL tsvector 虽然不是 BM25，            │
│ 但通过以下方法可以获得接近的效果:                    │
│ 1. 使用 ts_rank / ts_rank_cd 代替简单相似度           │
│ 2. 通过 RRF 融合向量检索 + 全文检索                   │
│ 3. 向量检索捕捉语义，tsvector 捕捉关键词             │
│                                                        │
│ 优点:                                                  │
│ ✓ 0 成本 - 利用现有基础设施                           │
│ ✓ 运维简单 - 一个数据库，一个真实源                   │
│ ✓ 速度快 - PostgreSQL 本地执行                        │
│ ✓ 可靠性高 - 久经考验的技术                           │
│                                                        │
│ 缺点:                                                  │
│ ✗ 质量略低于真正的 BM25 (预期 -5-10%)                 │
│ ✗ 对多语言支持有限 (PostgreSQL tsvector)             │
│ ✗ 需要更多调优工作 (权重调整、融合算法)               │
│                                                        │
│ 工作量:                                                │
│ • 改进 SQL 查询: 1-2d                                  │
│ • RRF 融合算法: 1d                                     │
│ • 调优与测试: 1-2d                                     │
│ • 总计: 3-5d (相对合理)                               │
│                                                        │
│ 风险:                                                  │
│ 🟡 低 - 都是现有技术，降级路径清晰                     │
└─────────────────────────────────────────────────────────┘
```

### 修正方案推荐

#### 🎯 推荐方向：方案 C (改进 tsvector) + 可选方案 A (ParadeDB)

**阶段化策略**:

```
Phase 1.1a (立即做): 改进 tsvector + RRF
├─ 升级 SQL 查询: ts_rank + vector similarity + RRF
├─ 预期效果: P@5 +12-15% (vs 现在的单路向量)
├─ 工作量: 3-5d
├─ 风险: 低
└─ 目标: 快速获得 80% 的收益

Phase 1.1b (可选，2-3周后): 评估 ParadeDB
├─ 当前方案达到 P@5 78-80% 时评估
├─ 如果对 P@5 82%+ 有硬需求，才考虑 ParadeDB
├─ 成本: +4-6d
├─ 风险: 中等
└─ 收益: P@5 额外 +2-3%

Phase 1.1c (不推荐): Elasticsearch
├─ 只有在"高并发 + 复杂搜索需求"才考虑
├─ 成本: +10-16d + 每月 $100+
├─ 风险: 高
└─ 当前规模不必要
```

### 具体技术方案

#### 方案 C 的具体实现

```sql
-- 1. 确认 document_chunks 有 content_tsv 列和 GIN 索引
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'document_chunks'
AND column_name = 'content_tsv';

-- 2. 全文检索查询，使用 ts_rank 排序
SELECT
  dc.id,
  dc.content,
  ts_rank(
    dc.content_tsv,
    plainto_tsquery('english', $1)
  ) AS fts_score
FROM document_chunks dc
WHERE dc.content_tsv @@ plainto_tsquery('english', $1)
  AND dc.notebook_id = $2
ORDER BY fts_score DESC
LIMIT 10;

-- 3. 向量检索（现有）
SELECT *
FROM document_chunks
WHERE notebook_id = $1
ORDER BY embedding <-> $2::vector
LIMIT 10;

-- 4. RRF 融合 (Reciprocal Rank Fusion)
WITH dense AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY embedding <-> $1::vector) as rank
  FROM document_chunks
  WHERE notebook_id = $2
  LIMIT 20
),
sparse AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY ts_rank(content_tsv, plainto_tsquery('english', $3)) DESC
    ) as rank
  FROM document_chunks
  WHERE notebook_id = $2
    AND content_tsv @@ plainto_tsquery('english', $3)
  LIMIT 20
)
SELECT
  COALESCE(d.id, s.id) as id,
  COALESCE(d.rank, 60) as dense_rank,
  COALESCE(s.rank, 60) as sparse_rank,
  1.0/COALESCE(d.rank, 60) + 1.0/COALESCE(s.rank, 60) as rrf_score
FROM dense d
FULL OUTER JOIN sparse s ON d.id = s.id
ORDER BY rrf_score DESC
LIMIT 10;
```

#### TypeScript 集成代码

```typescript
// lib/rag/hybrid-retriever.ts
export interface HybridRetrievalResult {
  chunks: DocumentChunk[]
  scores: {
    denseScore: number    // 向量相似度
    sparseScore: number   // 全文检索分数
    rrfScore: number      // 融合后分数
  }
  retrievalMethod: 'dense' | 'sparse' | 'hybrid'
  latency: {
    denseMs: number
    sparseMs: number
    totalMs: number
  }
}

export async function hybridRetrieve(
  query: string,
  notebookId: string,
  options: {
    topK?: number
    denseWeight?: number
    sparseWeight?: number
  } = {}
): Promise<HybridRetrievalResult> {
  const topK = options.topK ?? 10
  const denseWeight = options.denseWeight ?? 1.0
  const sparseWeight = options.sparseWeight ?? 1.0

  // Step 1: Query embedding (向量检索)
  const denseStart = Date.now()
  const embedding = await getQueryEmbedding(query)
  const denseResults = await db.query(
    `SELECT id, content, embedding <-> $1 as distance
     FROM document_chunks
     WHERE notebook_id = $2
     ORDER BY distance
     LIMIT ${topK * 2}`
    [embedding, notebookId]
  )
  const denseMs = Date.now() - denseStart

  // Step 2: Full-text search (全文检索)
  const sparseStart = Date.now()
  const sparseResults = await db.query(
    `SELECT id, content, ts_rank(content_tsv, plainto_tsquery($1)) as rank
     FROM document_chunks
     WHERE notebook_id = $2
       AND content_tsv @@ plainto_tsquery($1)
     ORDER BY rank DESC
     LIMIT ${topK * 2}`
    [query, notebookId]
  )
  const sparseMs = Date.now() - sparseStart

  // Step 3: RRF Fusion
  const rrfResults = fuseResults(
    denseResults,
    sparseResults,
    { denseWeight, sparseWeight }
  )

  return {
    chunks: rrfResults.slice(0, topK),
    scores: calculateScores(rrfResults),
    retrievalMethod: 'hybrid',
    latency: { denseMs, sparseMs, totalMs: denseMs + sparseMs }
  }
}
```

### 工作量修正

| 项 | 原文档 | 修正后 | 说明 |
|----|-------|--------|------|
| P1.1.2 BM25 混合检索 | 1d | 3-5d | 包括 tsvector 改进 + RRF 融合 + 调优 |
| 添加 ParadeDB (可选) | - | +4-6d | 如果需要 BM25 真正的排序质量 |
| 引入 Elasticsearch (不推荐) | - | +10-16d + ¥100+/月 | 成本太高，当前阶段不推荐 |

### 修正后的验收标准

```typescript
// P1.1 多路召回与精排 - 修正验收标准

Phase 1.1a 阶段（tsvector + RRF）:
✓ 实现 ts_rank 全文检索
✓ 实现 RRF 融合算法
✓ P@5 达到 75-78% (vs 现在 65%)
✓ 响应时间 <200ms (单次查询)
✓ 支持灰度开关: useHybridRetrieval=true/false

Phase 1.1b 阶段（可选 ParadeDB）:
✓ 可选集成 ParadeDB
✓ 如果采用，P@5 达到 80%+
✓ 保持与 Phase 1.1a 的兼容性

降级条件:
⚠️ 如果 P@5 未达 75%，回滚到单路向量检索
⚠️ 如果查询延迟 >300ms，检查 GIN 索引是否工作
⚠️ 如果全文检索效果差（<5% 的 chunk 通过 FTS 被发现），
   考虑调整 tsvector 的分词器或调整 RRF 权重
```

---

## 📌 Issue 2: Checklist 缺少回滚方案

### 问题诊断

❌ **当前文档的问题**:
- 每个任务有验收标准，**但没有失败时的处理预案**
- 比如：P1.1 目标是 P@5 80%，但如果只达到 78% 怎么办？
- 没有定义"何时触发回滚"和"如何快速回滚"
- 风险意识不够，容易导致"卡在中间"的状况

### 修正方案

让我创建一份完整的"回滚与降级策略"文档：
<function_calls>
<invoke name="Write">
<parameter name="content"># Phase 1 - 回滚与降级策略

## 1. 回滚触发条件

### P1.1 多路召回与精排

#### 验收标准
| 指标 | 绿灯 ✓ | 黄灯 ⚠️ | 红灯 ✗ |
|-----|--------|--------|--------|
| P@5 (检索准确率) | ≥80% | 75-80% | <75% |
| NDCG@5 (排序质量) | ≥0.75 | 0.65-0.75 | <0.65 |
| 查询延迟 (P50) | <200ms | 200-300ms | >300ms |
| 错误率 | <0.1% | 0.1-1% | >1% |

#### 触发回滚的条件
```
立即回滚 (红灯):
□ P@5 < 75% (无法达到最低可用线)
□ 查询延迟 > 300ms (用户体验变差)
□ 错误率 > 1% (系统稳定性问题)
□ 灰度 24h 内核心指标持续下跌 >5%

不回滚但进入优化 (黄灯):
□ P@5 在 75-80% 之间 (继续调参，目标 80%)
□ 查询延迟 200-300ms (可接受，但需要优化)
□ 错误率 0.1-1% (需要监控和修复)

保持运行 (绿灯):
□ 达到或超过所有验收标准
□ 灰度扩大到 50% → 100%
```

#### 快速回滚步骤 (5分钟内)

```
步骤 1: 触发回滚 (1分钟)
  □ 运维工程师执行: kubectl/Docker 回滚脚本
  □ 或手动 revert 配置: useHybridRetrieval=false
  □ 验证: GET /api/health 返回绿色

步骤 2: 关闭灰度功能 (1分钟)
  □ 数据库: UPDATE feature_flags SET enabled=false WHERE name='hybrid_retrieval'
  □ 立即生效: 无需重启服务

步骤 3: 确认状态 (1分钟)
  □ 查询旧日志: 所有请求使用 dense_only 检索
  □ 监控仪表板: P@5 回到 65% (预期)

步骤 4: 通知团队 (1分钟)
  □ Slack: #incident 频道通知
  □ 记录: 回滚原因、时间、影响范围

步骤 5: 启动分析 (事后)
  □ 收集失败时的日志
  □ Review 代码变化
  □ 编写事后报告
```

#### 性能回退优雅处理

如果在黄灯区间 (P@5 75-80%):

```
选项 A: 继续调参 (推荐)
  时间: +2-3天
  步骤:
    1. 分析混合检索的日志
    2. 调整 RRF 权重 (denseWeight 0.6 vs 0.4)
    3. 优化 tsvector 的分词器
    4. 添加更多测试用例
    5. 重新灰度验证
  预期: P@5 提升到 78-80%

选项 B: 启用 ParadeDB (可选)
  时间: +3-5天
  步骤:
    1. 启动 ParadeDB 集成分支
    2. 并行运行两套检索
    3. 对比质量差异
    4. 如果 ParadeDB P@5 ≥82%，决定是否升级
  预期: P@5 达到 82%+

选项 C: 部分降级 (应急)
  立即生效，用时 5 分钟
  步骤:
    1. 关闭 ParadeDB / 全文检索
    2. 只保留向量检索 + query expansion
    3. 预期: P@5 回到 70% (略高于原来 65%)
  可用时间: 直到找到根本原因
```

### P1.2 智能置信度与拒答

#### 验收标准
| 指标 | 绿灯 ✓ | 黄灯 ⚠️ | 红灯 ✗ |
|-----|--------|--------|--------|
| 幻觉率 (人工评测) | <15% | 15-20% | >20% |
| 拒答精准度 | >75% | 60-75% | <60% |
| 召回率 (非拒答) | >80% | 70-80% | <70% |
| 用户满意度 | >4.0/5 | 3.5-4.0 | <3.5 |

#### 触发回滚的条件
```
立即回滚 (红灯):
□ 幻觉率 > 20% (反而变差)
□ 拒答精准度 < 60% (错误拒答太多)
□ 用户投诉增加 >30% (影响体验)

不回滚但进入优化 (黄灯):
□ 幻觉率 15-20% (略低于目标 15%)
□ 需要调整置信度阈值
□ 需要增加标注数据

保持运行 (绿灯):
□ 幻觉率 < 15%
□ 拒答精准度 > 75%
□ 用户反馈积极
```

#### 快速回滚步骤

```
步骤 1: 关闭置信度功能 (1分钟)
  □ SET enableConfidenceScoring=false
  □ 所有查询返回"无置信度限制"的回答
  □ 幻觉率回到原来的 25% (预期)

步骤 2: 验证状态 (1分钟)
  □ 手动测试几个问题
  □ 确认没有拒答消息

步骤 3: 启动调参 (事后)
  □ 分析失败的 case
  □ 调整置信度阈值 (0.6 → 0.65 / 0.55)
  □ 增加标注数据 (200+ → 500+)
  □ 重新训练权重系数
```

### P1.3 Embedding 缓存

#### 验收标准
| 指标 | 绿灯 ✓ | 黄灯 ⚠️ | 红灯 ✗ |
|-----|--------|--------|--------|
| 缓存命中率 | >35% | 25-35% | <25% |
| 成本节省率 | >40% | 30-40% | <30% |
| 数据一致性 | 100% | 99-99.9% | <99% |
| 缓存延迟 | <10ms | 10-50ms | >50ms |

#### 触发回滚的条件
```
立即回滚 (红灯):
□ 缓存一致性 < 99% (返回错误向量)
□ 成本反而增加 (缓存管理开销 > 收益)
□ 用户投诉"答案变差" (因为缓存的陈旧向量)

不回滚但进入优化 (黄灯):
□ 命中率 25-35% (略低于预期 35%)
□ 需要调整缓存策略 (TTL / 容量)

保持运行 (绿灯):
□ 命中率 > 35%
□ 成本节省 > 40%
□ 数据一致性 = 100%
```

#### 快速回滚步骤

```
步骤 1: 禁用缓存 (1分钟)
  □ SET enableEmbeddingCache=false
  □ 所有 embedding 调用直接走 API

步骤 2: 清空缓存 (2分钟)
  □ Redis: FLUSHALL (生产要谨慎，可以按 key 删除)
  □ 确认回到基准性能

步骤 3: 启动调查 (事后)
  □ 检查缓存一致性问题根源
  □ 可能的原因:
    - TTL 太短，文档更新后缓存未刷新
    - 相同内容的多个 embedding (应该合并)
    - 缓存 key 生成逻辑错误
  □ 修复后重新启用
```

### P1.4 数据库连接池优化

#### 验收标准
| 指标 | 绿灯 ✓ | 黄灯 ⚠️ | 红灯 ✗ |
|-----|--------|--------|--------|
| 连接池利用率 | 40-60% | 60-80% | >80% |
| 查询响应时间 | <100ms | 100-200ms | >200ms |
| 连接异常 | <0.01% | 0.01-0.1% | >0.1% |
| QPS 容量 | 500+ | 400-500 | <400 |

#### 触发回滚的条件
```
立即回滚 (红灯):
□ 连接异常 > 0.1% (系统不稳定)
□ 查询响应 > 200ms (明显恶化)
□ 连接池堵塞告警 (无连接可用)

可以调参不回滚 (黄灯):
□ 利用率 60-80% (需要扩容或优化)
□ 响应时间 100-200ms (接受范围)

保持运行 (绿灯):
□ 一切指标正常
```

#### 快速回滚步骤

```
步骤 1: 恢复旧连接配置 (1分钟)
  □ DATABASE_URL: pgbouncer=false (禁用连接池)
  □ 重启应用

步骤 2: 验证状态 (2分钟)
  □ 查询响应时间恢复到之前的 150-200ms
  □ 监控稳定

步骤 3: 分析问题 (事后)
  □ 常见原因:
    - 连接泄漏 (forgot to close)
    - 连接超时设置不当
    - 某个查询导致连接被长期占用
  □ 修复根本原因后重试
```

---

## 2. 灰度策略与金丝雀发布

### 分阶段灰度计划

```
第一阶段: 内部测试 (Day 1-3)
├─ 覆盖范围: 开发/测试团队
├─ 流量比例: N/A (本地或测试环境)
├─ 验收标准: 所有 case 通过
└─ 失败处理: 修复后重新测试

第二阶段: Canary (Day 4-6)
├─ 覆盖范围: 1-2 个 beta 用户
├─ 流量比例: 1% 的生产流量
├─ 指标监控: 每 1 小时 check 一次
├─ 验收标准: 24h 内无异常
└─ 失败处理: 立即灰度回滚

第三阶段: 早期采用者 (Day 7-10)
├─ 覆盖范围: 5-10% 的活跃用户
├─ 流量比例: 10% 的生产流量
├─ 指标监控: 每 4 小时 check 一次
├─ 验收标准: 关键指标符合预期
└─ 失败处理: 灰度回滚到 1%

第四阶段: 大规模 (Day 11+)
├─ 覆盖范围: 50% → 100%
├─ 流量比例: 50% → 100%
├─ 指标监控: 每 24 小时 check 一次
├─ 验收标准: 所有指标符合预期
└─ 失败处理: 紧急回滚到 50%
```

### 自动告警规则

```yaml
# 触发自动回滚的告警规则

alerts:
  - name: P@5_degradation
    condition: |
      (current_p5 < (baseline_p5 - 0.05)) AND
      (time_in_state > 30 minutes)
    action: immediate_rollback
    severity: critical

  - name: latency_spike
    condition: |
      (p50_latency > 300ms) OR
      (p99_latency > 2000ms)
    action: immediate_rollback
    severity: critical

  - name: error_rate_high
    condition: |
      (error_rate > 1%) OR
      (exception_count > 100/hour)
    action: immediate_rollback
    severity: critical

  - name: cache_inconsistency
    condition: |
      (cache_hit_verification < 99%) OR
      (stale_data_detected > 0.1%)
    action: immediate_rollback
    severity: critical

  - name: db_connection_exhausted
    condition: |
      (available_connections < pool_size * 0.1) OR
      (connection_wait_time > 5000ms)
    action: gradual_rollback
    severity: high

  - name: cost_overrun
    condition: |
      (api_cost_today > budget_daily * 1.2) AND
      (cost_per_chunk > baseline * 1.5)
    action: warning + manual_review
    severity: medium
```

---

## 3. 事后分析与改进流程

### 回滚后的 5R 分析

```
Right People (正确的人):
├─ 事故负责人: 发起变更的工程师
├─ 技术评审: 系统架构师
├─ 项目经理: 记录对后续计划的影响
└─ 运维: 执行回滚与恢复

Right Time (及时的分析):
├─ 立即 (0-1h): 稳定系统，记录现象
├─ 事后 (1-24h): 根本原因分析
├─ 改进 (1-3 天): 修复并重新验证

Right Process (正确的流程):
├─ 检查清单: 验收标准是否遗漏
├─ 监控缺陷: 为什么没有提前发现
├─ 测试覆盖: 为什么测试没发现
├─ 灰度策略: 为什么灰度范围不够

Right Root Cause (正确的根本原因):
├─ 技术原因: 代码 bug、配置错误
├─ 流程原因: 测试不充分、灰度太急
├─ 假设原因: 性能模型错误、依赖库版本问题

Right Prevention (正确的预防):
├─ 代码修复: 修复发现的 bug
├─ 流程改进: 增加测试用例、提高灰度标准
├─ 监控增强: 添加更多告警规则
├─ 文档更新: 记录教训，防止重复
```

### 回滚事后报告模板

```markdown
# Phase 1.X 回滚事后报告

## 事件概况
- 变更时间: YYYY-MM-DD HH:MM
- 回滚时间: YYYY-MM-DD HH:MM
- 持续时间: X 小时 Y 分钟
- 影响范围: X% 用户，Y 个请求

## 根本原因
### 技术原因
- ...

### 流程原因
- ...

### 其他原因
- ...

## 改进措施
- [ ] 代码修复 (完成日期)
- [ ] 测试用例 (完成日期)
- [ ] 监控增强 (完成日期)
- [ ] 文档更新 (完成日期)

## 下次尝试计划
- 预计重新发布: YYYY-MM-DD
- 预期改进: ...
```

---

## 4. 修正后的 Checklist 格式

每个任务都添加以下字段:

```markdown
## P1.1 多路召回与精排

### 验收标准 (绿灯)
- [ ] P@5 ≥ 80%
- [ ] 查询延迟 < 200ms
- [ ] 错误率 < 0.1%

### 黄灯条件 (继续优化)
- [ ] P@5 在 75-80% 之间
- [ ] 采取行动: 调整 RRF 权重，优化 tsvector
- [ ] 预期时间: 2-3 天

### 红灯条件 (立即回滚)
- [ ] P@5 < 75%
- [ ] 查询延迟 > 300ms
- [ ] 错误率 > 1%
- [ ] **触发立即回滚 (5分钟内)**

### 回滚步骤
1. 执行: useHybridRetrieval=false
2. 验证: P@5 回到 65%
3. 通知: #incident 频道
4. 分析: 收集日志，编写事后报告

### 灰度计划
- Day 1-3: 内部测试 (100%)
- Day 4-6: Canary (1% 用户)
- Day 7-10: 早期采用 (10% 用户)
- Day 11+: 全量 (100% 用户)

### 自动告警
- critical: P@5 下跌 >5% → 自动回滚
- critical: 延迟 >300ms → 自动回滚
- high: 连接池满 → 手动回滚
```

---

## 总结

**修正前**: "目标是达到 P@5 80%，但没说失败怎么办"
**修正后**: "绿灯 80%, 黄灯 75-80% 继续优化, 红灯 <75% 立即回滚，5分钟内完成"

这样的精细化管理能确保:
✅ 有明确的失败条件与处理预案
✅ 快速发现问题并恢复
✅ 事后能找到根本原因
✅ 形成持续改进的闭环
