/**
 * Chat 面板组件
 * US-006: RAG 问答
 * 使用 Ant Design X 的 Bubble 和 Sender 组件
 */

"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Bubble, Sender } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import type { BubbleItemType } from "@ant-design/x";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  FileText,
  Globe,
  User,
  Bot,
  AlertCircle,
  Zap,
  Target,
  Check,
  Copy,
  Trash2,
} from "lucide-react";
import { Avatar, Tooltip, Popconfirm, Button as AntButton } from "antd";
import { useCitation, type Citation } from "./citation-context";
import dynamic from "next/dynamic";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  availableModels,
  getModelDisplayName,
  isLongCatModel,
} from "@/lib/config";

// 引入 markdown 样式
import "@ant-design/x-markdown/es/XMarkdown/index.css";

// 动态导入 RetrievalDetailsPanel (bundle-dynamic-imports)
const RetrievalDetailsPanel = dynamic(
  () =>
    import("./retrieval-details-panel").then(
      (mod) => mod.RetrievalDetailsPanel
    ),
  {
    loading: () => (
      <div className="p-4 text-sm text-muted-foreground">加载详情中...</div>
    ),
  }
);

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  citations?: unknown;
  answerMode?: string | null;
  retrievalDetails?: any;
}

interface ChatPanelProps {
  notebookId: string;
  initialMessages: Message[];
  selectedSourceIds?: string[];
}

export function ChatPanel({
  notebookId,
  initialMessages,
  selectedSourceIds,
}: ChatPanelProps) {
  const listRef = useRef<{
    nativeElement: HTMLDivElement;
    scrollBoxNativeElement: HTMLDivElement;
    scrollTo: (options: {
      key?: string | number;
      offset?: number;
      align?: "top" | "bottom" | "nearest";
    }) => void;
  } | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const { selectCitationByIndex, setCitations } = useCitation();
  const [chatMode, setChatModeState] = useState<string>("glm-4.7");
  const setChatMode = useCallback((value: string) => {
    setChatModeState(value);
    localStorage.setItem("chat-model", value);
  }, []);
  const { toast } = useToast();

  // 删除消息
  const handleDelete = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch(`/api/messages/${messageId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          throw new Error("删除失败");
        }

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        toast({
          title: "已删除",
          description: "消息已删除",
          variant: "success",
        });
      } catch (error) {
        toast({
          title: "操作失败",
          description: "无法删除消息",
          variant: "error",
        });
      }
    },
    [toast]
  );

  useEffect(() => {
    const stored = localStorage.getItem("chat-model");
    if (stored && availableModels.some((m) => m.id === stored)) {
      setChatModeState(stored);
    }
  }, []);

  // 加载建议问题（延迟 1.5s，避免阻塞页面初始加载）
  useEffect(() => {
    // 只有在没有消息时才加载建议问题
    if (messages.length > 0) return;

    const fetchSuggestions = async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/suggest`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestedQuestions(data.questions || []);
        }
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
      }
    };

    const timer = setTimeout(fetchSuggestions, 1500);
    return () => clearTimeout(timer);
  }, [notebookId, messages.length]);

  // 当 currentCitations 变化时，更新 context
  useEffect(() => {
    if (currentCitations.length > 0) {
      const indexed = currentCitations.map((c, i) => ({ ...c, index: i + 1 }));
      setCitations(indexed);
    }
  }, [currentCitations, setCitations]);

  // 转换为 Bubble.List 的 items 格式 (rerender-memo) - 依赖优化
  const bubbleItems: BubbleItemType[] = useMemo(
    () =>
      messages.map((msg) => {
        // 判断是否为无依据回复
        const isNoEvidence = msg.answerMode === "no_evidence";
        const citations = msg.citations as Citation[] | undefined;
        const hasCitations = citations && citations.length > 0;
        const retrievalDetails = msg.retrievalDetails;

        let footer: React.ReactNode = undefined;
        if (msg.role === "assistant") {
          footer = (
            <div className="space-y-2">
              {hasCitations && <CitationList citations={citations} />}
              {isNoEvidence && <NoEvidenceHint />}
              {retrievalDetails && (
                <div className="flex justify-end">
                  <Sheet>
                    <SheetTrigger asChild>
                      <AntButton
                        type="text"
                        size="small"
                        icon={<Search size={12} />}
                        className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        查看检索详情
                      </AntButton>
                    </SheetTrigger>
                    <SheetContent
                      side="right"
                      className="w-[400px] sm:w-[540px] p-0"
                    >
                      <SheetHeader className="p-4 border-b">
                        <SheetTitle className="flex items-center gap-2">
                          <Search className="w-5 h-5 text-primary" />
                          RAG 检索链路详情
                        </SheetTitle>
                      </SheetHeader>
                      <RetrievalDetailsPanel details={retrievalDetails} />
                    </SheetContent>
                  </Sheet>
                </div>
              )}
            </div>
          );
        }

        return {
          key: msg.id,
          role: msg.role === "user" ? "user" : "ai",
          content: msg.content,
          loading: msg.role === "assistant" && !msg.content && isLoading,
          footer,
        };
      }),
    [messages, isLoading]
  ); // 移除不必要的依赖

  // 自动滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      // 延迟滚动，确保 DOM 已更新，避免 installHook.js 报错
      const timer = setTimeout(() => {
        try {
          listRef.current?.scrollTo({ key: messages[messages.length - 1]?.id });
        } catch (e) {
          console.warn("Scroll to bottom failed:", e);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  // 发送消息
  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || isLoading) return;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: value.trim(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      // 创建 AI 消息占位
      const aiMessageId = `ai-${Date.now()}`;
      const aiMessage: Message = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            notebookId,
            selectedSourceIds,
            mode: chatMode,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = "请求失败";
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        // 检查是否是 JSON 响应（无依据情况）
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId
                ? {
                    ...m,
                    content: data.content,
                    citations: data.citations,
                    answerMode: data.answerMode,
                    retrievalDetails: data.retrievalDetails,
                  }
                : m
            )
          );
          setCurrentCitations(data.citations || []);
          return;
        }

        // 流式读取响应
        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取响应");

        const decoder = new TextDecoder();
        let fullContent = "";
        let citations: Citation[] = [];
        let retrievalDetails: any = null;
        let isLongCat = response.url.includes("longcat");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });

          // 检查是否包含 citations
          if (text.includes("__CITATIONS__")) {
            const parts = text.split("__CITATIONS__");
            fullContent += parts[0];

            const citationsMatch = text.match(
              /__CITATIONS__(.+?)__CITATIONS_END__/
            );
            if (citationsMatch) {
              try {
                const citationsData = JSON.parse(citationsMatch[1]);
                citations = citationsData.citations || [];
                retrievalDetails = citationsData.retrievalDetails || null;
              } catch (e) {
                console.error("解析 citations 失败:", e);
              }
            }
          } else {
            fullContent += text;
          }

          // LongCat 的内容在 reasoning_content 字段
          if (isLongCat) {
            const reasoningMatch = text.match(/"reasoning_content":"([^"]*)"/);
            if (reasoningMatch && reasoningMatch[1]) {
              fullContent = reasoningMatch[1];
            }
          }

          // 更新消息内容
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMessageId
                ? { ...m, content: fullContent, citations, retrievalDetails }
                : m
            )
          );

          // 更新当前 citations
          if (citations.length > 0) {
            setCurrentCitations(citations);
          }
        }
      } catch (error) {
        console.error("Chat error:", error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId
              ? { ...m, content: `错误: ${(error as Error).message}` }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, notebookId, selectedSourceIds, chatMode]
  );

  // Markdown 渲染器 - 支持内联引用标记
  const renderMarkdown = useCallback(
    (content: string, citations?: Citation[]) => {
      if (!content) return null;

      // 为 citations 添加索引
      const indexedCitations =
        citations?.map((c, i) => ({ ...c, index: i + 1 })) || [];

      return (
        <ContentWithCitations
          content={content}
          citations={indexedCitations}
          onCitationClick={selectCitationByIndex}
        />
      );
    },
    [selectCitationByIndex]
  );

  // 角色配置 (rerender-memo)
  const roles = useMemo(
    () => ({
      user: {
        placement: "end" as const,
        variant: "filled" as const,
        avatar: (
          <Avatar
            icon={<User size={16} />}
            style={{
              backgroundColor: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
            }}
          />
        ),
        contentRender: (content: string, info: { key?: string | number }) => (
          <div className="group relative pr-6">
            {content}
            <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Popconfirm
                title="删除这条消息？"
                onConfirm={() => handleDelete(info.key as string)}
                okText="删除"
                cancelText="取消"
                placement="topRight"
              >
                <button className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={12} />
                </button>
              </Popconfirm>
            </div>
          </div>
        ),
        styles: {
          content: {
            backgroundColor: "hsl(var(--muted))",
            color: "hsl(var(--foreground))",
            padding: "12px 16px",
            borderRadius: "12px",
            boxShadow: "none",
          },
        },
      },
      ai: {
        placement: "start" as const,
        variant: "outlined" as const,
        avatar: (
          <Avatar
            icon={<Bot size={16} />}
            style={{
              backgroundColor: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
            }}
          />
        ),
        contentRender: (content: string, info: { key?: string | number }) => {
          // 找到对应的消息获取 citations
          const msg = messages.find((m) => m.id === info.key);
          return (
            <div className="group relative pr-6">
              {renderMarkdown(
                content,
                msg?.citations as Citation[] | undefined
              )}
              <div className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Popconfirm
                  title="删除这条消息？"
                  onConfirm={() => handleDelete(info.key as string)}
                  okText="删除"
                  cancelText="取消"
                  placement="topLeft"
                >
                  <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={12} />
                  </button>
                </Popconfirm>
              </div>
            </div>
          );
        },
        styles: {
          content: {
            backgroundColor: "transparent",
            border: "none",
            padding: "0 16px",
            borderRadius: "0",
            maxWidth: "100%",
            boxShadow: "none",
          },
        },
      },
    }),
    [messages, renderMarkdown, handleDelete]
  );

  return (
    <Card className="h-full flex flex-col shadow-sm overflow-hidden">
      {/* 消息列表 - 固定高度，内部滚动 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {messages.length === 0 ? (
          <EmptyState
            suggestedQuestions={suggestedQuestions}
            onQuestionClick={handleSubmit}
          />
        ) : (
          <Bubble.List
            ref={listRef}
            items={bubbleItems}
            role={roles}
            autoScroll
            style={{
              height: "100%",
              padding: "16px",
              overflow: "auto",
            }}
            styles={{
              scroll: {
                height: "100%",
                overflow: "auto",
              },
            }}
          />
        )}
      </div>

      {/* 输入框 */}
      <div className="flex-shrink-0 border-t p-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w mx-auto">
          <div className="flex items-center justify-end mb-2">
            <ModelSelector
              value={chatMode}
              onChange={(value) => setChatMode(value as "fast" | "precise")}
              disabled={isLoading}
            />
          </div>
          <Sender
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            loading={isLoading}
            placeholder="输入你的问题... (Enter 发送)"
            className="rounded-xl border border-slate-200 bg-white shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 dark:border-slate-800 dark:bg-slate-900 [&_.ant-btn]:h-8 [&_.ant-btn]:w-8 [&_.ant-btn]:min-w-[32px] [&_.ant-btn]:rounded-lg"
          />
        </div>
      </div>
    </Card>
  );
}

function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-[240px]">
      <Select value={value} onValueChange={onChange} disabled={!!disabled}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <span className="flex items-center gap-1">
                {model.icon === "zap" ? (
                  <Zap className="h-3 w-3 text-yellow-500" />
                ) : (
                  <Target className="h-3 w-3 text-blue-500" />
                )}
                {model.displayName}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * 空状态
 */
function EmptyState({
  suggestedQuestions = [],
  onQuestionClick,
}: {
  suggestedQuestions?: string[];
  onQuestionClick: (q: string) => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-4">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
        <MessageSquare className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium mb-2 text-slate-900 dark:text-slate-50">
        开始对话
      </h3>
      <p className="text-slate-500 max-w-sm mb-8">
        添加资料后，你可以向 AI 提问关于这些资料的任何问题
      </p>

      {/* 建议问题 */}
      {suggestedQuestions.length > 0 && (
        <div className="flex flex-col gap-2 max-w-md w-full">
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => onQuestionClick(q)}
              className="text-sm text-left px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 引用列表 - 底部展示
 */
function CitationList({ citations }: { citations: Citation[] }) {
  const { selectCitation } = useCitation();
  // 按相似度排序
  const sortedCitations = [...citations].sort(
    (a, b) => b.similarity - a.similarity
  );

  return (
    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
      <span className="text-xs text-slate-500 w-full mb-1">参考来源：</span>
      {sortedCitations.map((citation, index) => (
        <CitationCard
          key={citation.id || index}
          citation={{ ...citation, index: index + 1 }}
          onClick={() => selectCitation({ ...citation, index: index + 1 })}
        />
      ))}
    </div>
  );
}

/**
 * 引用卡片
 */
function CitationCard({
  citation,
  onClick,
}: {
  citation: Citation;
  onClick: () => void;
}) {
  const { highlightedSourceId } = useCitation();
  const Icon = citation.sourceType === "file" ? FileText : Globe;
  const similarity = Math.round(citation.similarity * 100);
  const isHighlighted = highlightedSourceId === citation.sourceId;

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-2 p-2 bg-white rounded-lg border text-xs max-w-[260px] cursor-pointer transition-all ${
        isHighlighted
          ? "border-orange-400 ring-2 ring-orange-100 shadow-sm"
          : "border-slate-200 hover:border-orange-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="w-5 h-5 bg-orange-100 text-orange-700 rounded-full flex items-center justify-center text-xs font-medium">
          {citation.index}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="h-3 w-3 text-slate-400 flex-shrink-0" />
          <span className="font-medium text-slate-700 truncate">
            {citation.sourceTitle}
          </span>
          <span className="text-orange-500 flex-shrink-0 font-medium">
            {similarity}%
          </span>
        </div>
        {citation.metadata.page && (
          <span className="text-slate-400">第 {citation.metadata.page} 页</span>
        )}
      </div>
    </div>
  );
}

/**
 * 带引用标记的内容渲染
 * 使用 XMarkdown 渲染 Markdown，同时支持内联引用标记
 */
function ContentWithCitations({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations: Citation[];
  onCitationClick: (index: number) => void;
}) {
  // 自定义组件：将 [1] [2] 等标记渲染为可点击按钮
  const components = useMemo(
    () => ({
      // 自定义 text 节点处理
      p: ({ children, streamStatus, ...props }: any) => {
        return (
          <p {...props}>
            {processChildren(children, citations, onCitationClick)}
          </p>
        );
      },
      li: ({ children, streamStatus, ...props }: any) => {
        return (
          <li {...props}>
            {processChildren(children, citations, onCitationClick)}
          </li>
        );
      },
      span: ({ children, streamStatus, ...props }: any) => {
        return (
          <span {...props}>
            {processChildren(children, citations, onCitationClick)}
          </span>
        );
      },
    }),
    [citations, onCitationClick]
  );

  return (
    <div className="prose prose-sm prose-slate max-w-none dark:prose-invert">
      <XMarkdown content={content} components={components} openLinksInNewTab />
    </div>
  );
}

/**
 * 处理子节点，将 [1] [2] 等标记转换为可点击按钮
 */
function processChildren(
  children: React.ReactNode,
  citations: Citation[],
  onCitationClick: (index: number) => void
): React.ReactNode {
  if (typeof children === "string") {
    return processTextWithCitations(children, citations, onCitationClick);
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return (
          <span key={i}>
            {processTextWithCitations(child, citations, onCitationClick)}
          </span>
        );
      }
      return child;
    });
  }

  return children;
}

/**
 * 处理文本中的引用标记
 */
function processTextWithCitations(
  text: string,
  citations: Citation[],
  onCitationClick: (index: number) => void
): React.ReactNode {
  const parts = text.split(/(\[\d+\])/g);

  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1]);
      const citation = citations.find((c) => c.index === index);

      if (citation) {
        return (
          <Tooltip
            key={i}
            title={
              <div className="text-xs">
                <div className="font-medium">{citation.sourceTitle}</div>
                {citation.metadata.page && (
                  <div>第 {citation.metadata.page} 页</div>
                )}
              </div>
            }
          >
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCitationClick(index);
              }}
              className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-full mx-0.5 cursor-pointer transition-colors"
              style={{
                fontSize: "10px",
                lineHeight: 1,
                verticalAlign: "super",
              }}
            >
              {index}
            </button>
          </Tooltip>
        );
      }
      // 如果找不到对应的 citation，显示普通标记
      return (
        <span
          key={i}
          className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full mx-0.5"
          style={{ fontSize: "10px", lineHeight: 1, verticalAlign: "super" }}
        >
          {index}
        </span>
      );
    }
    return part;
  });
}

/**
 * 无依据提示
 */
function NoEvidenceHint() {
  return (
    <div className="flex items-start gap-2 mt-3 pt-3 border-t border-slate-200">
      <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-slate-500">
        <p className="font-medium text-amber-600">未找到相关依据</p>
        <p className="mt-1">建议上传更多资料或缩小问题范围</p>
      </div>
    </div>
  );
}
