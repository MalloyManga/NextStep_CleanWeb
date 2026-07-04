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

- API 失败时抛出带清晰 message 的错误，或者返回 fallback CSS。
- JSON 解析失败时不要把原始大段模型输出直接展示给用户。
- 返回的 CSS 不能为空。

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

## Fallback

黑客松演示必须准备 fallback。建议至少内置一条通用规则：

```css
aside,
[class*="sidebar"],
[class*="ad"],
[class*="recommend"] {
  display: none !important;
}

main,
article {
  max-width: 860px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  font-size: 18px !important;
  line-height: 1.8 !important;
}
```

## Acceptance

AI 模块完成时需要满足：

```text
输入 instruction + domSummary
返回 { css, explanation }
css 能被 Content Script 直接注入
npm.cmd run build 通过
```

## Environment

当前实现支持 OpenAI-compatible Chat Completions API。用户可以在插件 Popup 的“设置”页填写 API Key、Base URL 和 Model；没有配置 API Key 时，会自动返回 fallback CSS，保证演示不中断。

设置页推荐填写：

```text
API Key: sk-...
Base URL: https://api.openai.com/v1
Model: gpt-4o-mini
```

如果使用兼容 OpenAI 的服务，把 Base URL 换成对应服务的 `/v1` 地址即可。也可以直接填写完整的 `/chat/completions` 地址。

开发时仍可使用环境变量作为 fallback：

```text
WXT_LLM_API_KEY=your_api_key
WXT_LLM_BASE_URL=https://api.openai.com/v1
WXT_LLM_MODEL=gpt-4o-mini
```
