# GitHub Stars Group Manager - 设计文档

> 日期：2026-06-20
> 状态：已批准

## 概述

为 GitHub Stars 页面（`https://github.com/yuyunzhi2?tab=stars`，共 648 个 star 项目）提供分组管理功能。以 **Tampermonkey 油猴脚本**形式实现，通过 **GitHub API** 获取全量 stars 数据，在页面上注入自定义 UI 进行分组展示和管理。支持**自动推荐分组 + 手动调整**，数据通过 **JSON 文件导入导出**备份。

## 技术选型

| 项 | 选择 | 理由 |
|----|------|------|
| 形式 | Tampermonkey 油猴脚本 | 安装简单，无需构建，直接在 GitHub 页面运行 |
| 数据获取 | GitHub REST API（分页） | 648 个 stars 超出单页 DOM 范围，API 可一次性获取全量 |
| 数据存储 | GM_setValue / GM_getValue + JSON 导入导出 | 分组配置持久化到油猴存储；JSON 文件用于跨设备备份 |
| API 认证 | Personal Access Token（public_repo 权限） | 需要 Token 以提高 API 速率限制（认证后 5000 次/小时） |
| 展示方式 | Tab 切换 + 自定义卡片网格 | 直观，符合 GitHub 页面风格 |

## 核心模块

| 模块 | 职责 |
|------|------|
| **APIFetcher** | 通过 GitHub API 分页获取全部 starred repos（名称、描述、语言、topics、stars 数、更新时间） |
| **CacheManager** | 缓存 API 数据到 GM_setValue，避免每次刷新都请求 API；提供手动刷新按钮 |
| **GroupManager** | 分组 CRUD（创建、删除、重命名）+ 项目与分组的关联管理 |
| **AutoGrouper** | 基于关键词/语言/topics 自动推荐分组 |
| **SearchFilter** | 关键词搜索和筛选功能（按语言、按分组状态等） |
| **UIRenderer** | 渲染 Tab 栏、项目卡片网格、搜索栏、批量操作栏、分配弹窗 |
| **ImportExport** | JSON 文件导入导出 |

## 数据结构

### 分组配置（存储在 GM_setValue，key: `star_groups`）

```javascript
{
  "groups": {
    "g-1": {
      "name": "AI / LLM",
      "color": "#58a6ff",
      "repos": ["owner1/repo1", "owner2/repo2"]
    },
    "g-2": {
      "name": "前端开发",
      "color": "#3fb950",
      "repos": ["owner3/repo3"]
    }
  },
  "version": 1
}
```

### API 缓存数据（存储在 GM_setValue，key: `star_cache`）

```javascript
{
  "repos": [
    {
      "full_name": "owner/repo",
      "description": "...",
      "language": "Python",
      "topics": ["llm", "ai"],
      "stargazers_count": 1000,
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "fetched_at": 1700000000000,
  "total_count": 648
}
```

### 用户设置（存储在 GM_setValue，key: `star_settings`）

```javascript
{
  "github_token": "ghp_xxx",
  "items_per_page": 30,
  "sort_by": "updated",      // "updated" | "name" | "stars"
  "sort_order": "desc"        // "asc" | "desc"
}
```

## UI 设计

### 页面布局

```
┌──────────────────────────────────────────────────────┐
│  ⭐ Stars Group Manager  [🔄刷新] [📥导入] [📤导出] [⚙设置]  │
├──────────────────────────────────────────────────────┤
│  🔍 搜索框...          语言筛选▼   排序: 名称/更新时间▼   │
├──────────────────────────────────────────────────────┤
│  [All(648)] [AI/LLM(45)] [工具(32)] [+]新建分组     │
├──────────────────────────────────────────────────────┤
│  ☐ stanford-oval/storm       ☐ langchain-ai/langchain │
│    An LLM-powered...            Building LLM apps...   │
│    Python · ⭐ 12k              Python · ⭐ 89k        │
│    [AI/LLM ▼]                   [AI/LLM ▼]           │
│                                                      │
│  ☐ another-user/repo3        ☐ user4/repo4           │
│    ...                        ...                     │
│                                                      │
│  (选中 3 项)  [移动到▼] [从分组移除]                     │
├──────────────────────────────────────────────────────┤
│  ← 1 2 3 ... 22 →                                    │
└──────────────────────────────────────────────────────┘
```

### 关键 UI 组件

1. **工具栏**：顶部固定栏，包含刷新、导入、导出、设置按钮
2. **搜索和筛选栏**：关键词搜索 + 语言下拉筛选 + 排序选项
3. **Tab 栏**：显示所有分组 Tab + "All" Tab + 新建分组按钮。每个 Tab 显示分组名和数量。点击切换筛选。右键可编辑/删除分组。
4. **项目卡片**：自定义渲染的卡片列表，显示仓库名、描述、语言、star 数。每个卡片上有分组标签，点击可修改所属分组。左侧复选框支持批量选择。
5. **底部批量操作栏**：选中项目后出现，支持批量分配分组、批量移除。
6. **设置面板**：配置 GitHub Token、每页数量、排序设置、管理缓存。
7. **自动分组弹窗**：展示自动推荐结果，用户确认或调整后应用。

### 分页策略

- 自定义客户端分页，每页默认 30 个项目
- 数据已全量缓存，分页仅为 UI 层分页
- 筛选/搜索后分页数量动态更新

### 无 Token 降级

- 未配置 Token 时，提示用户输入 Token
- 提供"跳过，仅使用缓存"选项（使用上次缓存数据）
- 不提供"DOM 模式"降级（648 个 stars 不适合 DOM 解析）

## 自动分组算法

基于规则的关键词匹配：

```javascript
const DEFAULT_RULES = [
  {
    name: "AI / LLM",
    keywords: ["llm", "gpt", "transformer", "language model", "openai",
                "chatgpt", "ai", "machine learning", "deep learning", "nlp",
                "diffusion", "stable diffusion", "midjourney", "copilot"],
    topics: ["llm", "ai", "machine-learning", "nlp", "deep-learning"]
  },
  {
    name: "前端开发",
    keywords: ["react", "vue", "angular", "css", "javascript", "typescript",
                "frontend", "web", "component", "svelte", "next.js", "nuxt"],
    topics: ["react", "vue", "angular", "javascript", "typescript", "css", "svelte"]
  },
  {
    name: "后端开发",
    keywords: ["api", "server", "backend", "database", "redis", "postgres",
                "microservice", "rest", "graphql"],
    topics: ["api", "server", "database", "redis", "postgresql"]
  },
  {
    name: "开发工具",
    keywords: ["cli", "tool", "utility", "extension", "plugin", "vim",
                "neovim", "vscode", "editor", "terminal", "shell"],
    topics: ["cli", "tools", "vim", "vscode", "terminal"]
  },
  {
    name: "学习资源",
    keywords: ["tutorial", "course", "learning", "education", "book",
                "awesome", "cheatsheet", "guide"],
    topics: ["tutorial", "learning", "education"]
  },
  {
    name: "数据科学",
    keywords: ["data", "pandas", "numpy", "jupyter", "notebook", "visualization",
                "matplotlib", "plotly", "analytics"],
    topics: ["data-science", "jupyter", "visualization"]
  }
];
```

匹配逻辑：
1. 遍历每个 star 项目的 `full_name`、`description`、`topics`
2. 按关键词和 topics 匹配规则，计算匹配分数
3. 选择得分最高的分组（需达到最低分数阈值）
4. 无法匹配的放入"未分组"

用户可编辑规则（增删改关键词），规则也纳入 JSON 导出。

## JSON 导入导出格式

```json
{
  "version": 1,
  "exported_at": "2024-01-01T00:00:00Z",
  "username": "yuyunzhi2",
  "groups": {
    "g-1": {
      "name": "AI / LLM",
      "color": "#58a6ff",
      "repos": ["owner1/repo1", "owner2/repo2"]
    }
  },
  "auto_group_rules": [
    {
      "name": "AI / LLM",
      "keywords": ["llm", "gpt", "..."],
      "topics": ["llm", "ai", "..."]
    }
  ]
}
```

导入时提供选项：
- **覆盖**：完全替换当前分组配置
- **合并**：将导入的分组与现有分组合并，重复项目取并集

## 错误处理

- API 请求失败：显示错误信息，提供重试按钮
- Token 无效/过期：提示重新配置 Token
- API 速率限制：显示剩余次数，提示等待
- 网络离线：使用缓存数据，标记为"离线模式"

## 文件结构（单文件脚本，模块通过 IIFE 或 class 组织）

```
github-stars-group-manager.user.js   // 单文件 Tampermonkey 脚本
```

脚本内部结构：
- 顶部：UserScript 元信息块
- 样式区：`<style>` 标签注入
- 模块区：各模块 class 定义
- 初始化区：DOM 加载后的初始化逻辑
