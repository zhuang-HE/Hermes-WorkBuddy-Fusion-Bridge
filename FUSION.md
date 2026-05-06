# Hermes + WorkBuddy 融合体系

## 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                   Fusion Router                         │
│            智能任务路由·自动分工                          │
│                                                         │
│        ┌──────────────┐        ┌──────────────┐        │
│        │   Hermite    │ ←MCP→ │  WorkBuddy    │        │
│        │   Bridge     │        │   Bridge      │        │
│        └──────┬───────┘        └──────┬───────┘        │
└───────────────┼───────────────────────┼────────────────┘
                │                       │
     ┌──────────▼──────┐     ┌──────────▼──────┐
     │   Hermes        │     │   WorkBuddy     │
     │   83 Skills     │     │   50 Skills     │
     │   10 WB Tools   │     │   13 HM Tools   │
     │   Ollama 本地   │     │   量化+金融     │
     └─────────────────┘     └─────────────────┘
```

## 融合能力矩阵

| 能力 | WorkBuddy | Hermes | 融合后 |
|------|-----------|--------|--------|
| 技术分析/量化 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 文档/报告 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Skill 管理 | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| 浏览器自动化 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 文件操作 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 定时任务 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| MySQL/SQLite | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| 本地模型推理 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

## 调用方式

### 方式一：Fusion CLI（命令行）
```bash
node fusion-cli.js "分析腾讯控股技术面"
node fusion-cli.js "打开百度搜索AI新闻"
```

### 方式二：WorkBuddy 直连 Hermes
```
@hermite hermes_status
@hermite hermes_skills_list
@hermite hermes_chat 分析一下今天的股市
```

### 方式三：Hermes 直连 WorkBuddy
```
# 在 Hermes 会话中
workbuddy_skills_list
workbuddy_memory_list
workbuddy_tushare_test
```

## 任务分配规则

| 任务类型 | 路由到 | 示例 |
|----------|--------|------|
| 量化分析 | WorkBuddy | 技术分析、选股、回测 |
| Skill/文档 | WorkBuddy | 创建技能、写报告 |
| 浏览器操作 | Hermes | 打开网页、表单填写 |
| 文件管理 | Hermes | 搜索/删除/重命名文件 |
| 定时任务 | Hermes | 每日数据同步 |
| 复杂协作 | Fusion | 跨系统分析+执行 |

## 文件清单

| 文件 | 用途 |
|------|------|
| `~/.workbuddy/mcp-servers/hermite-bridge/index.js` | WorkBuddy → Hermes |
| `~/.workbuddy/mcp-servers/workbuddy-bridge/index.js` | Hermes → WorkBuddy |
| `~/.workbuddy/mcp-servers/fusion-cli.js` | 智能路由 |

## 下一步

- [ ] Fusion 自动化 workflow（自动跨系统协作）
- [ ] 融合 Dashboard（统一状态监控）
- [ ] 记忆同步（双系统记忆互通）
- [ ] 一键部署脚本
