# CleanWeb

让网页变干净，像拍照时去掉路人一样简单。

CleanWeb 是一款浏览器扩展，帮你把臃肿、嘈杂的网页变成专注、清爽的阅读版本。不管是广告栏、推荐流、悬浮窗，还是把正文居中放大，只要一句话、或者点一下，它就能自动帮你整理。

---

## 能做什么

### 整页净化

在弹窗里输入一句话，比如：

> 隐藏右侧推荐和广告，把正文居中放大

CleanWeb 会分析当前页面结构，AI 生成 CSS 规则，立即让页面变清爽。规则会保存到当前站点，下次访问自动生效。

### 精准选择

不想写指令？直接点。

点击"进入元素选择模式"，鼠标在页面上悬停时会出现高亮框，点击你想处理的元素，会出现操作浮层：

- **智能隐藏**：AI 自动判断最合理的隐藏范围，避免误删正文
- **AI 修改**：输入你的要求，比如"把这个栏目变小一点""把背景换成浅色"

### 规则管理

所有为当前站点生成的规则都保存在"规则"Tab 里：

- 查看每条规则的作用说明
- 一键启用 / 禁用
- 删除单条规则
- 展开查看并编辑生成的 CSS
- 点击"恢复"还原页面原貌

---

## 怎么配置 AI

第一次使用如果没有配置 AI Key，插件会显示提示横幅，点击"去设置"即可：

- **API Key**：你的 LLM API 密钥
- **Base URL**：OpenAI 兼容服务的地址，例如 `https://api.openai.com/v1`
- **Model**：模型 ID，例如 `gpt-4o-mini`、`deepseek-v4-flash`

支持所有兼容 OpenAI `/v1/chat/completions` 的服务。

---

## 技术栈

- WXT + Vue 3 + TypeScript
- Tailwind CSS v4
- Chrome Extension Manifest V3
- OpenAI 兼容的 LLM API

---

## 👨‍💻 本地开发

如果你想自己修改或调试这个插件：

```bash
# 安装依赖
npm install

# 启动开发模式（会生成一个可直接加载的扩展目录）
npm run dev
```

然后按 WXT 提示，在 Chrome 扩展管理页面加载生成的扩展目录即可调试。

---

## 项目结构

```
entrypoints/
  popup/App.vue          # 扩展弹窗界面
  content.ts             # 页面脚本：DOM 扫描、CSS 注入、元素选择器
  background.ts          # 后台服务：处理 AI 请求

utils/
  dom-summary.ts         # DOM 摘要采集与选择器生成
  storage.ts             # 规则按站点存储
  llm.ts                 # LLM 调用与规则生成

types/cleanweb.ts        # 类型定义
```

---

## 设计原则

- 只生成 CSS，不注入或执行 JavaScript
- 优先使用稳定选择器，避免误伤页面核心功能
- 规则按站点持久化，自动生效，随时可恢复
