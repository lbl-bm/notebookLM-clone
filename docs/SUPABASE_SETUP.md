# Supabase 配置指南

## 1. 获取 Supabase API Keys

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目（或创建新项目）
3. 进入 **Settings** → **API**
4. 复制以下密钥：
   - **Project URL**: `https://[your-project-ref].supabase.co`
   - **Publishable Key** (新格式，以 `sb_publishable_` 开头)
   - **Secret Key** (新格式，以 `sb_secret_` 开头)

## 2. 获取数据库连接字符串

1. 在 Supabase Dashboard 主页，点击右上角的 **"Connect"** 按钮（绿色按钮）
2. 在弹出的对话框中，选择 **"ORMs"** 标签
3. 选择 **"Prisma"**
4. 会显示两个连接字符串示例：

### DATABASE_URL (Transaction Pooler)
- 用于应用运行时的数据库查询
- 端口: `6543`
- 包含 `?pgbouncer=true` 参数
- 格式示例:
  ```
  postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
  ```

### DIRECT_URL (Session Pooler)
- 用于 Prisma 迁移和数据库管理
- 端口: `5432`
- 不包含 pgbouncer 参数
- 格式示例:
  ```
  postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
  ```

## 3. 更新 .env.local

将获取的值填入 `.env.local` 文件：

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_[your-key]
SUPABASE_SECRET_KEY=sb_secret_[your-key]

# Prisma 数据库连接
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@...6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@...5432/postgres
```

## 4. 初始化数据库

运行以下命令创建数据库表：

```bash
# 生成 Prisma Client
npm run db:generate

# 推送数据库 schema（开发环境）
npm run db:push

# 或者运行迁移（生产环境）
npm run db:migrate
```

注意：Prisma 7 使用项目根目录的 `prisma.config.ts` 文件来配置数据库连接，而不是在 `schema.prisma` 中配置。

## 5. 验证连接

运行测试脚本验证 Supabase 连接：

```bash
npx tsx scripts/test-supabase.ts
```

如果看到 `✅ Supabase 连接成功!`，说明配置正确。

## 6. 创建 Storage Bucket

为了支持文件上传功能，需要创建 Storage bucket：

1. 在 Supabase Dashboard 中，进入 **Storage**
2. 点击 **New bucket**
3. 创建名为 `notebook-sources` 的 bucket：
   - Name: `notebook-sources`
   - Public bucket: **关闭**（私有）
   - File size limit: `50MB`
   - Allowed MIME types: `application/pdf`

### 配置 RLS 策略

在 **Storage** → **Policies** 中，为 `notebook-sources` bucket 添加以下策略：

#### 方法 1：使用 UI 界面（推荐）

1. 点击 **New Policy**
2. 选择 **For full customization**

**上传策略 (INSERT)**:
- Policy name: `Users can upload to their own folder`
- Allowed operation: `INSERT`
- Policy definition (WITH CHECK):
```sql
bucket_id = 'notebook-sources' AND
auth.uid()::text = (storage.foldername(name))[1]
```

**读取策略 (SELECT)**:
- Policy name: `Users can read their own files`
- Allowed operation: `SELECT`
- Policy definition (USING):
```sql
bucket_id = 'notebook-sources' AND
auth.uid()::text = (storage.foldername(name))[1]
```

**删除策略 (DELETE)**:
- Policy name: `Users can delete their own files`
- Allowed operation: `DELETE`
- Policy definition (USING):
```sql
bucket_id = 'notebook-sources' AND
auth.uid()::text = (storage.foldername(name))[1]
```

#### 方法 2：使用 SQL Editor（如果 UI 不工作）

如果你需要使用 SQL Editor，进入 **SQL Editor** 并执行：

```sql
-- 上传策略
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notebook-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 读取策略
CREATE POLICY "Users can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'notebook-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 删除策略
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'notebook-sources' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

**注意**: 
- 在 Storage Policies UI 中，不要包含 `CREATE POLICY` 语句
- 只需要填写 `WITH CHECK` 或 `USING` 后面的条件表达式
- 文件路径格式为: `{userId}/{notebookId}/{sourceId}_{timestamp}.pdf`
- `storage.foldername(name)[1]` 提取路径的第一部分（userId）

## 7. 启用 Supabase 扩展（可选）

如果需要使用向量搜索功能，需要在 Supabase 中启用 pgvector 扩展：

1. 在 Supabase Dashboard 中，进入 **Database** → **Extensions**
2. 搜索 `vector`
3. 启用 `vector` 扩展

## 常见问题

### Q: 找不到 Publishable/Secret Key？
A: 新格式的密钥在 2024 年推出。如果你的项目较旧，可能只有 `anon` 和 `service_role` key。这两种格式都可以使用：
- `anon key` = `publishable key`（客户端使用）
- `service_role key` = `secret key`（服务端使用）

### Q: 数据库连接失败？
A: 检查以下几点：
1. 密码是否正确（Supabase 会自动生成复杂密码）
2. 是否选择了正确的连接模式（Transaction vs Session）
3. 防火墙是否允许连接
4. 项目是否处于暂停状态（免费版会自动暂停）

### Q: Prisma 迁移失败？
A: 确保使用 `DIRECT_URL` 而不是 `DATABASE_URL` 进行迁移。Transaction pooler 不支持某些迁移操作。

## 安全提示

⚠️ **重要**: 
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 可以暴露在客户端（有 RLS 保护）
- `SUPABASE_SECRET_KEY` 绝对不能暴露在客户端代码中
- 不要将 `.env.local` 提交到 Git
- 生产环境使用环境变量管理工具（如 Vercel Environment Variables）
