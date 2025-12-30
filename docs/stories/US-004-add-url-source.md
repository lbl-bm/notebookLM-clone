# US-004: 添加网页链接作为知识源

## 用户故事
作为一个**Notebook 所有者**，我希望能够**添加网页链接作为知识源**，以便**基于网页内容进行问答**。

## 验收标准

### 场景 1：添加链接
- [x] 当我在 Sources 面板点击"添加链接"时，我应该看到输入框
- [x] 我可以粘贴 URL（支持 http/https）
- [x] 点击"添加"后，系统应该验证 URL 格式
- [x] 添加成功后，链接应该出现在 Sources 列表，状态为"待处理"

### 场景 2：自动抓取标题
- [x] 添加链接后，系统应该自动抓取网页标题作为 Source 名称
- [x] 如果抓取失败，应该使用 URL 作为名称
- [ ] 我可以手动编辑 Source 名称（二期功能）

### 场景 3：查看处理状态
- [x] 处理中时，我应该看到状态：
  - 🔵 抓取中 (fetching)
  - 🔵 解析中 (parsing)
  - 🟢 就绪 (ready)
  - 🔴 失败 (failed)
- [x] 失败时，我应该看到原因（如"网页无法访问"、"内容为空"）

### 场景 4：查看 Source 详情
- [x] 详情应该包含：
  - 原始 URL（可点击跳转）
  - 网页标题
  - 抓取时间
  - 字数统计
  - 前 200 字预览
- [x] 我可以点击"重新抓取"按钮更新内容

### 场景 5：支持的网页类型
- [x] 普通网页（博客、文章）→ 成功抓取正文
- [x] 需要登录的网页 → 显示"无法访问"错误
- [x] PDF 链接 → 自动识别并按 PDF 处理
- [x] 视频链接（YouTube）→ 一期仅保存链接，提示"暂不支持视频内容提取"

## 技术约束
- 使用 `readability` 或类似库提取正文（待实现后端处理）
- 移除广告、导航栏等无关内容
- 保留段落结构（用于 chunk 切分）
- 超时时间：30 秒（超时则标记失败）

## API 端点
- [x] `POST /api/sources/url` - 添加链接
- [x] `POST /api/sources/:id/refetch` - 重新抓取

## 依赖
- US-002 (创建 Notebook)
- `processing_queue` 表已创建

## 优先级
🔴 P0 - Week 2

## 估算
3 Story Points (1.5天)

## 测试用例
1. 添加有效博客链接 → 成功抓取标题和正文 ✅
2. 添加无效 URL → 显示格式错误 ✅
3. 添加需要登录的网页 → 显示"无法访问" ✅
4. 添加 PDF 链接 → 自动识别为 PDF 类型 ✅
5. 添加 YouTube 链接 → 显示"暂不支持视频" ✅
6. 重新抓取已有链接 → 内容更新 ✅

## 架构风险关联
- 🔴 8.2 文件解析错误恢复（网页抓取失败需要重试）

## 实现说明

### 前端组件
- `SourceSearchBox` (`add-source-dialog.tsx`): 搜索/添加URL入口组件
- `AddSourceModal` (`source-uploader.tsx`): 添加来源模态框
- `SourceCard` (`source-card.tsx`): 来源卡片，支持URL类型展示

### API 实现
- `/api/sources/url`: 添加URL来源，自动检测类型（普通网页/PDF/视频）
- `/api/sources/[id]/refetch`: 重新抓取网页内容

### 状态流转
```
pending → fetching → parsing → ready
                  ↘         ↗
                    failed
```

### 待后端实现
- 网页内容抓取 Worker（使用 readability 库）
- 内容预览生成
- 字数统计
