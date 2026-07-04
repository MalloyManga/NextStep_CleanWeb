# CleanWeb 扩展运行模型说明

> 写给对接 Codex 的队长：为什么 LLM 调用必须放在 Background Service Worker 里，而不是 Content Script 里。

## 1. 三个运行环境的区别

CleanWeb 是一个基于 WXT + Manifest V3 的 Chrome 扩展，代码运行在三个完全不同的环境里：

| 环境 | 所属域 | 能否访问 DOM | 能否直接调用 OpenAI API | 生命周期 |
|------|--------|-------------|------------------------|----------|
| **Content Script** | 目标网页的域（如 `https://csdn.net`） | ✅ 能，直接操作 | ❌ 大概率会被 CORS 拦截 | 随页面注入，页面刷新就重新加载 |
| **Popup** | `chrome-extension://<id>` | ❌ 不能直接访问，只能通过消息让 Content Script 操作 | ✅ 可以，几乎没有 CORS 限制 | 每次点击图标打开，关闭即销毁 |
| **Background (Service Worker)** | `chrome-extension://<id>` | ❌ 不能直接访问，只能通过 API 间接操作 | ✅ 可以，几乎没有 CORS 限制 | 浏览器按需启动/休眠，可以长期保持状态 |

## 2. 为什么 Content Script 不能调 OpenAI API

Content Script 虽然是由扩展注入的，但它运行在**目标网页的 JavaScript 执行上下文**中。

当 Content Script 发起 `fetch` 或 `XMLHttpRequest` 时，浏览器会把它当作**来自目标网页的请求**来处理：

- 受目标网页的 `Content-Security-Policy` 限制
- 受目标网页的 CORS 限制（例如 CSDN 的页面可能不允许向 `api.openai.com` 发请求）
- 某些页面会 hook 或拦截全局 `fetch`

实际表现：在 Popup 里可以正常访问 OpenAI，但在 Content Script 里同样的代码会报 `CORS error` 或 `net::ERR_BLOCKED_BY_CLIENT`。

## 3. 为什么 Background 是调 OpenAI 的最佳位置

Background Service Worker 运行在扩展自己的域里，不受任何目标网页策略影响：

- 没有 CORS 限制
- 没有 CSP 限制
- 不会因为页面刷新/关闭而中断网络请求
- 可以安全地保存和读取配置、缓存状态

因此，CleanWeb 的 LLM 调用统一放在 Background 里：

```
Content Script 只负责：
  1. 扫描 DOM
  2. 显示 Picker / Toolbar / 面板
  3. 把用户选中的元素上下文发到 Background
  4. 拿到返回的 CSS 后注入页面
  5. 保存规则到 storage

Background 只负责：
  1. 接收来自 Content Script 的消息
  2. 调用 generateSmartHideRule / generateAiModifyRule
  3. 使用 OpenAI SDK 向 LLM 发起请求
  4. 把结果返回给 Content Script

Popup 只负责：
  1. 接收用户输入的页面级指令
  2. 收集当前页面的 DOM 摘要（通过消息发给 Content Script）
  3. 调用 generateCssRule（可以在 Popup 里直接调用，也可以转发给 Background）
  4. 让用户设置 API Key、Base URL、Model
```

## 4. 当前实现的消息流

### 4.1 元素级智能隐藏

```text
用户点击页面元素
  ↓
Content Script 收集 SelectedElementContext
  ↓
browser.runtime.sendMessage({ type: 'CLEANWEB_SMART_HIDE', context })
  ↓
Background 接收 → generateSmartHideRule(context) → OpenAI API
  ↓
返回 { ok: true, result: { selector, css, explanation } }
  ↓
Content Script 注入 CSS 并保存规则
```

### 4.2 元素级 AI 修改

```text
用户在输入框写指令
  ↓
Content Script 收集 SelectedElementContext + instruction
  ↓
browser.runtime.sendMessage({ type: 'CLEANWEB_AI_MODIFY', instruction, context })
  ↓
Background 接收 → generateAiModifyRule({ instruction, context }) → OpenAI API
  ↓
返回 { ok: true, result: { css, explanation } }
  ↓
Content Script 注入 CSS 并保存规则
```

### 4.3 页面级全局清理（Popup）

```text
用户在 Popup 输入指令
  ↓
Popup 发消息给 Content Script 收集 DOM 摘要
  ↓
Content Script 返回 DomSummaryItem[]
  ↓
Popup 调用 generateCssRule({ instruction, domSummary, settings })
  ↓
Popup 把生成的 CSS 发回 Content Script 注入并保存
```

目前 Popup 里的 `generateCssRule` 是直接调用的，也可以改成转发给 Background，效果一样。但这里不存在 CORS 问题，所以两种方式都可以。

## 5. 配置读取策略

所有 LLM 调用的配置优先级统一为：

```text
调用时传入的 settings > 扩展 storage 里的用户设置 > .env 开发环境变量 > 硬编码默认值
```

配置统一在 `utils/llm.ts` 的 `resolveConfig()` 里解析，不需要在 Content Script 和 Background 之间传递 apiKey。

## 6. 给队长的对接建议

如果你用 Codex 继续修改，请记住：

- **不要在 Content Script 里直接 `new OpenAI(...)` 或 `fetch` OpenAI API。**
- 如果需要在页面里做 LLM 相关的事，走 `browser.runtime.sendMessage` 让 Background 处理。
- Background 的 log 在 `chrome://extensions/` → 点击 Service Worker 查看。
- Content Script 的 log 在目标网页的 DevTools → 切换到 Content Script 上下文查看。
- Popup 的 log 在右键扩展图标 → Inspect popup 里查看。

## 7. 相关文件

- `entrypoints/content.ts` — Picker、Toolbar、DOM 收集、CSS 注入
- `entrypoints/background.ts` — 接收消息、调用 LLM
- `entrypoints/popup/App.vue` — 页面级指令入口
- `utils/llm.ts` — LLM 调用函数、配置解析
- `utils/dom-summary.ts` — DOM 摘要和元素上下文收集
- `types/cleanweb.ts` — 消息类型定义
- `utils/storage.ts` — 规则和用户配置存储
