/**
 * RAG Prompt 组装模块
 */

import { RetrievedChunk } from "./retriever";
import { ragStrategyConfig } from "@/lib/config";

/**
 * 问题类型枚举
 */
export enum QuestionType {
  FACTUAL = "factual", // 事实查询型
  SUMMARY = "summary", // 总结归纳型
  ANALYTICAL = "analytical", // 分析推理型
  COMPARATIVE = "comparative", // 对比型
  GENERAL = "general", // 通用型
}

/**
 * System Prompt - 事实查询型
 */
export const FACTUAL_SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 只使用参考资料中的信息回答，不要编造内容
2. 精确直接回答问题，不要添加无关信息
3. 必须在回答中使用引用标记，格式为 [1]、[2] 等，对应参考资料的编号
4. 引用标记应该放在相关句子或段落的末尾
5. 如果参考资料中没有相关信息，请明确告知用户

示例：
用户问“什么是机器学习？”
回答：“机器学习是人工智能的一个分支，它使计算机能够从数据中学习并改进性能[1]。”`;

/**
 * System Prompt - 总结归纳型
 */
export const SUMMARY_SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 整合多个来源的信息，提供全面的总结
2. 使用分点列出要点，结构化呈现内容
3. 在每个要点后标注引用来源 [1]、[2] 等
4. 确保覆盖所有重要信息，不遗漏关键点
5. 如果信息来自多个来源，请综合归纳

示例：
用户问“总结一下机器学习的主要内容”
回答：“机器学习的主要内容包括：\n1. 定义：人工智能的一个分支[1]\n2. 主要方法：监督学习、无监督学习、强化学习[2]\n3. 应用领域：图像识别、自然语言处理、推荐系统[3]”`;

/**
 * System Prompt - 分析推理型
 */
export const ANALYTICAL_SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 分析参考资料中的信息，给出逻辑清晰的推理过程
2. 先阐述事实，再进行分析，最后得出结论
3. 在每个逻辑步骤后标注引用来源 [1]、[2] 等
4. 如果需要多步推理，请分步骤说明
5. 区分事实和推论，明确标注哪些是推断

示例：
用户问“为什么机器学习在图像识别中效果好？”
回答：“机器学习在图像识别中效果好的原因包括：\n1. 事实：机器学习能够从大量数据中学习特征[1]\n2. 分析：图像包含丰富的像素特征，适合特征学习[2]\n3. 结论：因此通过大量样本训练，机器学习可以学会识别图像中的复杂模式[3]”`;

/**
 * System Prompt - 对比型
 */
export const COMPARATIVE_SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 使用表格或分点形式进行对比，结构化呈现
2. 突出差异和相似之处，分别说明
3. 在每个对比点后标注引用来源 [1]、[2] 等
4. 保持对比的平衡性，不要偏向某一方
5. 如果参考资料中没有相关信息，请明确告知

示例：
用户问“对比监督学习和无监督学习”
回答：“监督学习和无监督学习的对比：

差异：
- 数据标注：监督学习需要标注数据[1]，无监督学习不需要[2]
- 应用场景：监督学习用于分类任务[1]，无监督学习用于聚类任务[2]

相似：
- 都是机器学习的主要方法[3]
- 都需要大量数据训练[3]”`;

/**
 * System Prompt - 通用型（默认）
 */
export const SYSTEM_PROMPT = `你是一个专业的知识助手。请基于以下参考资料回答用户的问题。

规则：
1. 只使用参考资料中的信息回答，不要编造内容
2. 如果参考资料中没有相关信息，请明确告知用户
3. 在回答中使用引用标记，格式为 [1]、[2] 等，对应参考资料的编号
4. 引用标记应该放在相关句子或段落的末尾
5. 使用清晰、专业的语言
6. 如果问题不明确，可以请求用户澄清

示例：
用户问"什么是机器学习？"
回答："机器学习是人工智能的一个分支，它使计算机能够从数据中学习并改进性能[1]。常见的机器学习方法包括监督学习、无监督学习和强化学习[2]。"`;

/**
 * 问题类型分类器
 * 基于关键词匹配判断问题类型
 */
export function classifyQuestion(question: string): QuestionType {
  const q = question.toLowerCase();

  // 事实查询型关键词
  const factualKeywords = [
    "什么是",
    "定义",
    "解释",
    "含义",
    "指的是",
    "what is",
    "define",
    "explain",
    "如何",
    "怎么",
    "怎样",
    "how to",
    "how do",
  ];

  // 总结归纳型关键词
  const summaryKeywords = [
    "总结",
    "概括",
    "归纳",
    "简述",
    "整理",
    "列举",
    "summarize",
    "sum up",
    "overview",
    "主要内容",
    "核心要点",
    "关键点",
  ];

  // 分析推理型关键词
  const analyticalKeywords = [
    "为什么",
    "原因",
    "分析",
    "推断",
    "推理",
    "为何",
    "why",
    "reason",
    "analyze",
    "如何解释",
    "如何理解",
    "如何证明",
  ];

  // 对比型关键词
  const comparativeKeywords = [
    "对比",
    "比较",
    "区别",
    "不同",
    "相同",
    "差异",
    "compare",
    "contrast",
    "difference",
    "vs",
    "和...",
    "与...",
    "相比",
    "相较",
    "优劣",
  ];

  // 计算匹配分数
  let factualScore = factualKeywords.filter((k) => q.includes(k)).length;
  let summaryScore = summaryKeywords.filter((k) => q.includes(k)).length;
  let analyticalScore = analyticalKeywords.filter((k) => q.includes(k)).length;
  let comparativeScore = comparativeKeywords.filter((k) =>
    q.includes(k),
  ).length;

  // 选择分数最高的类型
  const maxScore = Math.max(
    factualScore,
    summaryScore,
    analyticalScore,
    comparativeScore,
  );

  if (maxScore === 0) {
    return QuestionType.GENERAL; // 无明显特征，使用通用型
  }

  if (factualScore === maxScore) return QuestionType.FACTUAL;
  if (summaryScore === maxScore) return QuestionType.SUMMARY;
  if (analyticalScore === maxScore) return QuestionType.ANALYTICAL;
  if (comparativeScore === maxScore) return QuestionType.COMPARATIVE;

  return QuestionType.GENERAL;
}

/**
 * 根据问题类型选择 System Prompt
 */
export function getSystemPromptByType(questionType: QuestionType): string {
  switch (questionType) {
    case QuestionType.FACTUAL:
      return FACTUAL_SYSTEM_PROMPT;
    case QuestionType.SUMMARY:
      return SUMMARY_SYSTEM_PROMPT;
    case QuestionType.ANALYTICAL:
      return ANALYTICAL_SYSTEM_PROMPT;
    case QuestionType.COMPARATIVE:
      return COMPARATIVE_SYSTEM_PROMPT;
    case QuestionType.GENERAL:
    default:
      return SYSTEM_PROMPT;
  }
}

/**
 * 无依据时的回复
 */
export const NO_EVIDENCE_RESPONSE = `抱歉，我在您的资料中没有找到与这个问题相关的信息。

建议：
- 上传更多相关资料
- 尝试用不同的方式描述您的问题
- 检查已上传的资料是否包含相关内容`;

/**
 * M1: 证据约束规则（附加到所有 System Prompt 之后）
 * 强制 LLM 将结论绑定到证据编号
 */
const EVIDENCE_CONSTRAINT_RULES = `

## 证据约束（必须遵守）

1. 每个事实性陈述后必须标注引用来源编号 [N]。
2. 不允许做出参考资料中没有的事实性陈述。如果需要推理，必须明确标注"根据资料推断"。
3. 如果参考资料不足以回答问题，请在回答末尾加上不确定性声明："⚠️ 以上回答基于有限的资料，可能不够完整。"
4. 禁止仅为"凑字数"而添加无来源的扩展信息。`;

/**
 * M1: 不确定场景的谨慎回答约束
 * 用于 medium 置信度场景
 */
const UNCERTAIN_EVIDENCE_RULES = `

## 重要提示：证据可能不充分

检索到的参考资料与问题的相关度一般。请严格遵守以下规则：
1. 只回答参考资料中明确包含的信息，用引用标记 [N] 标注。
2. 对于资料中没有直接提及的内容，不要推测或补充。
3. 在回答末尾必须加上说明："⚠️ 以上回答基于有限的参考资料，部分信息可能不够完整，建议补充更多相关资料。"
4. 如果资料完全无法回答问题，直接告知用户需要更多资料。`;

/**
 * M1: 降级回复模板 - 用于校验未通过或 uncertain 无法回答的场景
 */
export const FALLBACK_RESPONSE = `根据目前已有的参考资料，我无法为这个问题提供一个完全有据可循的回答。

以下是资料中与该问题可能相关的信息，供参考：

⚠️ 建议您上传更多相关资料，以便获得更准确的回答。`;

/**
 * 组装上下文
 */
export function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "（暂无参考资料）";
  }

  const sections = chunks.map((chunk, index) => {
    const sourceInfo =
      chunk.sourceType === "file" && chunk.metadata.page
        ? `${chunk.sourceTitle} (第 ${chunk.metadata.page} 页)`
        : chunk.sourceTitle;

    // 使用 [1], [2] 等编号，方便 LLM 引用
    return `### [${index + 1}] ${sourceInfo}
${chunk.content}
---
相关度: ${Math.round(chunk.similarity * 100)}%`;
  });

  return `## 参考资料

${sections.join("\n\n")}`;
}

/**
 * 组装完整的消息列表
 * 支持动态 Prompt 选择 + M1 证据约束
 */
export function buildMessages(params: {
  chunks: RetrievedChunk[];
  userQuestion: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  useDynamicPrompt?: boolean; // 是否启用动态 Prompt
  confidenceLevel?: "low" | "medium" | "high"; // 置信度等级
  retrievalDecision?: "grounded" | "uncertain" | "no_evidence"; // M1: 检索决策
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const {
    chunks,
    userQuestion,
    chatHistory = [],
    useDynamicPrompt = true,
    confidenceLevel,
    retrievalDecision,
  } = params;

  const context = buildContext(chunks);

  // 选择 System Prompt
  let systemPrompt = SYSTEM_PROMPT;
  if (useDynamicPrompt) {
    const questionType = classifyQuestion(userQuestion);
    systemPrompt = getSystemPromptByType(questionType);
  }

  // M1: 附加证据约束规则
  if (ragStrategyConfig.evidenceConstraintEnabled) {
    if (retrievalDecision === "uncertain" || confidenceLevel === "medium") {
      // 不确定场景：使用更严格的约束
      systemPrompt += UNCERTAIN_EVIDENCE_RULES;
    } else {
      // 正常场景：附加基础证据约束
      systemPrompt += EVIDENCE_CONSTRAINT_RULES;
    }
  } else {
    // 未启用证据约束时保持旧逻辑
    if (confidenceLevel === "medium") {
      systemPrompt += `\n\n注意：检索到的参考资料相关度可能一般。请在回答时保持谨慎，如果资料不足以完全回答问题，请在回答中说明不确定性，不要强行编造。`;
    }
  }

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: systemPrompt }];

  // 添加历史对话（最近 6 条）
  const recentHistory = chatHistory.slice(-6);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 添加当前问题（带上下文）
  messages.push({
    role: "user",
    content: `${context}\n\n## 用户问题\n${userQuestion}`,
  });

  return messages;
}

/**
 * Citation 数据结构
 */
export interface Citation {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: "file" | "url";
  content: string; // 前 150 字
  similarity: number;
  metadata: {
    page?: number;
    chunkIndex: number;
    startChar: number;
    endChar: number;
  };
}

/**
 * 从检索结果生成 Citations
 * 包含去重逻辑：相同内容（前 100 字相同）只保留相似度最高的
 */
export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  // 按相似度降序排序
  const sortedChunks = [...chunks].sort((a, b) => b.similarity - a.similarity);

  // 使用 Map 去重，key 为内容前 100 字的 hash
  const seen = new Map<string, Citation>();

  for (const chunk of sortedChunks) {
    // 使用内容前 100 字作为去重 key
    const contentKey = chunk.content.slice(0, 100).trim();

    // 如果已存在相同内容，跳过（因为已按相似度排序，先出现的相似度更高）
    if (seen.has(contentKey)) {
      continue;
    }

    const citation: Citation = {
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      sourceType: chunk.sourceType,
      content:
        chunk.content.slice(0, 150) + (chunk.content.length > 150 ? "..." : ""),
      similarity: chunk.similarity,
      metadata: {
        page: chunk.metadata.page,
        chunkIndex: chunk.chunkIndex,
        startChar: chunk.metadata.startChar,
        endChar: chunk.metadata.endChar,
      },
    };

    seen.set(contentKey, citation);
  }

  // 返回去重后的 citations，保持相似度降序
  return Array.from(seen.values());
}
