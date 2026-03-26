/**
 * P1.1a: 改进的 tsvector + RRF 混合检索模块
 *
 * 目标：实现 Dense (向量) + Sparse (全文检索) + RRF 融合
 *
 * 技术方案：
 * 1. Dense: pgvector cosine similarity (现有)
 * 2. Sparse: PostgreSQL tsvector + ts_rank (改进)
 * 3. Fusion: RRF (Reciprocal Rank Fusion) 算法融合两路检索结果
 *
 * 性能目标：
 * - P@5: 75-80% (vs 现在 65%)
 * - 查询延迟: <200ms
 * - 误差率: <0.1%
 */

import { prisma } from "@/lib/db/prisma";
import { EMBEDDING_DIM } from "@/lib/config";
import { logger } from "@/lib/utils/logger";

/**
 * 混合检索配置
 */
export const HYBRID_RETRIEVAL_CONFIG = {
  // RRF 融合权重
  denseWeight: 1.0,      // Dense 路由权重
  sparseWeight: 0.8,     // Sparse 路由权重 (略低，因为 tsvector 质量略低于 BM25)

  // 各路召回的 topK
  denseTopK: 20,         // Dense 检索返回 20 个候选
  sparseTopK: 20,        // Sparse 检索返回 20 个候选

  // 最终返回数量
  finalTopK: 10,

  // 相似度阈值
  densityThreshold: 0.3,
  sparseThreshold: 0.1,  // tsvector 的分数是相对的，阈值设置较低

  // RRF 参数
  k: 60,  // RRF 的 k 参数，决定排名折扣程度
};

/**
 * 单条检索结果
 */
interface RetrievalResult {
  id: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  metadata: any;
  vectorScore?: number;    // Dense 相似度分数 [0-1]
  sparseScore?: number;    // Sparse ts_rank 分数 [0-1]
  combinedScore?: number;  // RRF 融合后的分数
  denseRank?: number;      // Dense 路由中的排名
  sparseRank?: number;     // Sparse 路由中的排名
}

/**
 * 混合检索诊断信息
 */
interface HybridRetrievalDiagnostics {
  queryText: string;
  queryEmbedding?: number[];

  // Dense 检索
  denseCount: number;      // Dense 返回的候选数
  denseLatency: number;    // Dense 查询耗时 (ms)

  // Sparse 检索
  sparseCount: number;     // Sparse 返回的候选数
  sparseLatency: number;   // Sparse 查询耗时 (ms)

  // 融合结果
  beforeDedup: number;     // 融合前的候选数
  afterDedup: number;      // 去重后的候选数
  finalCount: number;      // 最终返回的候选数

  // 性能指标
  totalLatency: number;    // 总耗时 (ms)
  avgScore: number;        // 平均分数
}

/**
 * 完整的混合检索结果
 */
export interface HybridRetrievalResponse {
  results: RetrievalResult[];
  diagnostics: HybridRetrievalDiagnostics;
  method: "hybrid" | "dense_only" | "sparse_only" | "error";
}

/**
 * Dense 检索：向量相似度搜索
 */
async function denseSearch(
  notebookId: string,
  queryEmbedding: number[],
  topK: number = HYBRID_RETRIEVAL_CONFIG.denseTopK,
  threshold: number = HYBRID_RETRIEVAL_CONFIG.densityThreshold,
): Promise<{ results: RetrievalResult[]; latency: number }> {
  const startTime = Date.now();

  try {
    // 验证向量维度
    if (queryEmbedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Query embedding 维度错误: 期望 ${EMBEDDING_DIM}, 实际 ${queryEmbedding.length}`
      );
    }

    // 验证向量值有效性
    for (let i = 0; i < queryEmbedding.length; i++) {
      const val = queryEmbedding[i];
      if (!Number.isFinite(val)) {
        throw new Error(
          `Query embedding contains invalid value at index ${i}: ${val} (must be finite number)`
        );
      }
    }

    // 调用数据库 RPC 函数
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        source_id: string;
        chunk_index: number;
        content: string;
        metadata: any;
        similarity: number;
      }>
    >`
      SELECT *
      FROM match_document_chunks(
        ${notebookId}::uuid,
        ${JSON.stringify(queryEmbedding)}::vector,
        ${topK}::int,
        ${threshold}::float
      )
    `;

    const latency = Date.now() - startTime;

    // 转换为内部格式
    const formatted: RetrievalResult[] = results.map((r, idx) => ({
      id: r.id.toString(),
      sourceId: r.source_id.toString(),
      chunkIndex: r.chunk_index,
      content: r.content,
      metadata: r.metadata,
      vectorScore: r.similarity,
      denseRank: idx + 1,  // 从 1 开始的排名
    }));

    return { results: formatted, latency };
  } catch (error) {
    logger.error("Dense search error:", error);
    return { results: [], latency: Date.now() - startTime };
  }
}

/**
 * Sparse 检索：全文检索 (tsvector)
 *
 * 使用 PostgreSQL 的 ts_rank 函数计算文本相关性
 * 比 BM25 质量略低，但足以作为补充路由
 */
async function sparseSearch(
  notebookId: string,
  queryText: string,
  topK: number = HYBRID_RETRIEVAL_CONFIG.sparseTopK,
): Promise<{ results: RetrievalResult[]; latency: number }> {
  const startTime = Date.now();

  try {
    // 清理查询文本，删除前后空格
    // 注：plainto_tsquery 内部会自动做 stemming 和大小写标准化
    const cleanQuery = queryText.trim();
    if (!cleanQuery) {
      return { results: [], latency: Date.now() - startTime };
    }

    // 使用 plainto_tsquery 避免特殊字符问题
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        source_id: string;
        chunk_index: number;
        content: string;
        metadata: any;
        ts_rank: number;
      }>
    >`
      SELECT
        dc.id::text,
        dc.source_id::text,
        dc.chunk_index,
        dc.content,
        dc.metadata,
        ts_rank(dc.content_tsv, plainto_tsquery('simple', ${cleanQuery})) as ts_rank
      FROM document_chunks dc
      WHERE dc.notebook_id = ${notebookId}::uuid
        AND dc.content_tsv @@ plainto_tsquery('simple', ${cleanQuery})
      ORDER BY ts_rank DESC
      LIMIT ${topK}
    `;

    const latency = Date.now() - startTime;

    // 转换为内部格式，并归一化分数 [0-1]
    // 注：PostgreSQL ts_rank 的理论最大值约为 1.0，使用固定的上界而非动态最大值
    // 这确保了不同查询间的分数可比性，避免了 Sparse 权重过高的问题
    const TS_RANK_MAX = 1.0;
    const formatted: RetrievalResult[] = results.map((r, idx) => ({
      id: r.id,
      sourceId: r.source_id,
      chunkIndex: r.chunk_index,
      content: r.content,
      metadata: r.metadata,
      // 使用固定上界归一化，确保跨查询分数可比性
      sparseScore: Math.min(1.0, r.ts_rank / TS_RANK_MAX),
      sparseRank: idx + 1,  // 从 1 开始的排名
    }));

    return { results: formatted, latency };
  } catch (error) {
    logger.error("Sparse search error:", error);
    return { results: [], latency: Date.now() - startTime };
  }
}

/**
 * RRF (Reciprocal Rank Fusion) 融合两路检索结果
 *
 * 公式：score = Σ (1 / (k + rank_i))
 * 其中 k=60 是标准参数，rank_i 是第 i 路检索中的排名
 *
 * 优点：
 * - 无需调整权重即可融合不同的排序方式
 * - 对排名的相对位置敏感，而不是绝对分数
 * - 对离群值不敏感
 */
function rrfFusion(
  denseResults: RetrievalResult[],
  sparseResults: RetrievalResult[],
  k: number = HYBRID_RETRIEVAL_CONFIG.k,
): RetrievalResult[] {
  // 创建 id -> result 的映射，用于高效合并
  const resultMap = new Map<string, RetrievalResult>();

  // 处理 Dense 结果
  for (const result of denseResults) {
    if (result.denseRank) {
      const rrfScore = 1 / (k + result.denseRank);
      resultMap.set(result.id, {
        ...result,
        combinedScore: rrfScore,
      });
    }
  }

  // 处理 Sparse 结果并融合
  for (const result of sparseResults) {
    if (result.sparseRank) {
      const sparseRrfScore = 1 / (k + result.sparseRank);

      const existing = resultMap.get(result.id);
      if (existing && existing.combinedScore !== undefined) {
        // 两路都有：累加 RRF 分数，同时保留两个路由的原始分数
        existing.combinedScore += sparseRrfScore;
        existing.sparseScore = result.sparseScore;
        existing.sparseRank = result.sparseRank;
        // vectorScore 已存在，无需修改
      } else if (existing) {
        // 只在 Dense 中：添加 Sparse 信息
        existing.combinedScore = sparseRrfScore;
        existing.sparseScore = result.sparseScore;
        existing.sparseRank = result.sparseRank;
        // vectorScore 和 denseRank 已存在，无需修改
      } else {
        // 只在 Sparse 中：新建条目
        resultMap.set(result.id, {
          ...result,
          combinedScore: sparseRrfScore,
        });
      }
    }
  }

  // 按融合分数降序排列
  const fused = Array.from(resultMap.values());
  fused.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

  return fused;
}

/**
 * 主混合检索函数
 *
 * @param notebookId - 笔记本 ID
 * @param queryText - 查询文本 (用于 Sparse 路由)
 * @param queryEmbedding - 查询向量 (用于 Dense 路由)
 * @param options - 检索选项
 * @returns 混合检索结果，包含诊断信息
 *
 * @throws 抛出 Error 如果查询文本超过最大长度
 */
export async function hybridSearch(
  notebookId: string,
  queryText: string,
  queryEmbedding?: number[],
  options: {
    topK?: number;
    denseTopK?: number;
    sparseTopK?: number;
    densityThreshold?: number;
    sparseThreshold?: number;
    enableDense?: boolean;
    enableSparse?: boolean;
  } = {},
): Promise<HybridRetrievalResponse> {
  const startTime = Date.now();
  const MAX_QUERY_LENGTH = 2000;  // 防止资源耗尽

  // 验证输入
  if (queryText.length > MAX_QUERY_LENGTH) {
    throw new Error(
      `Query text exceeds maximum length of ${MAX_QUERY_LENGTH} characters (got ${queryText.length})`
    );
  }

  // 合并配置
  const topK = options.topK ?? HYBRID_RETRIEVAL_CONFIG.finalTopK;
  const denseTopK = options.denseTopK ?? HYBRID_RETRIEVAL_CONFIG.denseTopK;
  const sparseTopK = options.sparseTopK ?? HYBRID_RETRIEVAL_CONFIG.sparseTopK;
  const densityThreshold = options.densityThreshold ?? HYBRID_RETRIEVAL_CONFIG.densityThreshold;
  const enableDense = options.enableDense !== false && !!queryEmbedding;
  const enableSparse = options.enableSparse !== false;

  try {
    // 并行执行 Dense 和 Sparse 检索
    // 使用类型守卫确保 queryEmbedding 在需要时存在
    const densePromise = enableDense
      ? denseSearch(notebookId, queryEmbedding as number[], denseTopK, densityThreshold)
      : Promise.resolve({ results: [], latency: 0 });

    const sparsePromise = enableSparse
      ? sparseSearch(notebookId, queryText, sparseTopK)
      : Promise.resolve({ results: [], latency: 0 });

    const [denseResult, sparseResult] = await Promise.all([densePromise, sparsePromise]);

    // RRF 融合
    const beforeDedup = denseResult.results.length + sparseResult.results.length;
    const fused = rrfFusion(denseResult.results, sparseResult.results);

    // 去精确重复（按 id）
    const deduped = new Map<string, RetrievalResult>();
    for (const result of fused) {
      if (!deduped.has(result.id)) {
        deduped.set(result.id, result);
      }
    }

    // 取 topK
    const finalResults = Array.from(deduped.values()).slice(0, topK);
    const totalLatency = Date.now() - startTime;

    // 计算诊断信息
    // avgScore: 计算所有结果的平均 RRF 分数
    const scores = finalResults
      .map(r => r.combinedScore)
      .filter((score): score is number => score !== undefined);

    const avgScore =
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0;

    const diagnostics: HybridRetrievalDiagnostics = {
      queryText,
      denseCount: denseResult.results.length,
      denseLatency: denseResult.latency,
      sparseCount: sparseResult.results.length,
      sparseLatency: sparseResult.latency,
      beforeDedup,
      afterDedup: deduped.size,
      finalCount: finalResults.length,
      totalLatency,
      avgScore,
    };

    logger.info(
      `Hybrid search completed: dense=${denseResult.results.length}, ` +
      `sparse=${sparseResult.results.length}, final=${finalResults.length}, ` +
      `latency=${totalLatency}ms`
    );

    return {
      results: finalResults,
      diagnostics,
      method: "hybrid",
    };
  } catch (error) {
    logger.warn("Hybrid search failed, attempting to fall back to dense only", {
      notebookId,
      error: error instanceof Error ? error.message : String(error),
    });

    // 降级到 Dense Only
    if (queryEmbedding && enableDense) {
      try {
        const denseResult = await denseSearch(
          notebookId,
          queryEmbedding,
          topK,
          densityThreshold
        );

        // 只有当 Dense 有结果时才标记为 "dense_only"
        // 否则标记为 "error"
        const fallbackMethod = denseResult.results.length > 0 ? "dense_only" : "error";

        return {
          results: denseResult.results,
          diagnostics: {
            queryText,
            denseCount: denseResult.results.length,
            denseLatency: denseResult.latency,
            sparseCount: 0,
            sparseLatency: 0,
            beforeDedup: denseResult.results.length,
            afterDedup: denseResult.results.length,
            finalCount: denseResult.results.length,
            totalLatency: denseResult.latency,
            avgScore: 0,
          },
          method: fallbackMethod,
        };
      } catch (denseError) {
        logger.error("Dense fallback also failed", {
          notebookId,
          denseError: denseError instanceof Error ? denseError.message : String(denseError),
        });
      }
    }

    return {
      results: [],
      diagnostics: {
        queryText,
        denseCount: 0,
        denseLatency: 0,
        sparseCount: 0,
        sparseLatency: 0,
        beforeDedup: 0,
        afterDedup: 0,
        finalCount: 0,
        totalLatency: Date.now() - startTime,
        avgScore: 0,
      },
      method: "error",
    };
  }
}

/**
 * 导出公共接口
 * 注：HybridRetrievalResponse 和 HybridRetrievalDiagnostics 在上方已定义并导出
 */
