# UI 设计系统规范

> 基于 shadcn/ui (New York style) + Tailwind CSS 的设计系统，确保产品样式的一致性和美观性

## 📐 设计原则

1. **一致性优先**：所有组件必须使用 shadcn/ui，禁止自定义 HTML 元素样式
2. **语义化颜色**：使用 CSS 变量而非硬编码颜色值
3. **响应式设计**：所有页面必须支持移动端
4. **可访问性**：遵循 WCAG 2.1 AA 标准

---

## 🤖 组件库分工

### shadcn/ui（通用 UI）
用于所有非 AI 相关的界面组件：
- 按钮、输入框、卡片、对话框
- 导航、菜单、表单
- 布局、列表、表格

### Ant Design X（AI 交互）
用于所有 AI 相关的界面组件：
- 聊天气泡（Bubble）
- 对话列表（Conversations）
- 输入框（Sender）
- 建议问题（Prompts）
- 思考状态（ThoughtChain）
- 附件展示（Attachments）

```tsx
// AI 聊天相关组件使用 @ant-design/x
import { Bubble, Sender, Prompts, Conversations } from '@ant-design/x'

// 其他 UI 组件使用 shadcn/ui
import { Button, Card, Input } from '@/components/ui'
```

---

## 🎨 颜色系统

### 主题配置
- **Style**: `new-york` (shadcn/ui 官方风格)
- **Base Color**: `slate` (冷色调，专业感)
- **CSS Variables**: 启用（支持主题切换）

### 语义化颜色（必须使用）

```tsx
// ✅ 正确：使用语义化颜色
<div className="bg-primary text-primary-foreground">主要按钮</div>
<div className="bg-secondary text-secondary-foreground">次要内容</div>
<div className="bg-muted text-muted-foreground">弱化文本</div>
<div className="bg-destructive text-destructive-foreground">危险操作</div>

// ❌ 错误：硬编码颜色
<div className="bg-blue-600 text-white">主要按钮</div>
<div className="bg-gray-100 text-gray-600">次要内容</div>
```

### 可用颜色变量

| 变量名 | 用途 | 示例 |
|--------|------|------|
| `primary` | 主要操作、品牌色 | 登录按钮、CTA |
| `secondary` | 次要内容、背景 | 卡片背景 |
| `muted` | 弱化内容 | 辅助文本、禁用状态 |
| `accent` | 强调、高亮 | 选中状态 |
| `destructive` | 危险操作 | 删除按钮 |
| `border` | 边框 | 卡片边框、分割线 |
| `input` | 输入框边框 | 表单输入 |
| `ring` | 焦点环 | 键盘导航 |

### 状态颜色（自定义扩展）

```tsx
// 成功状态
<div className="bg-green-50 text-green-700 border-green-200">成功提示</div>

// 警告状态
<div className="bg-yellow-50 text-yellow-700 border-yellow-200">警告提示</div>

// 错误状态
<div className="bg-red-50 text-red-700 border-red-200">错误提示</div>
```

---

## 🧩 组件使用规范

### 1. Button 按钮

```tsx
import { Button } from '@/components/ui/button'

// 主要按钮
<Button>主要操作</Button>

// 次要按钮
<Button variant="secondary">次要操作</Button>

// 轮廓按钮
<Button variant="outline">取消</Button>

// 危险按钮
<Button variant="destructive">删除</Button>

// 幽灵按钮
<Button variant="ghost">更多</Button>

// 链接按钮
<Button variant="link">了解更多</Button>

// 尺寸
<Button size="sm">小按钮</Button>
<Button size="default">默认</Button>
<Button size="lg">大按钮</Button>

// 加载状态
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  加载中...
</Button>
```

### 2. Card 卡片

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
    <CardDescription>描述文本</CardDescription>
  </CardHeader>
  <CardContent>
    内容区域
  </CardContent>
  <CardFooter>
    底部操作
  </CardFooter>
</Card>
```

### 3. Input 输入框

```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

<div className="space-y-2">
  <Label htmlFor="email">邮箱</Label>
  <Input 
    id="email" 
    type="email" 
    placeholder="your@email.com"
  />
</div>

// 带图标的输入框
<div className="relative">
  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
  <Input className="pl-10" placeholder="邮箱" />
</div>
```

### 4. 其他常用组件

```tsx
// Badge 徽章
import { Badge } from '@/components/ui/badge'
<Badge>新</Badge>
<Badge variant="secondary">次要</Badge>
<Badge variant="destructive">错误</Badge>
<Badge variant="outline">轮廓</Badge>

// Alert 提示
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
<Alert>
  <AlertTitle>提示</AlertTitle>
  <AlertDescription>这是一条提示信息</AlertDescription>
</Alert>

// Separator 分割线
import { Separator } from '@/components/ui/separator'
<Separator />
<Separator orientation="vertical" />

// Skeleton 骨架屏
import { Skeleton } from '@/components/ui/skeleton'
<Skeleton className="h-4 w-full" />
```

---

## 📏 间距系统

### Tailwind 间距规范

```tsx
// ✅ 使用 Tailwind 间距类
<div className="space-y-4">      // 垂直间距 1rem
<div className="space-x-2">      // 水平间距 0.5rem
<div className="p-4">            // 内边距 1rem
<div className="px-6 py-3">      // 水平 1.5rem，垂直 0.75rem
<div className="gap-4">          // Grid/Flex 间距 1rem

// ❌ 避免硬编码
<div style={{ padding: '16px' }}>
```

### 常用间距值

| Class | 值 | 用途 |
|-------|-----|------|
| `space-y-2` | 0.5rem | 紧密元素 |
| `space-y-4` | 1rem | 常规间距 |
| `space-y-6` | 1.5rem | 区块间距 |
| `space-y-8` | 2rem | 大区块间距 |
| `p-4` | 1rem | 卡片内边距 |
| `px-6 py-3` | 1.5rem/0.75rem | 按钮内边距 |

---

## 🔤 字体系统

### 字体大小

```tsx
// 标题
<h1 className="text-4xl font-bold">主标题</h1>
<h2 className="text-3xl font-semibold">二级标题</h2>
<h3 className="text-2xl font-semibold">三级标题</h3>
<h4 className="text-xl font-medium">四级标题</h4>

// 正文
<p className="text-base">正文 (16px)</p>
<p className="text-sm">小字 (14px)</p>
<p className="text-xs">极小字 (12px)</p>

// 大字
<p className="text-lg">大字 (18px)</p>
<p className="text-xl">特大字 (20px)</p>
```

### 字重

```tsx
<span className="font-normal">常规 (400)</span>
<span className="font-medium">中等 (500)</span>
<span className="font-semibold">半粗 (600)</span>
<span className="font-bold">粗体 (700)</span>
```

---

## 🎭 图标系统

### 使用 Lucide React

```tsx
import { Mail, Lock, Github, Loader2, Check, X } from 'lucide-react'

// 标准尺寸
<Mail className="h-4 w-4" />      // 小图标 (16px)
<Mail className="h-5 w-5" />      // 中图标 (20px)
<Mail className="h-6 w-6" />      // 大图标 (24px)

// 带颜色
<Mail className="h-4 w-4 text-muted-foreground" />
<Check className="h-4 w-4 text-green-600" />

// 动画
<Loader2 className="h-4 w-4 animate-spin" />
```

---

## 📱 响应式设计

### 断点

```tsx
// Tailwind 默认断点
sm: 640px   // 手机横屏
md: 768px   // 平板
lg: 1024px  // 小屏笔记本
xl: 1280px  // 桌面
2xl: 1536px // 大屏

// 使用示例
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  // 手机 1 列，平板 2 列，桌面 3 列
</div>

<div className="text-sm md:text-base lg:text-lg">
  // 响应式字体大小
</div>
```

---

## 🌓 深色模式

### 使用方式

```tsx
// 自动适配深色模式
<div className="bg-background text-foreground">
  // 自动切换颜色
</div>

<div className="bg-card text-card-foreground border border-border">
  // 卡片自动适配
</div>

// 手动指定深色模式样式
<div className="bg-white dark:bg-slate-900">
  // 浅色模式白色，深色模式深灰
</div>
```

---

## 🚫 禁止事项

### ❌ 不要做的事情

1. **不要硬编码颜色**
```tsx
// ❌ 错误
<div className="bg-blue-600 text-white">

// ✅ 正确
<div className="bg-primary text-primary-foreground">
```

2. **不要使用原生 HTML 元素样式**
```tsx
// ❌ 错误
<button className="px-4 py-2 bg-blue-600 rounded">

// ✅ 正确
<Button>点击</Button>
```

3. **不要使用内联样式**
```tsx
// ❌ 错误
<div style={{ padding: '16px', color: '#333' }}>

// ✅ 正确
<div className="p-4 text-foreground">
```

4. **不要混用不同的设计系统**
```tsx
// ❌ 错误：混用 ant-design 和 shadcn/ui
import { Button as AntButton } from 'antd'
import { Button } from '@/components/ui/button'

// ✅ 正确：统一使用 shadcn/ui
import { Button } from '@/components/ui/button'
```

---

## 📦 页面布局模板

### 1. 认证页面布局

```tsx
<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
  <Card className="w-full max-w-md">
    <CardHeader>
      <CardTitle>标题</CardTitle>
      <CardDescription>描述</CardDescription>
    </CardHeader>
    <CardContent>
      {/* 内容 */}
    </CardContent>
  </Card>
</div>
```

### 2. 应用主页面布局

```tsx
<div className="min-h-screen bg-background">
  {/* Header */}
  <header className="border-b">
    <div className="container mx-auto px-4 py-4">
      {/* 导航 */}
    </div>
  </header>

  {/* Main Content */}
  <main className="container mx-auto px-4 py-8">
    {/* 内容 */}
  </main>
</div>
```

### 3. 三栏布局（Notebook 详情页）

```tsx
<div className="flex h-screen">
  {/* 左侧栏 - Sources */}
  <aside className="w-64 border-r bg-card">
    {/* Sources 列表 */}
  </aside>

  {/* 中间栏 - Chat */}
  <main className="flex-1 flex flex-col">
    {/* Chat 内容 */}
  </main>

  {/* 右侧栏 - Studio */}
  <aside className="w-80 border-l bg-card">
    {/* Studio 动作 */}
  </aside>
</div>
```

---

## ✅ 检查清单

在提交代码前，确保：

- [ ] 所有按钮使用 `<Button>` 组件
- [ ] 所有输入框使用 `<Input>` 和 `<Label>` 组件
- [ ] 所有卡片使用 `<Card>` 组件
- [ ] 颜色使用语义化变量（`primary`、`secondary` 等）
- [ ] 图标来自 `lucide-react`
- [ ] 间距使用 Tailwind 类（`space-y-4`、`p-4` 等）
- [ ] 支持深色模式（使用 CSS 变量）
- [ ] 响应式设计（使用 `md:`、`lg:` 等断点）
- [ ] 无内联样式
- [ ] 无硬编码颜色值

---

## 📚 参考资源

- [shadcn/ui 官方文档](https://ui.shadcn.com)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev)
- [Radix UI](https://www.radix-ui.com) (shadcn/ui 底层)
