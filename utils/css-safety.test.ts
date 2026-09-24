import { describe, expect, it } from 'vitest'
import {
  sanitizeGeneratedCss,
  sanitizeSelectedElementCss,
} from './css-safety'
import type { ElementContextItem, SelectedElementContext } from '../types/cleanweb'

function item(over: Partial<ElementContextItem> & { selector: string }): ElementContextItem {
  return {
    tag: 'div',
    text: '',
    rect: { x: 0, y: 0, width: 100, height: 50 },
    visible: true,
    depth: 0,
    ...over,
  }
}

function context(overrides: Partial<SelectedElementContext> = {}): SelectedElementContext {
  return {
    selected: item({ selector: '.card-title', tag: 'span', depth: 0, areaRatio: 0.02 }),
    recommendedTarget: item({ selector: '.card', tag: 'div', depth: 1, areaRatio: 0.1 }),
    ancestors: [item({ selector: '.card', tag: 'div', depth: 1, areaRatio: 0.1, linkCount: 2, buttonCount: 0 })],
    siblings: [],
    descendants: [],
    ...overrides,
  }
}

describe('sanitizeGeneratedCss — 整页净化通用红线', () => {
  it('阻止隐藏裸布局标签（body/main 等）', () => {
    const out = sanitizeGeneratedCss('body { display: none !important; }', [], '')
    expect(out).not.toContain('body')
    expect(out.trim()).toBe('')
  })

  it('保护 SPA 挂载根 #app', () => {
    const out = sanitizeGeneratedCss('#app { display: none !important; }', [], '')
    expect(out).not.toContain('#app')
  })

  it('允许隐藏广告容器', () => {
    const out = sanitizeGeneratedCss('.ad-banner { display: none !important; }', [], '隐藏广告')
    expect(out).toContain('.ad-banner')
    expect(out).toContain('display: none')
  })

  it('保护大型布局骨架不被隐藏（子元素过多）', () => {
    const summary = [item({ selector: '.site-main', text: '导航 内容 页脚', childElementCount: 40 })]
    const out = sanitizeGeneratedCss('.site-main { display: none !important; }', summary, '')
    expect(out).not.toContain('.site-main')
  })

  it('保留用户明确要求保留的栏目', () => {
    const summary = [item({ selector: '.calendar-box', text: '侧栏日历 活动 讲座' })]
    const out = sanitizeGeneratedCss('.calendar-box { display: none !important; }', summary, '隐藏广告，保留 侧栏日历')
    expect(out).not.toContain('.calendar-box')
  })

  it('放行非隐藏的重排样式', () => {
    const out = sanitizeGeneratedCss('main { max-width: 800px; margin: 0 auto; }', [], '正文居中')
    expect(out).toContain('main')
    expect(out).toContain('max-width')
  })
})

describe('sanitizeSelectedElementCss — 元素级护栏', () => {
  it('智能隐藏可以隐藏推荐的父容器', () => {
    const out = sanitizeSelectedElementCss('.card { display: none !important; }', context(), {
      allowHide: true,
      maxAncestorDepth: 2,
    })
    expect(out).toContain('.card')
    expect(out).toContain('display: none')
  })

  it('用户没要求隐藏时，丢弃 hide 声明', () => {
    const out = sanitizeSelectedElementCss('.card { display: none !important; }', context(), {
      allowHide: false,
    })
    expect(out.trim()).toBe('')
  })

  it('越界选择器被折叠到选中元素，不悄悄改到别处', () => {
    const out = sanitizeSelectedElementCss('.random-unrelated { color: red; }', context(), {
      allowHide: false,
    })
    expect(out).not.toContain('.random-unrelated')
    expect(out).toContain('.card')
  })

  it('超过最大祖先深度的容器不作为隐藏目标', () => {
    const deep = context({
      ancestors: [item({ selector: '.deep-shell', depth: 5, areaRatio: 0.9, linkCount: 0, buttonCount: 0 })],
    })
    const out = sanitizeSelectedElementCss('.deep-shell { display: none !important; }', deep, {
      allowHide: true,
      maxAncestorDepth: 2,
    })
    expect(out).not.toContain('.deep-shell')
  })
})
