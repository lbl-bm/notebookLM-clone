'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { FileText, Globe, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChunkCardProps {
  chunk: {
    id: string
    sourceId: string
    sourceName: string
    score: number
    content: string
    metadata: { page?: number; url?: string }
  }
}

export function ChunkCard({ chunk }: ChunkCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const scorePercentage = Math.round(chunk.score * 100)

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium truncate">
          {chunk.metadata.url ? (
            <Globe className="w-4 h-4 text-blue-500" />
          ) : (
            <FileText className="w-4 h-4 text-orange-500" />
          )}
          <span className="truncate">{chunk.sourceName}</span>
          {chunk.metadata.page && (
            <span className="text-xs text-muted-foreground">P.{chunk.metadata.page}</span>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-[80px]">
          <span className={cn(
            "text-xs font-bold",
            scorePercentage > 70 ? "text-green-600" : scorePercentage > 40 ? "text-yellow-600" : "text-red-600"
          )}>
            {scorePercentage}%
          </span>
          <Progress 
            value={scorePercentage} 
            className="h-1.5 w-12" 
            // @ts-ignore - custom color via CSS if needed, but default is fine
          />
        </div>
      </div>

      <div className="relative">
        <p className={cn(
          "text-xs text-muted-foreground leading-relaxed",
          !isExpanded && "line-clamp-3"
        )}>
          {chunk.content}
        </p>
        {chunk.content.length > 150 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 mt-1 text-[10px] font-medium text-primary hover:underline"
          >
            {isExpanded ? (
              <>收起 <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>展开全文 <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </Card>
  )
}
