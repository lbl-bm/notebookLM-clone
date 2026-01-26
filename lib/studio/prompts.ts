/**
 * Studio Prompt 模板
 * US-008: Studio 动作生成产物
 */

export const SUMMARY_PROMPT = `你是一个专业的内容摘要助手。请基于以下资料生成一份结构化摘要。

要求：
1. 提取核心主题和关键要点（3-5个）
2. 使用 Markdown 格式
3. 保持客观准确，不添加资料中没有的信息
4. 摘要长度控制在 300 字
5. 根据资料语言自动选择输出语言

输出格式：
## 内容摘要

### 核心主题
[一句话概括主题]

### 关键要点
1. **[要点一]**：[说明]
2. **[要点二]**：[说明]
3. **[要点三]**：[说明]

### 总结
[总结性陈述]

---
以下是参考资料：
{context}`

export const OUTLINE_PROMPT = `你是一个专业的知识整理助手。请基于以下资料生成一份结构化大纲。

要求：
1. 提取主要主题和子主题
2. 使用层级结构（最多 3 级）
3. 每个要点简洁明了
4. 使用 Markdown 格式
5. 根据资料语言自动选择输出语言

输出格式：
## 知识大纲

### 一、[主题一]
- 1.1 [子主题]
  - 要点说明
- 1.2 [子主题]

### 二、[主题二]
...

---
以下是参考资料：
{context}`

export const QUIZ_PROMPT = `你是一个专业的教育测验设计师。请基于以下资料生成 5-10 道选择题。

要求：
1. 题目覆盖资料的主要知识点
2. 每题 4 个选项（A/B/C/D）
3. 难度适中，考察理解而非记忆
4. 提供详细解析
5. 根据资料语言自动选择输出语言

输出格式（严格 JSON，不要有其他内容）：
{
  "title": "知识测验",
  "questions": [
    {
      "id": "q1",
      "question": "问题内容？",
      "options": ["A. 选项一", "B. 选项二", "C. 选项三", "D. 选项四"],
      "answer": "A",
      "explanation": "解析：正确答案是 A，因为..."
    }
  ]
}

---
以下是参考资料：
{context}`

export const MINDMAP_PROMPT = `你是一个专业的知识可视化助手。请基于以下资料生成一份思维导图结构。

要求：
1. 提取核心概念作为根节点
2. 按逻辑关系组织子节点（最多 4 级）
3. 每个节点标签简洁（不超过 15 字）
4. 可选添加节点描述（详细说明）
5. 每个父节点下最多 6 个子节点
6. 根据资料语言自动选择输出语言

输出格式（严格 JSON，不要有其他内容）：
{
  "title": "知识结构图",
  "root": {
    "id": "root",
    "label": "核心主题",
    "description": "主题的详细说明",
    "children": [
      {
        "id": "1",
        "label": "分支一",
        "description": "分支说明",
        "children": [
          { "id": "1-1", "label": "子节点", "description": "说明" }
        ]
      }
    ]
  }
}

---
以下是参考资料：
{context}`

// Map-Reduce 模式的 Prompt
export const MAP_PROMPTS: Record<string, string> = {
  summary: `请为以下来源 "{source_title}" 提取 3-5 个关键要点：

{content}

输出格式：
- 要点1：...
- 要点2：...
- 要点3：...`,

  outline: `请为以下来源 "{source_title}" 提取主要主题和结构：

{content}

输出格式：
### {source_title}
- 主题1
  - 子主题
- 主题2`,

  quiz: `请基于以下来源 "{source_title}" 生成 2-3 道选择题（JSON 格式）：

{content}

输出 JSON 数组格式的题目。`,

  mindmap: `请为以下来源 "{source_title}" 提取核心概念和关系：

{content}

输出格式：
- 核心概念：...
- 子概念1：...
- 子概念2：...`,
}

export const REDUCE_PROMPTS: Record<string, string> = {
  summary: `请将以下多个来源的要点合并为一份完整的结构化摘要：

{intermediate_results}

输出格式：
## 内容摘要
### 核心主题
...
### 关键要点
1. ...
2. ...
### 总结
...`,

  outline: `请将以下多个来源的结构合并为一份完整的知识大纲：

{intermediate_results}

输出格式：
## 知识大纲
### 一、...
### 二、...`,

  quiz: `请将以下题目整合为一份完整的测验（5-10题，JSON格式）：

{intermediate_results}

输出严格 JSON 格式：
{
  "title": "知识测验",
  "questions": [...]
}`,

  mindmap: `请将以下概念整合为一份思维导图结构（JSON格式）：

{intermediate_results}

输出严格 JSON 格式：
{
  "title": "知识结构图",
  "root": { "id": "root", "label": "...", "children": [...] }
}`,
}

export type ArtifactType = 'summary' | 'outline' | 'quiz' | 'mindmap'

export function getPrompt(type: ArtifactType): string {
  const prompts: Record<ArtifactType, string> = {
    summary: SUMMARY_PROMPT,
    outline: OUTLINE_PROMPT,
    quiz: QUIZ_PROMPT,
    mindmap: MINDMAP_PROMPT,
  }
  return prompts[type]
}
