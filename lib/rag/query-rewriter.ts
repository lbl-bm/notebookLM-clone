/**
 * M2b: 规则型查询改写
 *
 * 不调用 LLM，纯本地规则：
 * 1. 停用词过滤 → 关键词提取
 * 2. 同义词表 → 扩展查询
 */

import { ragStrategyConfig } from "@/lib/config";
import type { QueryRewriteDiagnostics } from "./types";

/**
 * 中文停用词（高频、低信息量词）
 */
const STOPWORDS = new Set([
  "的",
  "了",
  "在",
  "是",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "上",
  "也",
  "很",
  "到",
  "说",
  "要",
  "去",
  "你",
  "会",
  "着",
  "没有",
  "看",
  "好",
  "自己",
  "这",
  "他",
  "她",
  "吗",
  "把",
  "那",
  "它",
  "让",
  "吧",
  "但",
  "对",
  "给",
  "啊",
  "还",
  "可以",
  "能",
  "什么",
  "怎么",
  "如何",
  "哪些",
  "请问",
  "能否",
  "关于",
  "请",
  "谢谢",
  "告诉",
  "知道",
  "帮我",
  "帮忙",
]);

/**
 * 同义词表（双向映射）
 * key → value[] 表示 key 可以扩展为 value 中的词
 */
const SYNONYM_MAP: Record<string, string[]> = {
  // 技术领域
  机器学习: ["ML", "深度学习"],
  深度学习: ["DL", "神经网络", "机器学习"],
  人工智能: ["AI", "智能系统"],
  数据库: ["DB", "数据存储"],
  算法: ["方法", "策略"],
  性能: ["效率", "速度"],
  优化: ["改进", "提升"],
  架构: ["设计", "结构"],
  接口: ["API", "端点"],
  部署: ["上线", "发布"],
  缓存: ["cache", "暂存"],
  并发: ["并行", "多线程"],

  // 通用领域
  优点: ["优势", "好处", "长处"],
  缺点: ["劣势", "不足", "短板"],
  原因: ["因素", "缘由"],
  结果: ["效果", "影响"],
  方法: ["方式", "途径", "做法"],
  问题: ["难题", "挑战", "议题"],
  特点: ["特征", "特性"],
  区别: ["差异", "不同"],
  关系: ["联系", "关联"],
};

/**
 * 从查询中提取关键词
 * 移除停用词后保留有意义的词汇
 */
export function extractKeywords(query: string): string[] {
  // 简单分词：按空格和标点切分
  const tokens = query
    .replace(/[？?！!。.，,、；;：:（）()【】\[\]""'']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  // 过滤停用词
  const keywords = tokens.filter(
    (token) => !STOPWORDS.has(token) && token.length > 1,
  );

  // 去重
  return [...new Set(keywords)];
}

/**
 * 生成查询扩展
 * 基于同义词表为关键词生成替代查询
 */
export function generateExpansions(
  keywords: string[],
  maxExpansions?: number,
): string[] {
  const max = maxExpansions ?? ragStrategyConfig.maxQueryExpansions;
  const expansions: string[] = [];

  for (const keyword of keywords) {
    const synonyms = SYNONYM_MAP[keyword];
    if (synonyms) {
      for (const synonym of synonyms) {
        if (expansions.length >= max) break;
        // 用同义词替换关键词，生成扩展文本
        const expansion = keywords
          .map((k) => (k === keyword ? synonym : k))
          .join(" ");
        expansions.push(expansion);
      }
    }
    if (expansions.length >= max) break;
  }

  return expansions;
}

/**
 * 完整查询改写流程
 */
export function rewriteQuery(query: string): {
  keywords: string[];
  expansions: string[];
  diagnostics: QueryRewriteDiagnostics;
} {
  const startTime = Date.now();

  const keywords = extractKeywords(query);
  const expansions = generateExpansions(keywords);

  return {
    keywords,
    expansions,
    diagnostics: {
      originalQuery: query,
      keywords,
      expansions,
      durationMs: Date.now() - startTime,
    },
  };
}
