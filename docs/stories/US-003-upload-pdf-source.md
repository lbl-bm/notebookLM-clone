# US-003: 上传 PDF 作为知识源

## 用户故事
作为一个**Notebook 所有者**，我希望能够**上传 PDF 文件作为知识源**，以便**基于文档内容进行问答**。

## 验收标准

### 场景 1：上传 PDF
- [ ] 当我在 Notebook 详情页左侧点击"上传文件"时，我应该看到文件选择器
- [ ] 我可以选择 PDF 文件（支持拖拽上传）
- [ ] 文件大小限制：≤ 50MB（超过时显示错误提示）
- [ ] 上传开始后，我应该看到进度条
- [ ] 上传完成后，文件应该出现在 Sources 列表，状态为"待处理"

### 场景 2：查看处理状态
- [ ] 上传后，Source 卡片应该显示状态 badge：
  - 🟡 待处理 (pending)
  - 🔵 解析中 (processing)
  - 🟢 就绪 (ready)
  - 🔴 失败 (failed)
- [ ] 处理中时，我应该看到进度提示（如"正在解析第 5/10 页"）
- [ ] 处理失败时，我应该看到错误原因和"重试"按钮

### 场景 3：查看 Source 详情
- [ ] 当我点击 Source 卡片时，我应该看到详情抽屉
- [ ] 详情应该包含：
  - 文件名、大小、页数
  - 上传时间
  - 处理日志（各阶段状态）
  - 前 200 字预览
- [ ] 如果处理失败，我应该看到详细错误信息

### 场景 4：删除 Source
- [ ] 当我点击"删除"时，我应该看到确认对话框
- [ ] 确认后，Source 应该从列表消失
- [ ] 后台应该删除：Storage 中的文件 + 数据库中的 chunks

### 场景 5：文件存储安全
- [ ] 我上传的文件应该存储在 `{myUserId}/{notebookId}/` 路径下
- [ ] 我无法访问其他用户上传的文件
- [ ] 文件 URL 应该是临时签名 URL（有效期 1 小时）

## 技术约束
- 使用 Supabase Storage 的 `notebook-sources` bucket (private)
- 文件路径：`{ownerId}/{notebookId}/{sourceId}_{timestamp}.pdf`
- RLS 策略：用户只能访问自己的文件
- 上传后立即写入 `processing_queue` 表（异步处理）

## API 端点
- `POST /api/sources/upload` - 上传文件
- `GET /api/sources/:id` - 查询状态
- `DELETE /api/sources/:id` - 删除 Source
- `POST /api/sources/:id/retry` - 重试失败的处理

## 依赖
- US-002 (创建 Notebook)
- Supabase Storage bucket 已创建
- RLS 策略已配置（见 ARCHITECTURE_RISKS 8.5）

## 优先级
🔴 P0 - Week 2

## 估算
5 Story Points (2.5天)

## 测试用例
1. 上传 5MB PDF → 成功上传，状态变为"待处理"
2. 上传 60MB PDF → 显示"文件过大"错误
3. 上传非 PDF 文件 → 显示"仅支持 PDF"错误
4. 上传后轮询状态 → 看到状态从 pending → processing → ready
5. 删除 Source → Storage 文件和 chunks 都被删除
6. 用户 A 尝试访问用户 B 的文件 URL → 403 错误

## 架构风险关联
- 🔴 8.2 文件解析错误恢复（必须实现 `processingLog`）
- 🔴 8.5 Storage 文件管理（必须配置 RLS）
