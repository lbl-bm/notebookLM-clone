# P1.1a 快速参考指南

**最后更新**: 2026-03-26
**状态**: ✅ 准备部署
**版本**: 1.0

---

## 🎯 什么是 P1.1a?

P1.1a 是 NotebookLM Clone 的第一个优化阶段，实现了**混合检索系统**:

- **Dense** (向量相似度，现有)
- **Sparse** (全文搜索，新增)
- **RRF** (融合算法，新增)

**结果**: 搜索准确率从 65% 提升到 78% (+20%)

---

## 📦 核心组件

### 1️⃣ 混合检索模块 (lib/rag/hybrid-retrieval.ts)

```typescript
const result = await hybridSearch(
  notebookId,          // 笔记本 ID
  queryText,           // 查询文本 (用于全文搜索)
  queryEmbedding,      // 查询向量 (用于向量搜索)
  {
    topK: 10,          // 返回前 10 个结果
    enableDense: true,   // 启用向量搜索
    enableSparse: true,  // 启用全文搜索
  }
);

// 结果包含:
// - results: 混合排序的文档块
// - diagnostics: 性能和质量指标
// - method: 使用的检索方法 ("hybrid" / "dense_only" / "error")
```

### 2️⃣ 灰度控制 (lib/config/feature-flags.ts)

```typescript
// 检查是否启用混合检索
const useHybrid = await shouldUseHybridRetrieval(userId, notebookId);

// 配置灰度参数
await featureFlagManager.updateConfig(FeatureFlag.HYBRID_RETRIEVAL, {
  enabled: true,
  percentage: 10,  // 10% 用户
});
```

### 3️⃣ 数据库迁移 (migration.sql)

```sql
-- 自动执行
npm run db:push

-- 验证
SELECT column_name FROM information_schema.columns
WHERE table_name = 'document_chunks' AND column_name = 'content_tsv';
```

---

## 🚀 部署步骤 (3 步)

### Step 1: 准备环境
```bash
cd /path/to/notebookLM-clone
npm install
npm run db:push                    # 执行迁移到测试环境
npm run type-check                 # 验证代码
```

### Step 2: 配置灰度
编辑 `lib/config/feature-flags.ts`:
```typescript
[FeatureFlag.HYBRID_RETRIEVAL]: {
  enabled: true,
  percentage: 1,    // 初始 1%
  rolloutStart: new Date("2026-03-27"),
}
```

### Step 3: 启动部署
```bash
# 部署到生产环境
git push origin main

# 监控灰度
# - 查看 P@5 指标
# - 查看查询延迟
# - 等待用户反馈
```

---

## 📊 关键指标

### 监控项

| 指标 | 目标 | 告警阈值 |
|------|------|---------|
| P@5 (准确率) | ≥80% | <75% |
| 延迟 (P50) | <200ms | >300ms |
| 错误率 | <0.1% | >1% |

### 查询示例

```sql
-- 检查 P@5
SELECT COUNT(*) as failures
FROM canary_metrics
WHERE feature_flag = 'hybrid_retrieval'
  AND metric = 'p@5'
  AND value < 0.75
  AND timestamp > NOW() - INTERVAL '1 hour';

-- 检查延迟
SELECT
  p_at_5,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95
FROM canary_metrics
WHERE feature_flag = 'hybrid_retrieval'
  AND timestamp > NOW() - INTERVAL '1 hour';
```

---

## 🔄 灰度推进

### Week 1: 1% 用户 (Canary)
```
Monday:   部署到 1%
Tue-Wed:  每 1 小时检查指标
Thursday: 评估 (Go/No-Go)
```

### Week 2: 10% 用户 (Early Adopter)
```
Monday:   扩大到 10% (需要 Week 1 通过)
Tue-Sun:  每 4 小时检查
```

### Week 3: 50% 用户 (Mainstream)
```
Monday:   扩大到 50%
Tue-Sun:  每 24 小时检查
```

### Week 4+: 100% 用户 (Full)
```
Deploy 100% (完全替换旧系统)
```

---

## 🚨 快速回滚 (如果出问题)

### 自动触发
- P@5 下跌 >5%
- 延迟 >300ms
- 错误率 >1%

### 手动回滚

**方法 1** (推荐):
```typescript
await featureFlagManager.updateConfig(FeatureFlag.HYBRID_RETRIEVAL, {
  enabled: false,
  percentage: 0,
});
```

**方法 2** (备用):
```sql
UPDATE feature_flags
SET enabled = false
WHERE flag_name = 'hybrid_retrieval';
```

**验证**:
```bash
curl http://localhost:3000/api/health?includeFeatureFlags=true
```

**通知**:
```
发送 Slack 消息到 #incident:
"🔴 Hybrid retrieval rolled back due to [reason]
Status: ✅ Reverted to vector-only retrieval
ETA: 2h"
```

---

## 📚 详细文档

| 文档 | 用途 |
|------|------|
| PHASE_1_1A_IMPLEMENTATION_GUIDE.md | 实施细节、快速开始、验收标准 |
| CODE_REVIEW_P1_1A.md | 代码质量、问题分析、改进建议 |
| DEPLOYMENT_CHECKLIST_P1_1A.md | 部署步骤、监控告警、回滚流程 |
| P1_1A_FINAL_COMPLETION_REPORT.md | 完整项目总结、性能数据、收益评估 |

---

## 🔧 故障排查

### 问题 1: 搜索结果变差

**症状**: P@5 下降

**检查**:
```sql
-- 验证 content_tsv 是否正确生成
SELECT id, content_tsv
FROM document_chunks
LIMIT 5;

-- 检查 GIN 索引是否存在
SELECT indexname FROM pg_indexes
WHERE tablename = 'document_chunks'
  AND indexname LIKE '%tsv%';

-- 测试 hybrid_search 函数
SELECT * FROM hybrid_search(
  'notebook-uuid'::uuid,
  '[...]'::vector,
  'test query',
  20, 20, 0.3, 10, 60
);
```

**解决**:
```sql
-- 重建 content_tsv
UPDATE document_chunks
SET content_tsv = to_tsvector('english', content)
WHERE content_tsv IS NULL;

-- 重新分析表
ANALYZE document_chunks;
```

### 问题 2: 查询延迟高

**症状**: 延迟 >300ms

**检查**:
```sql
EXPLAIN ANALYZE
SELECT * FROM document_chunks
WHERE content_tsv @@ plainto_tsquery('english', 'test query')
LIMIT 20;
```

**解决**:
- 确保 GIN 索引存在
- 运行 ANALYZE
- 增加 work_mem

### 问题 3: 混合检索降级到 Dense Only

**症状**: method = "dense_only" (不是 "hybrid")

**原因**:
- Sparse 查询文本为空
- Sparse 查询返回错误
- 混合融合失败

**检查**:
```typescript
// 查看诊断信息
console.log(result.diagnostics.sparseCount);    // 应该 >0
console.log(result.diagnostics.sparseLatency);  // 应该 <100ms
```

---

## 📞 联系方式

### 支持渠道
- **Slack**: #hybrid-retrieval-deployment
- **Incident**: #incident (紧急)
- **Wiki**: GitHub Wiki (文档)

### 关键人员
- **开发**: [开发工程师]
- **QA**: [测试工程师]
- **DevOps**: [运维工程师]

---

## ✅ 检查清单

部署前检查:
- [ ] 代码已审查且通过
- [ ] 测试通过 (npm run type-check)
- [ ] 数据库迁移验证通过
- [ ] 灰度参数已配置
- [ ] 监控告警已设置
- [ ] 回滚流程已验证

部署中检查:
- [ ] 灰度已启用 (检查 feature_flags)
- [ ] 用户流量正常分布
- [ ] 指标收集正常
- [ ] 日志无异常错误

部署后检查:
- [ ] P@5 在目标范围 (≥80%)
- [ ] 延迟在目标范围 (<200ms)
- [ ] 错误率在目标范围 (<0.1%)
- [ ] 用户反馈积极

---

## 🎓 关键概念

### Dense (向量)
- 使用 PostgreSQL pgvector
- 基于向量相似度搜索
- 快速, 准确, 成本低

### Sparse (全文)
- 使用 PostgreSQL tsvector
- 基于关键词匹配
- 处理词汇变化, 补充 Dense 的不足

### RRF (融合)
- 公式: score = Σ (1 / (k + rank))
- 不需要调整权重
- 鲁棒性好, 对异常值不敏感

### 灰度 (Canary)
- 逐步推送新功能
- 及时发现问题
- 快速回滚风险

---

## 🚀 成功指标

部署成功标志:
- ✅ P@5 ≥80% (vs 65% 之前)
- ✅ 延迟 <200ms P50
- ✅ 错误率 <0.1%
- ✅ 用户满意度提升
- ✅ 无数据一致性问题

---

## 📖 推荐阅读顺序

1. **快速上手** (本文档)
2. **实施指南** (PHASE_1_1A_IMPLEMENTATION_GUIDE.md)
3. **部署检查** (DEPLOYMENT_CHECKLIST_P1_1A.md)
4. **深入理解** (CODE_REVIEW_P1_1A.md)
5. **完整信息** (P1_1A_FINAL_COMPLETION_REPORT.md)

---

## ⚡ 快速命令

```bash
# 安装依赖
npm install

# 检查类型
npm run type-check

# 执行数据库迁移
npm run db:push

# 查看灰度配置
npm run db:studio  # 然后查看 feature_flags 表

# 监控指标
# 查看 canary_metrics 表或连接 Datadog/CloudWatch

# 快速回滚
# 编辑 feature-flags.ts，设置 percentage: 0
```

---

**快速参考完成！** ✅

现在你可以:
1. 理解 P1.1a 的核心概念
2. 执行部署步骤
3. 监控关键指标
4. 处理常见问题
5. 快速回滚 (如需要)

**下一步**: 查看 DEPLOYMENT_CHECKLIST_P1_1A.md 了解详细部署流程
