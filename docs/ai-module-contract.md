# AI Module Contract

AI 模块负责把“用户自然语言指令 + 当前页面 DOM 摘要”转换成安全可注入的 CSS 规则。它不直接操作页面，不修改 Popup，不修改 Content Script。

## Owner

AI 模块负责人。

## Files

主要修改：

```text
utils/llm.ts
types/cleanweb.ts
docs/ai-module-contract.md
```

尽量不要修改：

```text
entrypoints/popup/App.vue
entrypoints/content.ts
wxt.config.ts
package.json
```

如果必须改这些文件，先和 core 模块负责人对齐。

## Public API

```ts
generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult>
```

输入：

```ts
interface GenerateCssInput {
  instruction: string;
  domSummary: DomSummaryItem[];
}
```

输出：

```ts
interface GenerateCssResult {
  css: string;
  explanation: string;
}
```

失败策略：

- 无 Key / API 请求失败 / 空响应 / 非 JSON / 护栏清空 → 一律抛清晰中文错误
  （background 走 error 态、popup 显示；content 拒绝注入；**不再静默套兜底 CSS**）。
- HTTP 状态由 `describeLlmError` 翻译成人话：
  401→"Key 无效"、402→"余额不足"、404→"端点或模型不存在"、429→"过于频繁"、
  5xx→"服务暂时不可用"，其它状态保留原文。
- 400 且服务端明确抱怨 `response_format` 时，去掉 `response_format` 重试一次；
  其他 4xx/5xx 不重试（重试也没用，见 6524cb4）。
- JSON 解析失败时不要把原始大段模型输出直接展示给用户。
- 返回的 CSS 不能为空；若被护栏剥光即抛错，不静默应用。

## DOM Summary Shape

```ts
interface DomSummaryItem {
  selector: string;
  tag: string;
  id?: string;
  className?: string;
  role?: string;
  ariaLabel?: string;
  text: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  visible: boolean;
}
```

## Model Output

模型必须只返回 JSON：

```json
{
  "css": ".sidebar, .ads { display: none !important; } main { max-width: 860px; margin: 0 auto; }",
  "explanation": "隐藏侧边栏和广告，优化正文阅读宽度"
}
```

## Prompt Rules

- 只能生成 CSS。
- 不生成 JS。
- 不生成 HTML。
- 不使用远程资源。
- 优先使用稳定选择器：`id`、`aria-label`、`role`、语义化 class。
- 避免过深的 `nth-child`。
- 尽量只影响干扰区域，不破坏登录、评论、按钮等交互。
- 必要时使用 `!important` 覆盖原网页样式。

## 降级 & 离线能力

- **整页净化** 与 **AI 修改** 属于"真 AI"路径:无 Key、API 请求失败(含 401/402/4xx/5xx)、
  空响应、非 JSON、或护栏把 CSS 全部剥光 → 一律抛中文错误,popup 显示,
  content 拒绝注入。**不再静默套兜底 CSS** —— 商店产品里假成功是不诚实的。
- **智能隐藏**是纯启发式(content 里沿父链选安全容器 → `display: none !important`),
  **无 Key 也能用**:点哪藏哪,不需要 AI 参与;AI 只在选择器精度上加价值。
  这与"无 Key 明确报错"的边界不冲突 —— 用户点中的目标被藏起来是可见、诚实的行为。
- HTTP 状态翻译集中在 `utils/llm-request.ts` 的 `describeLlmError`;只对
  400 + 明确抱怨 `response_format` 时走一次去 retry,其他 4xx/5xx 直接抛。

(早期"黑客松 fallback CSS"设计在 `21979b9` 中已废除;参考实现由
`utils/llm.test.ts` 里 7 条 mock 集成测试钉住。)

## Acceptance

AI 模块完成时需要满足：

```text
输入 instruction + domSummary
返回 { css, explanation }
css 能被 Content Script 直接注入
npm.cmd run build 通过
```

## Environment

当前实现支持 OpenAI-compatible Chat Completions API。用户可以在插件 Popup 的“设置”页填写 API Key、Base URL 和 Model；未配置 API Key 时，整页净化与 AI 修改会抛“请先配置 AI Key”的中文错误(引导去设置)，智能隐藏仍离线可用。

设置页推荐填写：

```text
API Key: sk-...
Base URL: https://example.com/v1
Model: gpt-4o-mini
```

如果使用兼容 OpenAI 的服务，把 Base URL 换成对应服务的 `/v1` 地址即可。也可以直接填写完整的 `/chat/completions` 地址。

开发时可用环境变量注入默认(仅在 `wxt.config.ts` 里通过 `define` 编译进 bundle，**上架商店的正式构建必须保持这三项为空**，让每个用户自己在设置里填 Key)：

```text
VITE_LLM_API_KEY=your_api_key
VITE_LLM_BASE_URL=https://example.com/v1
VITE_LLM_MODEL=gpt-4o-mini
```
