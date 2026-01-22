import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Sparkles, Shield, Zap } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-muted/30">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center space-y-8 max-w-4xl mx-auto">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-xl">
              <BookOpen className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground">
              Personal NotebookLM
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground">
              AI 驱动的个人知识库管理系统
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              基于 RAG 技术，让你的文档、笔记和知识库变得可对话、可追溯、可生成
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" className="text-lg px-8">
              <Link href="/auth/login">
                <Sparkles className="mr-2 h-5 w-5" />
                开始使用
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-lg px-8">
              <Link href="/docs">
                查看文档
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>知识源导入</CardTitle>
              <CardDescription>
                支持 PDF、Word、网页链接等多种格式，自动解析并向量化
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>RAG 问答</CardTitle>
              <CardDescription>
                基于知识库的智能问答，每个回答都有引用来源，可追溯可验证
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-2 hover:border-primary/50 transition-colors">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle>智能产物生成</CardTitle>
              <CardDescription>
                一键生成大纲、测验、思维导图等结构化内容，提升学习效率
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Tech Stack */}
        <div className="mt-24 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            技术栈
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">Next.js 14</span>
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">Supabase</span>
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">Prisma 7</span>
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">pgvector</span>
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">智谱 AI</span>
            <span className="px-4 py-2 bg-card border rounded-full shadow-sm">Tailwind CSS</span>
          </div>
        </div>
      </div>
    </main>
  )
}
