/**
 * 统一日志工具
 * 仅在开发环境输出日志，生产环境静默
 */

import { randomUUID } from "crypto";

type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * 生成请求级 traceId
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * ✅ P1-6: 向量操作日志结构
 */
export interface VectorOperationLog {
  operation: "insert" | "search" | "hybrid_search" | "delete";
  sourceId?: string;
  notebookId?: string;
  chunkCount?: number;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: {
    inserted?: number;
    skipped?: number;
    topK?: number;
    threshold?: number;
    similarityAvg?: number;
    [key: string]: any;
  };
}

/**
 * M1: Chat 链路追踪日志结构
 * 写入 messages.metadata.diagnostics，不写独立日志表
 */
export interface ChatTraceLog {
  traceId: string;
  notebookId: string;
  strategyVersion: string;
  /** 检索决策：grounded=有依据 / uncertain=不确定 / no_evidence=无证据 */
  retrievalDecision: "grounded" | "uncertain" | "no_evidence";
  /** 证据统计 */
  evidenceStats: {
    totalChunks: number;
    uniqueSources: number;
    avgSimilarity: number;
    maxSimilarity: number;
    aboveThreshold: number;
    coverage: number; // 来源覆盖率 (0-1)
    scoreGap: number; // 最高分与最低分的差
  };
  /** 引用一致性快检结果 */
  validationResult?: {
    validCitations: number;
    invalidCitations: number;
    uncheckedCitations: number;
    qualityLabel: "verified" | "partial" | "unchecked";
    durationMs: number;
  };
  /** 置信度 */
  confidence: {
    score: number;
    level: "low" | "medium" | "high";
    components: {
      similarity: number;
      diversity: number;
      coverage: number;
    };
  };
  /** 耗时 */
  timing: {
    embedding: number;
    retrieval: number;
    generation: number;
    validation: number;
    total: number;
  };
  /** 生成模型 */
  model: string;
  /** M2: 管线诊断 */
  m2Diagnostics?: {
    dynamicTopK?: { baseTopK: number; finalTopK: number };
    fusion?: { totalBeforeDedup: number; totalAfterFusion: number };
    budget?: { totalBudget: number; usedTokens: number; selectedChunks: number };
    queryRewrite?: { keywords: string[]; expansions: string[] };
    rerank?: { inputCount: number; outputCount: number };
    stageTiming?: Record<string, number>;
  };
}

class Logger {
  private isDev = process.env.NODE_ENV === "development";

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.isDev && level !== "error") return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case "error":
        console.error(prefix, message, ...args);
        break;
      case "warn":
        console.warn(prefix, message, ...args);
        break;
      case "info":
        console.log(prefix, message, ...args);
        break;
      case "debug":
        if (this.isDev) {
          console.log(prefix, message, ...args);
        }
        break;
    }
  }

  info(message: string, ...args: any[]) {
    this.log("info", message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log("warn", message, ...args);
  }

  error(message: string, ...args: any[]) {
    this.log("error", message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log("debug", message, ...args);
  }

  /**
   * ✅ P1-6: 向量操作专用日志
   */
  vectorOperation(log: VectorOperationLog) {
    const level: LogLevel = log.success ? "info" : "error";
    const message = `[VectorStore] ${log.operation} ${log.success ? "success" : "failed"}`;

    const details = {
      operation: log.operation,
      notebookId: log.notebookId,
      sourceId: log.sourceId,
      chunkCount: log.chunkCount,
      duration: `${log.duration}ms`,
      success: log.success,
      ...log.metadata,
    };

    if (log.error) {
      this.log(level, message, { ...details, error: log.error });
    } else {
      this.log(level, message, details);
    }
  }

  /**
   * M1: Chat 链路追踪日志
   */
  chatTrace(log: ChatTraceLog) {
    const level: LogLevel =
      log.retrievalDecision === "no_evidence" ? "warn" : "info";
    const message = `[ChatTrace] ${log.traceId} decision=${log.retrievalDecision} confidence=${log.confidence.score.toFixed(2)}`;

    this.log(level, message, {
      traceId: log.traceId,
      decision: log.retrievalDecision,
      confidence: log.confidence,
      evidence: log.evidenceStats,
      validation: log.validationResult,
      timing: log.timing,
      model: log.model,
      strategy: log.strategyVersion,
      m2: log.m2Diagnostics,
    });
  }
}

export const logger = new Logger();
