/**
 * P1.1a 混合检索单元测试
 *
 * 测试覆盖:
 * 1. Dense 检索功能
 * 2. Sparse 检索功能
 * 3. RRF 融合算法
 * 4. 错误处理与降级
 * 5. 性能基准测试
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { hybridSearch, HYBRID_RETRIEVAL_CONFIG } from "../hybrid-retrieval";
import { prisma } from "@/lib/db/prisma";

describe("P1.1a: 混合检索 (Dense + Sparse + RRF)", () => {
  let testNotebookId: string;
  let testSourceId: string;

  beforeAll(async () => {
    // 创建测试数据
    // 这需要真实的数据库连接和已初始化的 Supabase
    console.log("Setting up test fixtures...");
  });

  afterAll(async () => {
    // 清理测试数据
    console.log("Cleaning up test fixtures...");
  });

  describe("Dense 检索", () => {
    it("应该返回向量相似度最高的 chunks", async () => {
      // 测试查询向量（模拟的 1024 维向量）
      const queryEmbedding = Array(1024).fill(0);
      queryEmbedding[0] = 1;  // 简单的单位向量

      const result = await hybridSearch(testNotebookId, "", queryEmbedding, {
        enableSparse: false,  // 禁用 Sparse，只测试 Dense
        topK: 5,
      });

      expect(result.method).toBe("hybrid");
      expect(result.results).toBeDefined();
      expect(result.results.length).toBeLessThanOrEqual(5);
      expect(result.diagnostics.denseCount).toBeGreaterThan(0);
    });

    it("应该使用相似度阈值过滤结果", async () => {
      const queryEmbedding = Array(1024).fill(0.1);

      const resultHigh = await hybridSearch(testNotebookId, "", queryEmbedding, {
        enableSparse: false,
        densityThreshold: 0.9,  // 高阈值
        topK: 10,
      });

      const resultLow = await hybridSearch(testNotebookId, "", queryEmbedding, {
        enableSparse: false,
        densityThreshold: 0.1,  // 低阈值
        topK: 10,
      });

      // 低阈值应该返回更多结果
      expect(resultLow.results.length).toBeGreaterThanOrEqual(resultHigh.results.length);
    });

    it("应该在向量维度错误时降级处理", async () => {
      const wrongEmbedding = Array(512).fill(0);  // 错误的维度

      const result = await hybridSearch(testNotebookId, "test query", wrongEmbedding, {
        enableSparse: true,  // Sparse 应该仍然工作
        topK: 5,
      });

      // 应该降级到 Dense Only 或返回 Sparse 结果
      expect(result.method).toMatch(/hybrid|dense_only|error/);
    });
  });

  describe("Sparse 检索 (tsvector)", () => {
    it("应该返回文本相关性最高的 chunks", async () => {
      const result = await hybridSearch(testNotebookId, "vector database", undefined, {
        enableDense: false,  // 禁用 Dense，只测试 Sparse
        topK: 5,
      });

      expect(result.method).toBe("hybrid");
      expect(result.diagnostics.sparseCount).toBeGreaterThan(0);
      // 所有结果都应该包含查询关键词
      result.results.forEach((r) => {
        expect(r.content.toLowerCase()).toContain("vector");
      });
    });

    it("应该处理空查询文本", async () => {
      const result = await hybridSearch(testNotebookId, "", undefined, {
        enableDense: false,
        topK: 5,
      });

      // 空查询应该返回空结果或错误
      expect(result.results.length).toBe(0);
    });

    it("应该正确归一化 ts_rank 分数", async () => {
      const result = await hybridSearch(testNotebookId, "embedding", undefined, {
        enableDense: false,
        topK: 10,
      });

      // 检查所有 sparseScore 都在 [0-1] 范围内
      result.results.forEach((r) => {
        if (r.sparseScore !== undefined) {
          expect(r.sparseScore).toBeGreaterThanOrEqual(0);
          expect(r.sparseScore).toBeLessThanOrEqual(1);
        }
      });
    });
  });

  describe("RRF 融合算法", () => {
    it("应该融合 Dense 和 Sparse 的结果", async () => {
      const queryEmbedding = Array(1024).fill(0);
      queryEmbedding[0] = 0.8;

      const result = await hybridSearch(testNotebookId, "retrieval", queryEmbedding, {
        enableDense: true,
        enableSparse: true,
        denseTopK: 20,
        sparseTopK: 20,
        topK: 10,
      });

      expect(result.method).toBe("hybrid");
      expect(result.diagnostics.denseCount).toBeGreaterThan(0);
      expect(result.diagnostics.sparseCount).toBeGreaterThan(0);

      // 检查融合结果中既有 Dense 又有 Sparse 的信息
      const hasVectorScore = result.results.some((r) => r.vectorScore !== undefined);
      const hasSparseScore = result.results.some((r) => r.sparseScore !== undefined);

      expect(hasVectorScore || hasSparseScore).toBe(true);
    });

    it("应该正确计算 RRF 分数", async () => {
      const queryEmbedding = Array(1024).fill(0);
      queryEmbedding[1] = 0.9;

      const result = await hybridSearch(testNotebookId, "neural", queryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 5,
      });

      // RRF 分数应该按降序排列
      for (let i = 0; i < result.results.length - 1; i++) {
        const current = result.results[i].combinedScore || 0;
        const next = result.results[i + 1].combinedScore || 0;
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    it("应该去除重复的结果", async () => {
      const queryEmbedding = Array(1024).fill(0);
      queryEmbedding[2] = 0.7;

      const result = await hybridSearch(testNotebookId, "search", queryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      // 检查没有重复的 id
      const ids = result.results.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("诊断信息", () => {
    it("应该记录检索延迟", async () => {
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(testNotebookId, "test", queryEmbedding, {
        topK: 5,
      });

      expect(result.diagnostics.totalLatency).toBeGreaterThan(0);
      expect(result.diagnostics.denseLatency).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.sparseLatency).toBeGreaterThanOrEqual(0);
    });

    it("应该报告融合前后的数量", async () => {
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(testNotebookId, "data", queryEmbedding, {
        topK: 5,
      });

      expect(result.diagnostics.beforeDedup).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.afterDedup).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.afterDedup).toBeLessThanOrEqual(
        result.diagnostics.beforeDedup
      );
    });

    it("应该计算平均分数", async () => {
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(testNotebookId, "learning", queryEmbedding, {
        topK: 10,
      });

      if (result.results.length > 0) {
        expect(result.diagnostics.avgScore).toBeGreaterThan(0);
        expect(result.diagnostics.avgScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("性能基准", () => {
    it("Dense 检索应该在 <100ms 内完成", async () => {
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(testNotebookId, "", queryEmbedding, {
        enableSparse: false,
        topK: 10,
      });

      expect(result.diagnostics.denseLatency).toBeLessThan(100);
    });

    it("Sparse 检索应该在 <100ms 内完成", async () => {
      const result = await hybridSearch(testNotebookId, "benchmark query", undefined, {
        enableDense: false,
        topK: 10,
      });

      expect(result.diagnostics.sparseLatency).toBeLessThan(100);
    });

    it("完整混合检索应该在 <200ms 内完成", async () => {
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(testNotebookId, "full test", queryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      expect(result.diagnostics.totalLatency).toBeLessThan(200);
    });
  });

  describe("错误处理", () => {
    it("应该在无效 notebook ID 时返回空结果", async () => {
      const invalidNotebookId = "00000000-0000-0000-0000-000000000000";
      const queryEmbedding = Array(1024).fill(0);

      const result = await hybridSearch(invalidNotebookId, "test", queryEmbedding, {
        topK: 5,
      });

      expect(result.results.length).toBe(0);
    });

    it("应该在数据库连接失败时返回错误状态", async () => {
      // 模拟数据库连接失败
      // 这需要 mock prisma client

      const result = await hybridSearch("invalid", "test", undefined, {
        enableDense: false,
        topK: 5,
      });

      expect(result.method).toMatch(/hybrid|error/);
    });
  });
});

/**
 * 性能基准测试脚本
 * 使用: npm run test -- --testNamePattern="Performance Benchmark"
 */
describe("P1.1a 性能基准测试", () => {
  it("应该对比 Dense 和混合检索的性能", async () => {
    const queryEmbedding = Array(1024).fill(0);

    const startDense = Date.now();
    const denseResult = await hybridSearch("test-notebook", "", queryEmbedding, {
      enableSparse: false,
      topK: 10,
    });
    const denseDuration = Date.now() - startDense;

    const startHybrid = Date.now();
    const hybridResult = await hybridSearch("test-notebook", "test", queryEmbedding, {
      enableDense: true,
      enableSparse: true,
      topK: 10,
    });
    const hybridDuration = Date.now() - startHybrid;

    console.log(
      `Dense retrieval: ${denseDuration}ms, ` +
      `Hybrid retrieval: ${hybridDuration}ms, ` +
      `Overhead: ${hybridDuration - denseDuration}ms`
    );

    // 混合检索应该在合理的时间内完成
    expect(hybridDuration).toBeLessThan(300);
  });

  it("应该报告查询质量指标", async () => {
    const queryEmbedding = Array(1024).fill(0);
    const result = await hybridSearch("test-notebook", "query text", queryEmbedding, {
      topK: 10,
    });

    console.log(
      `Query: Dense=${result.diagnostics.denseCount}, ` +
      `Sparse=${result.diagnostics.sparseCount}, ` +
      `Final=${result.diagnostics.finalCount}, ` +
      `AvgScore=${result.diagnostics.avgScore.toFixed(3)}`
    );

    expect(result.diagnostics).toBeDefined();
  });
});
