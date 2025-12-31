'use client'

import { ArrowDown, Cpu, Database, Search, MessageSquare, Zap } from 'lucide-react'

interface RetrievalFlowDiagramProps {
  timing: {
    embedding: number
    retrieval: number
    generation: number
    total: number
  }
  model: string
  chunkCount: number
}

export function RetrievalFlowDiagram({ timing, model, chunkCount }: RetrievalFlowDiagramProps) {
  const steps = [
    {
      icon: <MessageSquare className="w-4 h-4" />,
      label: '用户问题',
      sub: '',
      color: 'bg-blue-100 text-blue-700',
    },
    {
      icon: <Cpu className="w-4 h-4" />,
      label: '向量化',
      sub: `Embedding-3 (${timing.embedding}ms)`,
      color: 'bg-purple-100 text-purple-700',
    },
    {
      icon: <Search className="w-4 h-4" />,
      label: '向量检索',
      sub: `pgvector (${timing.retrieval}ms)`,
      color: 'bg-orange-100 text-orange-700',
    },
    {
      icon: <Database className="w-4 h-4" />,
      label: '召回片段',
      sub: `${chunkCount} 个 chunks`,
      color: 'bg-green-100 text-green-700',
    },
    {
      icon: <Zap className="w-4 h-4" />,
      label: '生成回答',
      sub: `${model} (${timing.generation}ms)`,
      color: 'bg-indigo-100 text-indigo-700',
    },
  ]

  return (
    <div className="flex flex-col items-center py-4 space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex flex-col items-center w-full">
          <div className={`flex items-center gap-3 p-3 rounded-lg border w-full max-w-[280px] ${step.color}`}>
            <div className="p-2 bg-white rounded-md shadow-sm">
              {step.icon}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold">{step.label}</span>
              {step.sub && <span className="text-[10px] opacity-80">{step.sub}</span>}
            </div>
          </div>
          {index < steps.length - 1 && (
            <ArrowDown className="w-4 h-4 my-1 text-muted-foreground/30" />
          )}
        </div>
      ))}
      
      <div className="mt-4 pt-2 border-t w-full text-center">
        <span className="text-[10px] text-muted-foreground">
          总耗时: <span className="font-mono font-bold text-foreground">{timing.total}ms</span>
        </span>
      </div>
    </div>
  )
}
