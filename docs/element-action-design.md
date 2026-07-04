# 精准选择操作方案

本文档记录 CleanWeb 在“精准选择”模式下，用户选中网页元素后出现的两个操作按钮：

```text
智能隐藏
AI 修改
```

这两个按钮显示在网页内部，靠近用户点击位置，而不是显示在浏览器插件 Popup 里。

## 交互入口

用户在 Popup 中点击：

```text
精准选择 -> 进入元素选择模式
```

然后在网页中进入类似 DevTools 审查元素的选择状态：

```text
鼠标悬停元素 -> 显示 hover 高亮
点击元素 -> 锁定目标区域
目标附近出现两个操作按钮：智能隐藏 / AI 修改
```

## 按钮一：智能隐藏

智能隐藏不是简单地对用户点击的 DOM 节点执行：

```css
display: none;
```

原因是用户很容易点到内部元素。例如一个广告卡片可能结构是：

```text
外层容器 div.card
  内层图片 div.image
  内层文字 div.title
```

如果用户点中了 `div.title`，只隐藏 title 会留下空白卡片，页面仍然难看。

因此智能隐藏应该做的是：

```text
根据用户点击元素，向上分析父级链，判断真正应该隐藏的容器。
```

### 输入信息

智能隐藏需要收集：

```text
当前点击元素
父级链，建议 3-5 层
兄弟元素摘要
每一层的 selector
每一层的 tag / id / class / role / aria-label
每一层的 boundingClientRect
每一层的可见文本前 80 字
```

### 第一版启发式

AI 未接入前，可以先用启发式判断目标：

```text
1. 不允许隐藏 html / body / main / article
2. 不隐藏面积超过视口 70% 的大容器
3. 如果父级和当前元素视觉面积接近，优先提升到父级
4. 如果父级 class/id 命中 container / wrapper / card / item / ad / recommend / sidebar 等信号，优先考虑父级
5. 最终高亮即将隐藏的真实目标，让用户感知插件隐藏的是哪一块
```

### AI 增强版

后续可以让 AI 参与判断真正要隐藏的 selector：

```text
selected element + ancestor chain + sibling summary -> AI 返回 bestSelector
```

期望输出：

```json
{
  "selector": ".recommend-card",
  "css": ".recommend-card { display: none !important; }",
  "reason": "用户点击的是推荐卡片内部标题，外层卡片才是应该隐藏的完整干扰区域"
}
```

### 保存规则

智能隐藏生成的 CSS 应该和整页净化规则一样保存到当前 hostname：

```text
hostname -> css rules
```

刷新后自动生效，恢复按钮可以删除当前站点规则。

## 按钮二：AI 修改

AI 修改用于局部改造选中的网页区域。

它和整页净化的区别是：

```text
整页净化：用户不选择元素，AI 看页面结构摘要，生成全局 CSS
AI 修改：用户先选择元素，AI 只看该元素附近上下文，生成局部 CSS
```

### 交互形态

用户点击选中元素附近的 AI 按钮后，在网页内浮出一个小输入框：

```text
让这个输入框更大一点
让这个区域更清爽
让这个按钮更明显
弱化这个模块，不要影响正文
```

用户提交后：

```text
收集目标元素上下文
调用 AI
生成 CSS
注入页面
保存规则
```

### 输入信息

AI 修改不应该喂完整 DOM，只喂局部上下文：

```text
选中元素摘要
父级链 3-5 层
兄弟元素摘要
元素 rect
元素 selector 候选
元素附近文本
用户局部指令
```

示例：

```json
{
  "instruction": "让这个输入框更大一点",
  "selected": {
    "selector": "input.search-input",
    "tag": "input",
    "className": "search-input",
    "rect": { "x": 320, "y": 72, "width": 180, "height": 32 },
    "text": ""
  },
  "ancestors": [
    {
      "selector": "div.search-box",
      "tag": "div",
      "className": "search-box",
      "rect": { "x": 300, "y": 64, "width": 240, "height": 48 }
    }
  ],
  "siblings": []
}
```

### AI 输出

AI 只返回 JSON：

```json
{
  "css": "input.search-input { width: 320px !important; height: 40px !important; font-size: 16px !important; }",
  "explanation": "放大搜索输入框，提升可点击和可输入区域"
}
```

规则：

```text
只能生成 CSS
不能生成 JS
不能生成 HTML
不能引用远程资源
尽量只影响选中元素或其合理父容器
必要时使用 !important
```

## 为什么不做多个固定按钮

之前讨论过“隐藏 / 强调 / 放大”三个按钮，但最终不推荐这样做。

原因：

```text
强调和放大边界模糊
不同网页元素需要的修改方式不固定
固定按钮越多，产品越散
```

最终收敛为两个按钮更清晰：

```text
智能隐藏：确定性强，适合快速清理干扰
AI 修改：开放式，适合用户描述局部改造意图
```

## 当前优先级

推荐实现顺序：

```text
1. 选择元素 hover 高亮
2. 点击元素后显示操作浮层
3. 智能隐藏启发式版本
4. 隐藏规则保存与恢复
5. AI 修改输入框
6. 局部上下文摘要
7. AI 修改生成 CSS
```

黑客松阶段最小闭环：

```text
选择元素 -> 智能隐藏 -> 保存 -> 刷新后仍生效 -> 恢复
```

