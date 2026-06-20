# 项目约定

## 文件结构

- `github-stars-group-manager.user.js` — 唯一的产品文件，单文件 Tampermonkey 脚本
- `docs/superpowers/specs/` — 设计文档
- `docs/superpowers/plans/` — 实施计划（已完成，保留做参考）

## Tampermonkey 脚本开发红线

- **`@match` 无法匹配查询字符串**：`*` 通配符不跨越 `?`，要匹配 `?tab=stars` 需用 `@match https://github.com/*` + 脚本内部 `location.search` 判断
- **所有用到的 `GM_*` API 必须在 `@grant` 声明**：未声明的 GM_* 调用会抛 ReferenceError，静默杀死后续代码
- **GitHub DOM class 会变**：仓库卡片可能是 `.col-12.d-flex` 或 `.col-12.d-block`，选择器要同时匹配
- **GitHub Stars 页面结构**：`#user-profile-frame` 包含 Lists、搜索栏、`#user-starred-repos`、Starred topics；隐藏原始内容时用 `#user-profile-frame` 级别全隐藏，不要只隐藏 `#user-starred-repos` 的兄弟
- **防重复初始化**：Turbo/pjax 和 MutationObserver 会同时触发，需要 debounce + 已初始化检查

## 运行环境

- 用户：`yuyunzhi2`，643+ star 仓库
- API 端点：`https://api.github.com/users/yuyunzhi2/starred`
- 无 Token 时 60 次/小时，有 Token 5000 次/小时
