# GitHub Stars Group Manager

Tampermonkey 油猴脚本，为 GitHub Stars 页面添加分组管理功能。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 打开 [`github-stars-group-manager.user.js`](./github-stars-group-manager.user.js)
3. Tampermonkey 会自动弹出安装提示，点击"安装"
4. 访问 `https://github.com/<username>?tab=stars` 即可使用

## 功能

- **分组管理** — 创建/删除/重命名分组，拖拽式分配仓库到分组
- **自动分组** — 基于关键词/语言/topics 自动推荐分组（AI、前端、后端、工具、学习、数据科学 6 大类）
- **Tab 切换** — 点击分组 Tab 快速筛选，支持"全部"和"未分组"视图
- **搜索筛选** — 按仓库名/描述搜索，按语言筛选，按名称/更新时间/Stars 排序
- **批量操作** — 勾选多个仓库批量移动分组或移除
- **JSON 导入导出** — 备份和恢复分组配置，支持覆盖和合并两种模式
- **API 缓存** — 自动缓存 GitHub API 数据，24 小时过期

## 配置 GitHub Token（推荐）

未配置 Token 时 API 限额仅 60 次/小时，配置后提升至 5000 次/小时：

1. 前往 [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. 生成新 Token，勾选 `public_repo` 权限
3. 在脚本设置面板中粘贴 Token

## 技术细节

- **数据获取**：GitHub REST API `GET /users/{username}/starred`，分页 `per_page=100`
- **数据存储**：`GM_setValue` / `GM_getValue`（Tampermonkey 本地存储）
- **API 速率**：无 Token 60 次/小时，有 Token 5000 次/小时
- **兼容性**：支持 Turbo/pjax SPA 导航，自动防重复初始化

## 项目结构

```
github-stars-group-manager.user.js   # 单文件 Tampermonkey 脚本（~2500 行）
docs/
  superpowers/
    specs/    # 设计文档
    plans/    # 实施计划
```

## 已知问题

- GitHub 页面显示的 Stars 计数可能比 API 实际返回的多（页面计数包含 Lists 中的重复项，API 返回的是去重后的真实 star 数）
- 无 Token 时分页请求可能触发速率限制，建议配置 Token
