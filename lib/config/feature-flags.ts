/**
 * P1.1a 灰度控制与特性开关
 *
 * 功能:
 * 1. 按用户/Notebook 的灰度控制
 * 2. 动态特性开关
 * 3. 灰度指标收集
 */

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/utils/logger";

/**
 * 特性开关类型
 */
export enum FeatureFlag {
  HYBRID_RETRIEVAL = "hybrid_retrieval",
  CONFIDENCE_SCORING = "confidence_scoring",
  EMBEDDING_CACHE = "embedding_cache",
  DB_CONNECTION_POOL = "db_connection_pool",
}

/**
 * 灰度配置
 */
interface CanaryConfig {
  enabled: boolean;        // 是否启用灰度
  percentage: number;      // 灰度百分比 (0-100)
  whitelistUsers?: string[]; // 白名单用户
  whitelistNotebooks?: string[]; // 白名单 Notebook
  blacklistUsers?: string[]; // 黑名单用户
  rolloutStart: Date;      // 开始时间
  rolloutEnd?: Date;       // 预计结束时间
  metadata?: Record<string, any>; // 其他元数据
}

/**
 * 特性开关管理器
 */
export class FeatureFlagManager {
  private static instance: FeatureFlagManager;
  private cache: Map<string, CanaryConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

  private constructor() {}

  static getInstance(): FeatureFlagManager {
    if (!FeatureFlagManager.instance) {
      FeatureFlagManager.instance = new FeatureFlagManager();
    }
    return FeatureFlagManager.instance;
  }

  /**
   * 检查用户是否应该启用某个特性
   *
   * 优先级 (从高到低):
   * 1. 黑名单 - 如果在黑名单中直接拒绝
   * 2. 白名单 - 如果在白名单中直接允许
   * 3. 百分比灰度 - 根据一致性哈希进行灰度
   */
  async isEnabled(
    featureFlag: FeatureFlag,
    userId?: string,
    notebookId?: string,
  ): Promise<boolean> {
    try {
      const config = await this.getConfig(featureFlag);

      if (!config || !config.enabled) {
        return false;
      }

      // 优先级 1: 黑名单检查 - 如果在黑名单中，直接返回 false
      if (userId && config.blacklistUsers?.includes(userId)) {
        return false;
      }

      // 优先级 2: 白名单检查 - 如果在白名单中，直接返回 true
      if (userId && config.whitelistUsers?.includes(userId)) {
        return true;
      }

      if (notebookId && config.whitelistNotebooks?.includes(notebookId)) {
        return true;
      }

      // 优先级 3: 基于百分比的灰度
      return this.shouldEnableByPercentage(userId || notebookId || "", config.percentage);
    } catch (error) {
      logger.error(`Failed to check feature flag ${featureFlag}:`, error);
      // 默认返回 false（保守策略）
      return false;
    }
  }

  /**
   * 获取特性配置
   */
  private async getConfig(featureFlag: FeatureFlag): Promise<CanaryConfig | null> {
    // 检查缓存
    const cached = this.cache.get(featureFlag);
    const expiry = this.cacheExpiry.get(featureFlag);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // 从数据库读取 (如果有)
    // 这里假设有一个 FeatureFlags 表
    try {
      const config = await this.fetchFromDatabase(featureFlag);
      if (config) {
        this.cache.set(featureFlag, config);
        this.cacheExpiry.set(featureFlag, Date.now() + this.CACHE_TTL);
      }
      return config;
    } catch (error) {
      logger.error(`Failed to fetch config for ${featureFlag}:`, error);
      return null;
    }
  }

  /**
   * 从数据库读取配置
   */
  private async fetchFromDatabase(featureFlag: FeatureFlag): Promise<CanaryConfig | null> {
    // 简化配置：由于用户量少，直接全量发布，无需复杂灰度
    const defaultConfigs: Record<FeatureFlag, CanaryConfig> = {
      [FeatureFlag.HYBRID_RETRIEVAL]: {
        enabled: true,      // ✅ 直接启用，无灰度
        percentage: 100,    // 100% 用户
        rolloutStart: new Date("2026-03-27"),
        metadata: { version: "1.0", phase: "production" },
      },
      [FeatureFlag.CONFIDENCE_SCORING]: {
        enabled: false,
        percentage: 0,
        rolloutStart: new Date("2026-04-01"),
      },
      [FeatureFlag.EMBEDDING_CACHE]: {
        enabled: false,
        percentage: 0,
        rolloutStart: new Date("2026-04-05"),
      },
      [FeatureFlag.DB_CONNECTION_POOL]: {
        enabled: false,
        percentage: 0,
        rolloutStart: new Date("2026-04-10"),
      },
    };

    return defaultConfigs[featureFlag] || null;
  }

  /**
   * 基于百分比的灰度判定
   *
   * 使用一致的哈希算法，确保同一用户/Notebook 的多次调用结果一致
   */
  private shouldEnableByPercentage(identifier: string, percentage: number): boolean {
    if (percentage <= 0) return false;
    if (percentage >= 100) return true;

    // 使用简单的哈希函数
    const hash = this.hashIdentifier(identifier);
    const hashPercentage = (hash % 100) + 1; // 1-100

    return hashPercentage <= percentage;
  }

  /**
   * 简单的哈希函数
   */
  private hashIdentifier(identifier: string): number {
    let hash = 0;
    for (let i = 0; i < identifier.length; i++) {
      const char = identifier.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash);
  }

  /**
   * 更新特性配置 (仅用于测试)
   */
  async updateConfig(featureFlag: FeatureFlag, config: Partial<CanaryConfig>): Promise<void> {
    const existing = await this.getConfig(featureFlag);
    if (!existing) return;

    const updated = { ...existing, ...config };
    this.cache.set(featureFlag, updated);
    this.cacheExpiry.set(featureFlag, Date.now() + this.CACHE_TTL);

    logger.info(`Updated feature flag ${featureFlag}:`, updated);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}

/**
 * 灰度指标收集
 */
export interface CanaryMetrics {
  featureFlag: FeatureFlag;
  timestamp: Date;
  userId?: string;
  notebookId?: string;
  enabled: boolean;
  responseTime: number;
  success: boolean;
  metric: "p@5" | "latency" | "error_rate" | "custom";
  value: number;
  metadata?: Record<string, any>;
}

/**
 * 灰度指标记录器
 *
 * ✅ 在 Next.js 环境下使用 globalThis 以支持 HMR
 * 防止热重载时重复创建实例
 */
export class CanaryMetricsLogger {
  private static instance: CanaryMetricsLogger;
  private metricsBuffer: CanaryMetrics[] = [];
  private readonly BUFFER_SIZE = 1000;
  private flushInterval: NodeJS.Timer | null = null;

  private constructor() {
    // 每 5 分钟或缓冲区满时刷新指标
    this.startAutoFlush(5 * 60 * 1000);
  }

  static getInstance(): CanaryMetricsLogger {
    // ✅ 在 Next.js HMR 下也能复用同一实例
    const globalForMetrics = globalThis as unknown as { canaryMetricsLogger?: CanaryMetricsLogger };

    if (!globalForMetrics.canaryMetricsLogger) {
      globalForMetrics.canaryMetricsLogger = new CanaryMetricsLogger();
    }
    return globalForMetrics.canaryMetricsLogger;
  }

  /**
   * 记录一条指标
   */
  record(metric: CanaryMetrics): void {
    this.metricsBuffer.push(metric);

    if (this.metricsBuffer.length >= this.BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * 刷新指标到存储
   */
  async flush(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    try {
      // 这里应该将指标发送到分析系统 (如 BigQuery, ClickHouse, 等)
      logger.info(`Flushed ${metricsToFlush.length} canary metrics`);

      // 示例: 统计信息
      const successCount = metricsToFlush.filter((m) => m.success).length;
      const avgLatency =
        metricsToFlush.reduce((sum, m) => sum + m.responseTime, 0) / metricsToFlush.length;

      logger.info(
        `Canary metrics: success_rate=${(successCount / metricsToFlush.length).toFixed(2)}, ` +
        `avg_latency=${avgLatency.toFixed(2)}ms`
      );
    } catch (error) {
      logger.error("Failed to flush canary metrics:", error);
      // 重新加入缓冲区以供重试
      this.metricsBuffer.unshift(...metricsToFlush);
    }
  }

  /**
   * 启动自动刷新
   */
  private startAutoFlush(interval: number): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => {
        logger.error("Auto flush error:", error);
      });
    }, interval);
  }

  /**
   * 停止自动刷新
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

/**
 * 辅助函数：为混合检索启用灰度
 */
export async function shouldUseHybridRetrieval(
  userId?: string,
  notebookId?: string,
): Promise<boolean> {
  const manager = FeatureFlagManager.getInstance();
  return manager.isEnabled(FeatureFlag.HYBRID_RETRIEVAL, userId, notebookId);
}

/**
 * 导出单例
 */
export const featureFlagManager = FeatureFlagManager.getInstance();
export const canaryMetricsLogger = CanaryMetricsLogger.getInstance();
