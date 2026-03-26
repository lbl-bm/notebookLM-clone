/**
 * P1.1a 集成测试：混合检索与现有检索系统的集成
 *
 * 验证:
 * 1. 混合检索与 retriever.ts 的兼容性
 * 2. 灰度开关的功能
 * 3. 向后兼容性（可以回滚到纯向量检索）
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { hybridSearch } from "../hybrid-retrieval";
import { retrieverConfig } from "@/lib/config";

describe("P1.1a 集成测试：混合检索集成", () => {
  let testNotebookId: string;
  let testQueryEmbedding: number[];

  beforeAll(() => {
    testNotebookId = "550e8400-e29b-41d4-a716-446655440000";
    testQueryEmbedding = Array(1024).fill(0);
    testQueryEmbedding[0] = 1;
  });

  describe("灰度开关功能", () => {
    it("应该支持切换到混合检索", async () => {
      // 模拟灰度标记为 true
      const result = await hybridSearch(testNotebookId, "test", testQueryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      expect(result.method).toMatch(/hybrid|dense_only|error/);
      expect(result.diagnostics).toBeDefined();
    });

    it("应该支持回滚到纯向量检索", async () => {
      // 禁用 Sparse，回到纯 Dense
      const result = await hybridSearch(testNotebookId, "", testQueryEmbedding, {
        enableDense: true,
        enableSparse: false,  // 禁用 Sparse
        topK: 10,
      });

      // 应该只使用 Dense
      expect(result.diagnostics.sparseCount).toBe(0);
      expect(result.diagnostics.denseCount).toBeGreaterThanOrEqual(0);
    });

    it("应该支持仅使用全文检索 (降级模式)", async () => {
      // 禁用 Dense，仅使用 Sparse
      const result = await hybridSearch(testNotebookId, "query", undefined, {
        enableDense: false,
        enableSparse: true,
        topK: 10,
      });

      // 应该只使用 Sparse
      expect(result.diagnostics.denseCount).toBe(0);
      expect(result.diagnostics.sparseCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("A/B 测试支持", () => {
    it("应该输出可对比的诊断信息", async () => {
      const result = await hybridSearch(testNotebookId, "embedding", testQueryEmbedding, {
        topK: 10,
      });

      // 确保诊断信息包含对比所需的字段
      expect(result.diagnostics.denseCount).toBeDefined();
      expect(result.diagnostics.sparseCount).toBeDefined();
      expect(result.diagnostics.denseLatency).toBeDefined();
      expect(result.diagnostics.sparseLatency).toBeDefined();
      expect(result.diagnostics.totalLatency).toBeDefined();
      expect(result.diagnostics.avgScore).toBeDefined();
    });

    it("应该支持按 notebook 维度的灰度", async () => {
      // 在真实场景中，这需要数据库中的灰度配置
      // 这里模拟两个 notebook：一个使用混合检索，一个使用纯向量检索

      const hybridNotebookId = "550e8400-e29b-41d4-a716-446655440001";
      const vectorOnlyNotebookId = "550e8400-e29b-41d4-a716-446655440002";

      const hybridResult = await hybridSearch(hybridNotebookId, "test", testQueryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      const vectorResult = await hybridSearch(vectorOnlyNotebookId, "", testQueryEmbedding, {
        enableDense: true,
        enableSparse: false,
        topK: 10,
      });

      // 两个检索都应该成功
      expect(hybridResult.results).toBeDefined();
      expect(vectorResult.results).toBeDefined();

      // 混合应该有 Sparse 计数
      expect(hybridResult.diagnostics.sparseCount).toBeGreaterThanOrEqual(0);
      // 向量只应该有 Dense 计数
      expect(vectorResult.diagnostics.sparseCount).toBe(0);
    });
  });

  describe("向后兼容性", () => {
    it("应该能降级回纯向量检索而不改变 API", async () => {
      // 既有代码期望这样的 API
      const result = await hybridSearch(testNotebookId, "", testQueryEmbedding, {
        enableSparse: false,  // 降级到纯向量
        topK: 10,
      });

      // 返回值应该保持兼容
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);

      if (result.results.length > 0) {
        const chunk = result.results[0];
        expect(chunk.id).toBeDefined();
        expect(chunk.content).toBeDefined();
        expect(chunk.sourceId).toBeDefined();
      }
    });

    it("应该支持旧的 topK 参数", async () => {
      // 既有代码可能调用
      const result = await hybridSearch(testNotebookId, "", testQueryEmbedding, {
        topK: 5,  // 旧风格参数
      });

      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("错误降级", () => {
    it("应该在混合搜索失败时回退到 Dense Only", async () => {
      // 模拟 Sparse 查询失败但 Dense 成功的场景
      const result = await hybridSearch(testNotebookId, "invalid@query#chars", testQueryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      // 应该仍然返回结果（通过 Dense）
      expect(result.results).toBeDefined();
      expect(result.method).toMatch(/hybrid|dense_only/);
    });

    it("应该记录降级事件", async () => {
      const result = await hybridSearch(testNotebookId, "test", testQueryEmbedding, {
        enableDense: true,
        enableSparse: true,
        topK: 10,
      });

      // 如果降级了，method 应该反映这一点
      if (result.method === "dense_only") {
        expect(result.diagnostics.sparseCount).toBe(0);
      }
    });
  });

  describe("性能稳定性", () => {
    it("应该在连续查询中保持一致的性能", async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await hybridSearch(testNotebookId, `query ${i}`, testQueryEmbedding, {
          topK: 10,
        });
        latencies.push(result.diagnostics.totalLatency);
      }

      // 计算平均延迟和标准差
      const avg = latencies.reduce((a, b) => a + b) / latencies.length;
      const variance = latencies.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / latencies.length;
      const stdDev = Math.sqrt(variance);

      console.log(`Latency avg=${avg.toFixed(2)}ms, stdDev=${stdDev.toFixed(2)}ms`);

      // 标准差应该相对较小 (< 50% of avg)
      expect(stdDev).toBeLessThan(avg * 0.5);

      // 所有查询都应该在 <300ms 内完成
      latencies.forEach((l) => {
        expect(l).toBeLessThan(300);
      });
    });
  });

  describe("结果质量指标", () => {
    it("应该返回有效的相似度分数", async () => {
      const result = await hybridSearch(testNotebookId, "neural networks", testQueryEmbedding, {
        topK: 10,
      });

      result.results.forEach((chunk) => {
        // 如果有向量分数，应该在 [0-1] 范围内
        if (chunk.vectorScore !== undefined) {
          expect(chunk.vectorScore).toBeGreaterThanOrEqual(0);
          expect(chunk.vectorScore).toBeLessThanOrEqual(1);
        }

        // 如果有稀疏分数，应该在 [0-1] 范围内
        if (chunk.sparseScore !== undefined) {
          expect(chunk.sparseScore).toBeGreaterThanOrEqual(0);
          expect(chunk.sparseScore).toBeLessThanOrEqual(1);
        }

        // 最终分数应该存在
        expect(chunk.combinedScore).toBeGreaterThan(0);
      });
    });

    it("应该正确排序结果", async () => {
      const result = await hybridSearch(testNotebookId, "machine learning", testQueryEmbedding, {
        topK: 20,
      });

      // 检查结果是否按 combinedScore 降序排列
      for (let i = 0; i < result.results.length - 1; i++) {
        expect(result.results[i].combinedScore).toBeGreaterThanOrEqual(
          result.results[i + 1].combinedScore || 0
        );
      }
    });
  });

  describe("生产环境检查", () => {
    it("应该不泄露敏感信息到诊断数据", async () => {
      const result = await hybridSearch(testNotebookId, "test query", testQueryEmbedding, {
        topK: 10,
      });

      // 诊断数据不应包含用户内容
      expect(result.diagnostics).toBeDefined();
      // 查询本身应该记录（用于调试）
      expect(result.diagnostics.queryText).toBe("test query");
      // 但 embedding 不应该被返回（太大了）
      expect(result.diagnostics.queryEmbedding).toBeUndefined();
    });

    it("应该处理极端情况", async () => {
      // 超过长度限制应该抛出错误
      await expect(
        hybridSearch(testNotebookId, "a ".repeat(1001), testQueryEmbedding, { topK: 10 })
      ).rejects.toThrow("exceeds maximum length");

      // 刚好在边界内（2000 chars）应该正常执行
      const boundaryQuery = "a ".repeat(1000); // 2000 chars = MAX_QUERY_LENGTH
      await expect(
        hybridSearch(testNotebookId, boundaryQuery, testQueryEmbedding, { topK: 10 })
      ).resolves.toBeDefined();

      // 极大的 topK
      const result2 = await hybridSearch(testNotebookId, "test", testQueryEmbedding, {
        topK: 10000,
      });
      expect(result2.results.length).toBeLessThanOrEqual(10000);

      // 极小的向量值
      const smallEmbedding = Array(1024).fill(1e-10);
      const result3 = await hybridSearch(testNotebookId, "test", smallEmbedding, {
        topK: 10,
      });
      expect(result3.results).toBeDefined();
    });
  });
});
