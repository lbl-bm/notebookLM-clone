"use client";

import {
  ArrowDown,
  Cpu,
  Database,
  Search,
  MessageSquare,
  Zap,
  Layers,
  Filter,
  SlidersHorizontal,
} from "lucide-react";

interface RetrievalFlowDiagramProps {
  timing: {
    embedding: number;
    retrieval: number;
    generation?: number;
    total?: number;
  };
  model: string;
  chunkCount: number;
  m2Diagnostics?: {
    dynamicTopK?: { finalTopK: number };
    fusion?: { totalBeforeDedup: number; totalAfterFusion: number };
    budget?: {
      totalBudget: number;
      usedTokens: number;
      selectedChunks: number;
    };
    queryRewrite?: { keywords: string[]; expansions: string[] };
    rerank?: { inputCount: number; outputCount: number };
    stageTiming?: Record<string, number>;
  } | null;
}

export function RetrievalFlowDiagram({
  timing,
  model,
  chunkCount,
  m2Diagnostics,
}: RetrievalFlowDiagramProps) {
  const m2 = m2Diagnostics;
  const steps: Array<{
    icon: React.ReactNode;
    label: string;
    sub: string;
    color: string;
  }> = [
    {
      icon: <MessageSquare className="w-4 h-4" />,
      label: "用户问题",
      sub: "",
      color: "bg-blue-100 text-blue-700",
    },
    {
      icon: <Cpu className="w-4 h-4" />,
      label: "向量化",
      sub: `Embedding-3 (${timing.embedding}ms)`,
      color: "bg-purple-100 text-purple-700",
    },
  ];

  // M2: 查询改写步骤
  if (m2?.queryRewrite && m2.queryRewrite.keywords.length > 0) {
    steps.push({
      icon: <SlidersHorizontal className="w-4 h-4" />,
      label: "查询改写",
      sub: `${m2.queryRewrite.keywords.length} 关键词, ${m2.queryRewrite.expansions.length} 扩展`,
      color: "bg-violet-100 text-violet-700",
    });
  }

  // 检索步骤
  steps.push({
    icon: <Search className="w-4 h-4" />,
    label: m2?.dynamicTopK
      ? `混合检索 (TopK=${m2.dynamicTopK.finalTopK})`
      : "混合检索",
    sub: `pgvector + FTS (${timing.retrieval}ms)`,
    color: "bg-orange-100 text-orange-700",
  });

  // M2: 融合步骤
  if (m2?.fusion) {
    steps.push({
      icon: <Layers className="w-4 h-4" />,
      label: "候选融合",
      sub: `${m2.fusion.totalBeforeDedup} → ${m2.fusion.totalAfterFusion} chunks`,
      color: "bg-amber-100 text-amber-700",
    });
  }

  // M2: Stage-2 重排步骤
  if (m2?.rerank) {
    steps.push({
      icon: <Filter className="w-4 h-4" />,
      label: "Stage-2 重排",
      sub: `${m2.rerank.inputCount} → ${m2.rerank.outputCount} chunks`,
      color: "bg-cyan-100 text-cyan-700",
    });
  }

  // M2: Context Budget 步骤
  if (m2?.budget) {
    steps.push({
      icon: <Database className="w-4 h-4" />,
      label: "Context Budget",
      sub: `${m2.budget.selectedChunks} chunks (${m2.budget.usedTokens}/${m2.budget.totalBudget} tokens)`,
      color: "bg-teal-100 text-teal-700",
    });
  } else {
    steps.push({
      icon: <Database className="w-4 h-4" />,
      label: "召回片段",
      sub: `${chunkCount} 个 chunks`,
      color: "bg-green-100 text-green-700",
    });
  }

  if (timing.generation) {
    steps.push({
      icon: <Zap className="w-4 h-4" />,
      label: "生成回答",
      sub: `${model} (${timing.generation}ms)`,
      color: "bg-indigo-100 text-indigo-700",
    });
  }

  return (
    <div className="flex flex-col items-center py-4 space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex flex-col items-center w-full">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border w-full max-w-[280px] ${step.color}`}
          >
            <div className="p-2 bg-white rounded-md shadow-sm">{step.icon}</div>
            <div className="flex flex-col">
              <span className="text-xs font-bold">{step.label}</span>
              {step.sub && (
                <span className="text-[10px] opacity-80">{step.sub}</span>
              )}
            </div>
          </div>
          {index < steps.length - 1 && (
            <ArrowDown className="w-4 h-4 my-1 text-muted-foreground/30" />
          )}
        </div>
      ))}

      {timing.total && (
        <div className="mt-4 pt-2 border-t w-full text-center">
          <span className="text-[10px] text-muted-foreground">
            总耗时:{" "}
            <span className="font-mono font-bold text-foreground">
              {timing.total}ms
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
