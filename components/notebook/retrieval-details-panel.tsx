"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChunkCard } from "./chunk-card";
import { RetrievalFlowDiagram } from "./retrieval-flow-diagram";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  Settings2,
  BarChart3,
  ListFilter,
  Search,
  Database,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Info,
} from "lucide-react";

interface RetrievalDetailsPanelProps {
  details: {
    query: string;
    model?: string;
    retrievalParams: {
      sourceIds: string[];
      topK: number;
      threshold: number;
      useHybridSearch?: boolean;
      retrievalType?: string;
    };
    chunks: Array<{
      id: string;
      sourceId: string;
      sourceName: string;
      score: number;
      content: string;
      metadata: { page?: number; url?: string };
      scores?: {
        vectorScore?: number;
        ftsScore?: number;
        combinedScore?: number;
      };
    }>;
    timing: {
      embedding: number;
      retrieval: number;
      generation?: number;
      validation?: number;
      total?: number;
    };
    // M1: 诊断字段
    traceId?: string;
    confidence?: number;
    confidenceLevel?: "low" | "medium" | "high";
    retrievalDecision?: "grounded" | "uncertain" | "no_evidence";
    evidenceStats?: {
      totalChunks: number;
      uniqueSources: number;
      avgSimilarity: number;
      maxSimilarity: number;
      aboveThreshold: number;
      coverage: number;
      scoreGap: number;
    };
    confidenceDetail?: {
      score: number;
      level: "low" | "medium" | "high";
      components: {
        similarity: number;
        diversity: number;
        coverage: number;
      };
    };
  };
}

const confidenceLevelConfig = {
  high: {
    label: "高",
    color: "text-green-700 bg-green-50 border-green-200",
    icon: ShieldCheck,
  },
  medium: {
    label: "中",
    color: "text-yellow-700 bg-yellow-50 border-yellow-200",
    icon: Shield,
  },
  low: {
    label: "低",
    color: "text-red-700 bg-red-50 border-red-200",
    icon: ShieldAlert,
  },
};

export function RetrievalDetailsPanel({ details }: RetrievalDetailsPanelProps) {
  const hasResults = details.chunks.length > 0;
  const highConfidenceChunks = details.chunks.filter(
    (c) => c.score >= details.retrievalParams.threshold,
  );
  const useHybridSearch =
    details.retrievalParams.useHybridSearch ||
    details.retrievalParams.retrievalType === "hybrid";
  const confidenceLevel =
    details.confidenceLevel || details.confidenceDetail?.level;
  const confidenceConfig = confidenceLevel
    ? confidenceLevelConfig[confidenceLevel]
    : null;
  const ConfidenceIcon = confidenceConfig?.icon || Shield;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">检索参数</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="space-y-1">
            <span className="text-muted-foreground block">检索方式</span>
            <span className="font-medium flex items-center gap-1">
              {useHybridSearch ? (
                <>
                  <Search className="w-3 h-3" />
                  混合检索
                </>
              ) : (
                <>
                  <Database className="w-3 h-3" />
                  向量检索
                </>
              )}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground block">Top K</span>
            <span className="font-medium block">
              {details.retrievalParams.topK}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-[11px]">
          <div className="space-y-1">
            <span className="text-muted-foreground block">检索范围</span>
            <span className="font-medium truncate block">
              {details.retrievalParams.sourceIds.length > 0
                ? `已选 ${details.retrievalParams.sourceIds.length} 个来源`
                : "全部资料"}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground block">相似度阈值</span>
            <span className="font-medium block">
              {details.retrievalParams.threshold}
            </span>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground block">返回片段</span>
            <span className="font-medium block">
              {details.chunks.length} 个
            </span>
          </div>
        </div>

        {/* M1: 置信度显示 */}
        {confidenceConfig && (
          <div
            className={`mt-3 p-2 rounded-lg border flex items-center gap-2 ${confidenceConfig.color}`}
          >
            <ConfidenceIcon className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold">
                  置信度: {confidenceConfig.label}
                </span>
                {details.confidence !== undefined && (
                  <span className="font-mono text-[10px] opacity-70">
                    ({Math.round(details.confidence * 100)}%)
                  </span>
                )}
                {details.retrievalDecision && (
                  <span className="text-[10px] opacity-70 ml-auto">
                    决策: {details.retrievalDecision}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Tabs defaultValue="chunks" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 border-b flex-shrink-0">
          <TabsList className="h-10 w-full justify-start bg-transparent p-0 gap-4">
            <TabsTrigger
              value="chunks"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs"
            >
              <ListFilter className="w-3.5 h-3.5 mr-1.5" />
              检索片段 ({details.chunks.length})
            </TabsTrigger>
            <TabsTrigger
              value="flow"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs"
            >
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
              链路可视化
            </TabsTrigger>
            {(details.traceId || details.evidenceStats) && (
              <TabsTrigger
                value="diagnostics"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 h-10 text-xs"
              >
                <Info className="w-3.5 h-3.5 mr-1.5" />
                诊断
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="chunks" className="flex-1 m-0 p-0 min-h-0">
          <ScrollArea className="h-full p-4">
            {!hasResults ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">未找到足够相关的内容</p>
                  <p className="text-xs text-muted-foreground">
                    尝试换个问法，或上传更多相关资料
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {highConfidenceChunks.length === 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                    <p className="text-[11px] text-yellow-700">
                      提示：检索到的片段相似度均低于阈值 (
                      {details.retrievalParams.threshold})，AI
                      可能无法给出准确回答。
                    </p>
                  </div>
                )}
                <div className="grid gap-3">
                  {details.chunks.map((chunk) => (
                    <ChunkCard
                      key={chunk.id}
                      chunk={chunk}
                      showScores={useHybridSearch}
                    />
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="flow" className="flex-1 m-0 p-0 min-h-0">
          <ScrollArea className="h-full p-4">
            <RetrievalFlowDiagram
              timing={details.timing}
              model={details.model || "GLM-4.7"}
              chunkCount={details.chunks.length}
            />
          </ScrollArea>
        </TabsContent>

        {/* M1: 诊断信息 Tab */}
        {(details.traceId || details.evidenceStats) && (
          <TabsContent value="diagnostics" className="flex-1 m-0 p-0 min-h-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-4">
                {details.traceId && (
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      Trace ID
                    </span>
                    <p className="text-[10px] font-mono bg-muted p-2 rounded break-all">
                      {details.traceId}
                    </p>
                  </div>
                )}

                {details.confidenceDetail && (
                  <div className="space-y-2">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      置信度分项
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <ConfidenceBar
                        label="相似度"
                        value={details.confidenceDetail.components.similarity}
                      />
                      <ConfidenceBar
                        label="多样性"
                        value={details.confidenceDetail.components.diversity}
                      />
                      <ConfidenceBar
                        label="覆盖度"
                        value={details.confidenceDetail.components.coverage}
                      />
                    </div>
                  </div>
                )}

                {details.evidenceStats && (
                  <div className="space-y-2">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      证据统计
                    </span>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div className="bg-muted/50 rounded p-2">
                        <span className="text-muted-foreground block">
                          总片段
                        </span>
                        <span className="font-bold">
                          {details.evidenceStats.totalChunks}
                        </span>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <span className="text-muted-foreground block">
                          独立来源
                        </span>
                        <span className="font-bold">
                          {details.evidenceStats.uniqueSources}
                        </span>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <span className="text-muted-foreground block">
                          平均相似度
                        </span>
                        <span className="font-bold">
                          {Math.round(
                            details.evidenceStats.avgSimilarity * 100,
                          )}
                          %
                        </span>
                      </div>
                      <div className="bg-muted/50 rounded p-2">
                        <span className="text-muted-foreground block">
                          超阈值片段
                        </span>
                        <span className="font-bold">
                          {details.evidenceStats.aboveThreshold}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const percentage = Math.round(value * 100);
  const barColor =
    percentage >= 75
      ? "bg-green-500"
      : percentage >= 50
        ? "bg-yellow-500"
        : "bg-red-400";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{percentage}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
