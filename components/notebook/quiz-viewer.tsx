/**
 * 测验查看器组件
 * US-008: 可交互的测验界面
 */

'use client'

import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import type { Quiz } from '@/lib/studio/parser'

interface QuizViewerProps {
  quiz: Quiz
}

export function QuizViewer({ quiz }: QuizViewerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showResults, setShowResults] = useState<Record<string, boolean>>({})

  // 计算得分
  const score = useMemo(() => {
    let correct = 0
    quiz.questions.forEach((q) => {
      if (answers[q.id] === q.answer) {
        correct++
      }
    })
    return correct
  }, [answers, quiz.questions])

  const totalAnswered = Object.keys(answers).length
  const allAnswered = totalAnswered === quiz.questions.length

  // 选择答案
  const handleSelect = (questionId: string, option: string) => {
    if (showResults[questionId]) return // 已显示结果，不能修改

    const answer = option.charAt(0) // 取 A/B/C/D
    setAnswers((prev) => ({ ...prev, [questionId]: answer }))
    setShowResults((prev) => ({ ...prev, [questionId]: true }))
  }

  // 重新测验
  const handleReset = () => {
    setAnswers({})
    setShowResults({})
  }

  return (
    <div className="space-y-4">
      {/* 标题和得分 */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{quiz.title}</h3>
        {allAnswered && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              得分: {score}/{quiz.questions.length}
            </span>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              重新测验
            </Button>
          </div>
        )}
      </div>

      {/* 题目列表 */}
      <div className="space-y-4">
        {quiz.questions.map((question, index) => {
          const userAnswer = answers[question.id]
          const isAnswered = showResults[question.id]
          const isCorrect = userAnswer === question.answer

          return (
            <Card key={question.id} className="p-4">
              {/* 题目 */}
              <div className="flex items-start gap-2 mb-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </span>
                <p className="text-sm font-medium">{question.question}</p>
              </div>

              {/* 选项 */}
              <div className="space-y-2 ml-8">
                {question.options.map((option) => {
                  const optionLetter = option.charAt(0)
                  const isSelected = userAnswer === optionLetter
                  const isCorrectOption = question.answer === optionLetter

                  let optionClass = 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                  if (isAnswered) {
                    if (isCorrectOption) {
                      optionClass = 'border-green-500 bg-green-50'
                    } else if (isSelected && !isCorrect) {
                      optionClass = 'border-red-500 bg-red-50'
                    } else {
                      optionClass = 'border-slate-200 opacity-60'
                    }
                  } else if (isSelected) {
                    optionClass = 'border-blue-500 bg-blue-50'
                  }

                  return (
                    <button
                      key={option}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${optionClass}`}
                      onClick={() => handleSelect(question.id, option)}
                      disabled={isAnswered}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option}</span>
                        {isAnswered && isCorrectOption && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {isAnswered && isSelected && !isCorrect && (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* 解析 */}
              {isAnswered && (
                <div className={`mt-3 ml-8 p-3 rounded-lg text-sm ${
                  isCorrect ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  <p className="font-medium mb-1">
                    {isCorrect ? '✓ 回答正确' : '✗ 回答错误'}
                  </p>
                  <p>{question.explanation}</p>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* 底部得分统计 */}
      {allAnswered && (
        <Card className="p-4 bg-slate-50">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {score}/{quiz.questions.length}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              正确率 {Math.round((score / quiz.questions.length) * 100)}%
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
