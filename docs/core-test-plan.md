# Core Flow Test Plan

Core 模块不需要等 AI 完成后再测试。当前 Popup 里的测试 CSS 就是 core 模块的 mock AI 输出。

## Goal

验证插件主流程：

```text
打开网页 -> 打开插件 -> 读取页面 -> 应用 CSS -> 页面变化 -> 刷新仍生效 -> 恢复原网页
```

## Before Testing

启动开发服务：

```bash
npm.cmd run dev
```

在 Chrome 扩展管理页加载 WXT 输出目录：

```text
.output/chrome-mv3
```

## Test 1: Popup Loads

步骤：

```text
1. 打开任意网页
2. 点击 CleanWeb 插件图标
```

通过标准：

```text
Popup 能打开
能看到指令输入框
能看到 CSS 文本框
能看到读取页面、应用并保存、恢复按钮
```

## Test 2: DOM Summary

步骤：

```text
1. 打开一个普通内容页
2. 点击“读取页面”
```

通过标准：

```text
Popup 显示“已读取 N 个可见元素”
N 大于 0
```

## Test 3: Apply CSS

步骤：

```text
1. 保持默认测试 CSS
2. 点击“应用并保存”
```

通过标准：

```text
页面上的侧边栏、推荐区或广告类元素被隐藏
正文区域样式发生变化
Popup 显示“规则已应用并保存”
```

如果当前页面没有对应元素，可以临时把 CSS 改成：

```css
body {
  background: #fff7d6 !important;
}
```

再点击应用，观察页面背景是否变化。

## Test 4: Auto Apply Saved Rule

步骤：

```text
1. 应用并保存规则
2. 刷新当前网页
```

通过标准：

```text
刷新后规则仍然生效
不需要重新点击应用按钮
```

## Test 5: Reset

步骤：

```text
1. 点击“恢复”
2. 刷新当前网页
```

通过标准：

```text
当前页面恢复原样
刷新后规则不再自动应用
```

## Test 6: Build

步骤：

```bash
npm.cmd run build
```

通过标准：

```text
构建成功
.output/chrome-mv3 生成扩展文件
```

## Core Done Definition

Core 模块完成标准：

```text
不接 AI，也能完整演示网页净化闭环
DOM 摘要能读取
CSS 能注入
规则能保存
刷新能自动应用
恢复能删除规则
构建通过
```
