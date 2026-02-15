import { getEmbedding } from "@/lib/ai/zhipu";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { vectorStore, type ChunkMetadata } from "@/lib/db/vector-store";
import { EMBEDDING_DIM, ragStrategyConfig } from "@/lib/config";

export const RAG_CONFIG = {
  topK: 8,
  similarityThreshold: 0.3,
  maxContextTokens: 4000,
  useHybridSearch: true,
  vectorWeight: 0.7,
  ftsWeight: 0.3,
  mmrLambda: 0.7, // MMR 算法中相关性权重（0-1，越高越重视相关性）
};

/**
 * 检索类型
 */
export type RetrievalType = "vector" | "hybrid" | "fts";

/**
 * 检索得分详情
 */
export interface RetrievalScores {
  vectorScore?: number;
  ftsScore?: number;
  combinedScore?: number;
}

/**
 * ✅ P1-3: 使用类型安全的 ChunkMetadata
 */
export interface RetrievedChunk {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: "file" | "url";
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: ChunkMetadata; // 使用标准接口
  scores?: RetrievalScores;
}

/**
 * M1: 检索决策类型
 */
export type RetrievalDecision = "grounded" | "uncertain" | "no_evidence";

/**
 * M1: 证据统计
 */
export interface EvidenceStats {
  totalChunks: number;
  uniqueSources: number;
  avgSimilarity: number;
  maxSimilarity: number;
  aboveThreshold: number;
  /** 来源覆盖率：uniqueSources / totalSources (0-1) */
  coverage: number;
  /** 最高分与最低分的差 */
  scoreGap: number;
}

/**
 * M1: 多维度置信度
 */
export interface ConfidenceResult {
  score: number;
  level: "low" | "medium" | "high";
  components: {
    /** 基于相似度的分数 */
    similarity: number;
    /** 基于来源多样性的分数 */
    diversity: number;
    /** 基于证据覆盖的分数 */
    coverage: number;
  };
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  hasEvidence: boolean;
  retrievalMs: number;
  embeddingMs: number;
  queryEmbedding: number[];
  retrievalType?: RetrievalType;
  confidence?: number;
  confidenceLevel?: "low" | "medium" | "high";
  /** M1: 多维度置信度 */
  confidenceDetail?: ConfidenceResult;
  /** M1: 检索决策 */
  retrievalDecision?: RetrievalDecision;
  /** M1: 证据统计 */
  evidenceStats?: EvidenceStats;
}

export async function retrieveChunks(params: {
  notebookId: string;
  query: string;
  sourceIds?: string[];
  topK?: number;
  threshold?: number;
  useMMR?: boolean;
  mmrLambda?: number;
}): Promise<RetrievalResult> {
  const startTime = Date.now();
  const {
    notebookId,
    query,
    sourceIds,
    topK = RAG_CONFIG.topK,
    threshold = RAG_CONFIG.similarityThreshold,
    useMMR = true, // 默认启用 MMR
    mmrLambda = RAG_CONFIG.mmrLambda,
  } = params;

  const embeddingStartTime = Date.now();
  const queryEmbedding = await getEmbedding(query);
  const embeddingMs = Date.now() - embeddingStartTime;

  const retrievalStartTime = Date.now();

  // 检索更多候选结果用于 MMR
  const retrievalTopK = useMMR ? Math.min(topK * 3, 20) : topK;

  const rawChunks = await vectorStore.similaritySearch({
    notebookId,
    queryEmbedding,
    topK: retrievalTopK,
    threshold,
    sourceIds,
  });

  const retrievalMs = Date.now() - retrievalStartTime;

  const foundSourceIds = [...new Set(rawChunks.map((c) => c.sourceId))];

  const sources = await prisma.source.findMany({
    where: { id: { in: foundSourceIds } },
    select: { id: true, title: true, type: true },
  });

  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // ✅ P1-3: 直接使用 ChunkMetadata，无需强制类型转换
  let chunks: RetrievedChunk[] = rawChunks.map((chunk) => {
    const source = sourceMap.get(chunk.sourceId);
    return {
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: source?.title || "未知来源",
      sourceType: (source?.type as "file" | "url") || "file",
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      similarity: chunk.similarity,
      metadata: chunk.metadata, // 类型已保证
    };
  });

  // 应用 MMR 重排序
  if (useMMR && chunks.length > 1) {
    chunks = await rerankeWithMMR(chunks, queryEmbedding, mmrLambda, topK);
  } else {
    chunks = chunks.slice(0, topK);
  }

  // 计算置信度
  const confidenceDetail = calculateConfidence(chunks);
  const { score: confidence, level: confidenceLevel } = confidenceDetail;

  // M1: 计算证据统计 & 检索决策
  const evidenceStats = computeEvidenceStats(chunks);
  const retrievalDecision = determineRetrievalDecision(
    chunks,
    confidenceDetail,
  );

  return {
    chunks,
    hasEvidence: chunks.length > 0,
    retrievalMs,
    embeddingMs,
    queryEmbedding,
    confidence,
    confidenceLevel,
    confidenceDetail,
    retrievalDecision,
    evidenceStats,
  };
}

/**
 * M1: 计算证据统计信息
 */
export function computeEvidenceStats(
  chunks: RetrievedChunk[],
  threshold: number = RAG_CONFIG.similarityThreshold,
): EvidenceStats {
  if (chunks.length === 0) {
    return {
      totalChunks: 0,
      uniqueSources: 0,
      avgSimilarity: 0,
      maxSimilarity: 0,
      aboveThreshold: 0,
      coverage: 0,
      scoreGap: 0,
    };
  }

  const similarities = chunks.map((c) => c.similarity);
  const uniqueSourceIds = new Set(chunks.map((c) => c.sourceId));

  return {
    totalChunks: chunks.length,
    uniqueSources: uniqueSourceIds.size,
    avgSimilarity:
      similarities.reduce((a, b) => a + b, 0) / similarities.length,
    maxSimilarity: Math.max(...similarities),
    aboveThreshold: chunks.filter((c) => c.similarity >= threshold).length,
    coverage: uniqueSourceIds.size / Math.max(chunks.length, 1),
    scoreGap: Math.max(...similarities) - Math.min(...similarities),
  };
}

/**
 * M1: 计算多维度置信度
 * 基于相似度、来源多样性和证据覆盖综合评分
 */
export function calculateConfidence(
  chunks: RetrievedChunk[],
): ConfidenceResult {
  if (chunks.length === 0) {
    return {
      score: 0,
      level: "low",
      components: { similarity: 0, diversity: 0, coverage: 0 },
    };
  }

  const similarities = chunks.map((c) => c.similarity);
  const maxSimilarity = similarities[0];
  const avgSimilarity =
    similarities.reduce((a, b) => a + b, 0) / similarities.length;

  // 分项 1: 相似度分数 (权重 0.5)
  // 基于最高相似度 + 平均相似度的加权
  const similarityScore = maxSimilarity * 0.6 + avgSimilarity * 0.4;

  // 分项 2: 来源多样性分数 (权重 0.2)
  const uniqueSources = new Set(chunks.map((c) => c.sourceId)).size;
  // 多来源佐证更可靠：1 source=0.3, 2=0.6, 3+=1.0
  const diversityScore = Math.min(uniqueSources / 3, 1.0);

  // 分项 3: 证据覆盖分数 (权重 0.3)
  // 基于高质量 chunk 数量（similarity > 0.5）
  const highQualityCount = chunks.filter((c) => c.similarity > 0.5).length;
  const coverageScore = Math.min(highQualityCount / 3, 1.0);

  // 综合评分
  const score = Math.max(
    0,
    Math.min(
      1,
      similarityScore * 0.5 + diversityScore * 0.2 + coverageScore * 0.3,
    ),
  );

  // 判断等级
  let level: "low" | "medium" | "high";
  if (score >= 0.75) {
    level = "high";
  } else if (score >= ragStrategyConfig.confidenceFallbackThreshold) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    score,
    level,
    components: {
      similarity: similarityScore,
      diversity: diversityScore,
      coverage: coverageScore,
    },
  };
}

/**
 * M1: 确定检索决策
 */
export function determineRetrievalDecision(
  chunks: RetrievedChunk[],
  confidenceResult: ConfidenceResult,
): RetrievalDecision {
  if (chunks.length === 0 || confidenceResult.level === "low") {
    return "no_evidence";
  }
  if (confidenceResult.level === "medium") {
    return "uncertain";
  }
  return "grounded";
}

/**
 * 计算余弦相似度
 * 维度不匹配时返回 0 而非抛出异常，避免中断 MMR 流程
 */
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  // 维度校验：不匹配时返回 0
  if (vec1.length !== vec2.length) {
    console.warn(
      `[MMR] 向量维度不匹配: ${vec1.length} vs ${vec2.length}，返回相似度 0`,
    );
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);

  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * MMR (Maximal Marginal Relevance) 重排序算法
 * 平衡检索结果的相关性和多样性
 *
 * @param chunks 原始检索结果
 * @param queryEmbedding 查询向量
 * @param lambda 相关性权重 (0-1)，默认 0.7
 * @param topK 返回的结果数量
 * @returns 重排序后的结果
 *
 * 降级策略：
 * 1. 查询层失败 → 返回原始 chunks
 * 2. 余弦相似度计算失败 → 返回 0 并继续
 * 3. rerankeWithMMR 调用失败 → 切换为 chunks.slice(0, topK) 基础截断
 */
export async function rerankeWithMMR(
  chunks: RetrievedChunk[],
  queryEmbedding: number[],
  lambda: number = RAG_CONFIG.mmrLambda,
  topK: number = RAG_CONFIG.topK,
): Promise<RetrievedChunk[]> {
  if (chunks.length === 0) return [];
  if (chunks.length <= 1) return chunks;

  try {
    // 限制候选集大小，避免过多计算
    const candidates = chunks.slice(0, Math.min(20, chunks.length));

    // 获取所有 chunk 的 embedding（从数据库获取）
    const chunkEmbeddings = new Map<string, number[]>();

    // 批量查询 chunk embeddings - 使用类型安全的 Prisma.sql
    const chunkIds = candidates.map((c) => BigInt(c.id));
    const embeddingRecords = await prisma.$queryRaw<
      Array<{ id: bigint; embedding: any }>
    >(
      Prisma.sql`SELECT id, embedding FROM document_chunks WHERE id = ANY(${chunkIds}::bigint[])`,
    );

    // 解析 embedding 并进行维度校验
    for (const record of embeddingRecords) {
      if (!record.embedding) continue;

      // 兼容两种格式：原生数组 和 JSON 字符串
      let embedding: number[];
      try {
        if (typeof record.embedding === "string") {
          embedding = JSON.parse(record.embedding);
        } else if (Array.isArray(record.embedding)) {
          embedding = record.embedding;
        } else {
          console.warn(`[MMR] 跳过无效 embedding 格式: chunk ${record.id}`);
          continue;
        }

        // 维度校验：必须匹配 EMBEDDING_DIM
        if (embedding.length !== EMBEDDING_DIM) {
          console.warn(
            `[MMR] 跳过维度不匹配的向量: chunk ${record.id}, 期望 ${EMBEDDING_DIM}, 实际 ${embedding.length}`,
          );
          continue;
        }

        chunkEmbeddings.set(record.id.toString(), embedding);
      } catch (error) {
        console.warn(`[MMR] 解析 embedding 失败: chunk ${record.id}`, error);
        // 解析失败则跳过该记录
        continue;
      }
    }

    // 如果没有有效的 embeddings，降级为基础截断
    if (chunkEmbeddings.size === 0) {
      console.warn("[MMR] 无有有效的 embeddings，降级为基础截断");
      return chunks.slice(0, topK);
    }

    // 已选集合
    const selected: RetrievedChunk[] = [];
    const remaining = [...candidates];

    // 第一个选择相关性最高的
    if (remaining.length > 0) {
      const first = remaining[0]; // 已经按相关度排序
      selected.push(first);
      remaining.shift();
    }

    // 迭代选择剩余的 chunks
    while (selected.length < topK && remaining.length > 0) {
      let maxScore = -Infinity;
      let maxIndex = 0;

      // 计算每个候选 chunk 的 MMR 分数
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const candidateEmbedding = chunkEmbeddings.get(candidate.id);

        if (!candidateEmbedding) {
          // 如果没有 embedding，跳过
          continue;
        }

        // 相关性：与查询的相似度
        const relevance = candidate.similarity;

        // 多样性：与已选 chunks 的最大相似度
        let maxSimilarity = 0;
        for (const selectedChunk of selected) {
          const selectedEmbedding = chunkEmbeddings.get(selectedChunk.id);
          if (selectedEmbedding) {
            // 余弦相似度计算失败时返回 0
            const similarity = calculateCosineSimilarity(
              candidateEmbedding,
              selectedEmbedding,
            );
            maxSimilarity = Math.max(maxSimilarity, similarity);
          }
        }

        // MMR 分数 = λ * Relevance - (1-λ) * MaxSimilarity
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

        if (mmrScore > maxScore) {
          maxScore = mmrScore;
          maxIndex = i;
        }
      }

      // 选择 MMR 分数最高的 chunk
      if (maxScore > -Infinity) {
        selected.push(remaining[maxIndex]);
        remaining.splice(maxIndex, 1);
      } else {
        // 如果所有候选都没有 embedding，停止
        break;
      }
    }

    return selected;
  } catch (error) {
    // 查询层失败：降级为基础截断
    console.error("[MMR] 重排序失败，降级为基础截断", error);
    return chunks.slice(0, topK);
  }
}

export function deduplicateChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
}

/**
 * 混合检索
 * 结合向量相似度和全文检索，提高检索质量
 */
export async function hybridRetrieveChunks(params: {
  notebookId: string;
  query: string;
  sourceIds?: string[];
  topK?: number;
  threshold?: number;
  vectorWeight?: number;
  ftsWeight?: number;
  useMMR?: boolean;
  mmrLambda?: number;
}): Promise<RetrievalResult> {
  const startTime = Date.now();
  const {
    notebookId,
    query,
    sourceIds,
    topK = RAG_CONFIG.topK,
    threshold = RAG_CONFIG.similarityThreshold,
    vectorWeight = RAG_CONFIG.vectorWeight,
    ftsWeight = RAG_CONFIG.ftsWeight,
    useMMR = true,
    mmrLambda = RAG_CONFIG.mmrLambda,
  } = params;

  const embeddingStartTime = Date.now();
  const queryEmbedding = await getEmbedding(query);
  const embeddingMs = Date.now() - embeddingStartTime;

  const retrievalStartTime = Date.now();

  const retrievalTopK = useMMR ? Math.min(topK * 3, 20) : topK;

  const rawChunks = await vectorStore.hybridSearch({
    notebookId,
    queryEmbedding,
    queryText: query,
    topK: retrievalTopK,
    threshold,
    sourceIds,
    vectorWeight,
    ftsWeight,
  });

  const retrievalMs = Date.now() - retrievalStartTime;

  const foundSourceIds = [...new Set(rawChunks.map((c) => c.sourceId))];

  const sources = await prisma.source.findMany({
    where: { id: { in: foundSourceIds } },
    select: { id: true, title: true, type: true },
  });

  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  let chunks: RetrievedChunk[] = rawChunks.map((chunk) => {
    const source = sourceMap.get(chunk.sourceId);
    return {
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: source?.title || "未知来源",
      sourceType: (source?.type as "file" | "url") || "file",
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      similarity: chunk.similarity, // 使用原始向量相似度，而非 combinedScore，确保置信度计算一致
      metadata: chunk.metadata,
      scores: {
        vectorScore: chunk.vectorScore,
        ftsScore: chunk.ftsScore,
        combinedScore: chunk.combinedScore,
      },
    };
  });

  // 应用 MMR 重排序
  if (useMMR && chunks.length > 1) {
    chunks = await rerankeWithMMR(chunks, queryEmbedding, mmrLambda, topK);
  } else {
    chunks = chunks.slice(0, topK);
  }

  // 计算置信度
  const confidenceDetail = calculateConfidence(chunks);
  const { score: confidence, level: confidenceLevel } = confidenceDetail;

  // M1: 计算证据统计 & 检索决策
  const evidenceStats = computeEvidenceStats(chunks);
  const retrievalDecision = determineRetrievalDecision(
    chunks,
    confidenceDetail,
  );

  return {
    chunks,
    hasEvidence: chunks.length > 0,
    retrievalMs,
    embeddingMs,
    queryEmbedding,
    retrievalType: "hybrid" as const,
    confidence,
    confidenceLevel,
    confidenceDetail,
    retrievalDecision,
    evidenceStats,
  };
}
