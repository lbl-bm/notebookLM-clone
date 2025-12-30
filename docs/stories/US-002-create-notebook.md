# US-002: 创建和管理 Notebook

## 用户故事
作为一个**已登录用户**，我希望能够**创建、重命名和删除 Notebook**，以便**组织不同主题的知识库**。

## 验收标准

### 场景 1：创建 Notebook
- [ ] 当我在首页点击"新建 Notebook"按钮时，我应该看到创建对话框
- [ ] 我可以输入 Notebook 名称（必填，1-100 字符）
- [ ] 点击"创建"后，新 Notebook 应该出现在列表顶部
- [ ] 我应该被自动导航到新创建的 Notebook 详情页

### 场景 2：重命名 Notebook
- [ ] 当我点击 Notebook 卡片的"更多"菜单时，我应该看到"重命名"选项
- [ ] 点击"重命名"后，我应该看到输入框，预填充当前名称
- [ ] 修改名称并保存后，列表中的名称应该立即更新
- [ ] 如果输入为空或超过 100 字符，我应该看到验证错误

### 场景 3：删除 Notebook
- [ ] 当我点击"删除"选项时，我应该看到确认对话框
- [ ] 确认对话框应该显示警告："删除后无法恢复，包括所有对话和资料"
- [ ] 确认删除后，Notebook 应该从列表中消失
- [ ] 如果我当前在该 Notebook 详情页，我应该被重定向到首页

### 场景 4：权限隔离
- [ ] 我只能看到我自己创建的 Notebook
- [ ] 我无法访问其他用户的 Notebook（即使知道 ID）
- [ ] 尝试访问他人 Notebook 时，我应该看到 403 错误页面

## 技术约束
- 所有 Notebook 必须绑定 `ownerId`（来自 Supabase Auth）
- API 必须在服务端校验 `ownerId`（Prisma 默认绕过 RLS）
- 删除 Notebook 时必须级联删除关联的 Sources、Messages、Artifacts、document_chunks

## API 端点
- `POST /api/notebooks` - 创建
- `PATCH /api/notebooks/:id` - 重命名
- `DELETE /api/notebooks/:id` - 删除
- `GET /api/notebooks` - 列表（含最近打开）

## 依赖
- US-001 (用户登录)
- Prisma schema 中的 Notebook 模型

## 优先级
🔴 P0 - Week 1

## 估算
3 Story Points (1.5天)

## 测试用例
1. 创建 Notebook "AI 学习笔记" → 成功创建并跳转
2. 创建空名称 Notebook → 显示验证错误
3. 重命名 Notebook → 列表立即更新
4. 删除 Notebook → 确认后从列表消失
5. 用户 A 尝试访问用户 B 的 Notebook → 403 错误
6. 删除 Notebook 后检查数据库 → 关联数据已清除
