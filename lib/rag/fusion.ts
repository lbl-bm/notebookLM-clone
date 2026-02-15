/**
 * M2a: 候选融合模块
 *
 * 负责多路检索结果的归一化、去重、来源多样性约束和合并
 * 设计目标：零额外 API 调用，纯算法融合
 */

import { ragStrategyConfig } from "@/lib/config";
import type { FusionCandidate, FusionResult, FusionDiagnostics } from "./types";

/**
 * Min-Max 归一化一组候选的分数到 [0, 1]
 */
export function normalizeRouteScores(
  candidates: FusionCandidate[],
): FusionCandidate[] {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    return [{ ...candidates[0], normalizedScore: 1 }];
  }

  const scores = candidates.map((c) => c.rawScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) {
    return candidates.map((c) => ({ ...c, normalizedScore: 1 }));
  }

  return candidates.map((c) => ({
    ...c,
    normalizedScore: (c.rawScore - min) / range,
  }));
}

/**
 * 计算两段文本的 Jaccard 相似度（基于字符 n-gram）
 * 用于近似重复检测
 */
function jaccardSimilarity(
  a: string,
  b: string,
  ngramSize: number = 3,
): number {
  if (!a || !b) return 0;

  const getNgrams = (text: string): Set<string> => {
    const ngrams = new Set<string>();
    const cleaned = text.replace(/\s+/g, "");
    for (let i = 0; i <= cleaned.length - ngramSize; i++) {
      ngrams.add(cleaned.substring(i, i + ngramSize));
    }
    return ngrams;
  };

  const ngramsA = getNgrams(a);
  const ngramsB = getNgrams(b);

  if (ngramsA.size === 0 && ngramsB.size === 0) return 1;
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const ngram of ngramsA) {
    if (ngramsB.has(ngram)) intersectionSize++;
  }

  const unionSize = ngramsA.size + ngramsB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * 移除近似重复候选
 * 保留分数更高的那个
 */
export function removeNearDuplicates(
  candidates: FusionCandidate[],
  threshold?: number,
): { result: FusionCandidate[]; removedCount: number } {
  const jaccardThreshold =
    threshold ?? ragStrategyConfig.nearDuplicateThreshold;

  if (candidates.length <= 1) {
    return { result: [...candidates], removedCount: 0 };
  }

  // 按归一化分数降序排列
  const sorted = [...candidates].sort(
    (a, b) => b.normalizedScore - a.normalizedScore,
  );
  const kept: FusionCandidate[] = [];
  let removedCount = 0;

  for (const candidate of sorted) {
    const isDuplicate = kept.some(
      (existing) =>
        jaccardSimilarity(existing.content, candidate.content) >=
        jaccardThreshold,
    );

    if (isDuplicate) {
      removedCount++;
    } else {
      kept.push(candidate);
    }
  }

  return { result: kept, removedCount };
}

/**
 * 应用来源多样性约束
 * 每个 source 最多保留 maxChunksPerSource 个 chunk
 */
export function applySourceDiversityConstraint(
  candidates: FusionCandidate[],
  maxPerSource?: number,
): { result: FusionCandidate[]; truncatedCount: number } {
  const maxChunks = maxPerSource ?? ragStrategyConfig.maxChunksPerSource;

  const sourceCounts = new Map<string, number>();
  const result: FusionCandidate[] = [];
  let truncatedCount = 0;

  // 假设已按分数降序排列
  for (const candidate of candidates) {
    const count = sourceCounts.get(candidate.sourceId) || 0;
    if (count < maxChunks) {
      result.push(candidate);
      sourceCounts.set(candidate.sourceId, count + 1);
    } else {
      truncatedCount++;
    }
  }

  return { result, truncatedCount };
}

/**
 * 完整融合流程：归一化 → 合并 → 排序 → 去近似重复 → 来源多样性
 */
export function fuseCandidates(
  routes: Array<{ candidates: FusionCandidate[]; routeLabel: string }>,
): FusionResult {
  const routeCounts: Record<string, number> = {};

  // 1. 各路由独立归一化
  const allNormalized: FusionCandidate[] = [];
  for (const route of routes) {
    routeCounts[route.routeLabel] = route.candidates.length;
    const normalized = normalizeRouteScores(route.candidates);
    allNormalized.push(...normalized);
  }

  const totalBeforeDedup = allNormalized.length;

  // 2. 按 id 去精确重复（保留分数更高的）
  const deduped = new Map<string, FusionCandidate>();
  for (const c of allNormalized) {
    const existing = deduped.get(c.id);
    if (!existing || c.normalizedScore > existing.normalizedScore) {
      deduped.set(c.id, c);
    }
  }
  const afterExactDedup = Array.from(deduped.values());

  // 3. 按归一化分数降序排列
  afterExactDedup.sort((a, b) => b.normalizedScore - a.normalizedScore);

  // 4. 移除近似重复
  const { result: afterNearDedup, removedCount: nearDuplicatesRemoved } =
    removeNearDuplicates(afterExactDedup);

  // 5. 来源多样性约束
  const { result: final, truncatedCount: diversityTruncated } =
    applySourceDiversityConstraint(afterNearDedup);

  const diagnostics: FusionDiagnostics = {
    routeCounts,
    totalBeforeDedup,
    nearDuplicatesRemoved,
    diversityTruncated,
    totalAfterFusion: final.length,
  };

  return { candidates: final, diagnostics };
}
