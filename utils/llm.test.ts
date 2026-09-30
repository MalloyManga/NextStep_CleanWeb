import { beforeEach, describe, expect, it, vi } from 'vitest'

// vi.mock 会被 hoist 到文件顶;它引用的 mockCreate 必须用 vi.hoisted 创建。
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock('wxt/utils/storage', () => ({
  storage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}))

vi.mock('./llm-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llm-config')>()
  return {
    ...actual,
    createClient: () => ({ chat: { completions: { create: mockCreate } } }),
  }
})

import { generateCssRule } from './llm'
import type { DomSummaryItem, LlmSettings } from '../types/cleanweb'

const settings: LlmSettings = {
  apiKey: 'fake-key',
  baseUrl: 'https://example.invalid/v1',
  model: 'test-model',
}
const dom: DomSummaryItem[] = []

function ok(content: unknown) {
  return {
    choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
  }
}

beforeEach(() => {
  mockCreate.mockReset()
})

describe('generateCssRule (mocked OpenAI client)', () => {
  it('成功:真 LLM 输出过护栏,原样保留 hide 规则', async () => {
    mockCreate.mockResolvedValue(ok({ css: '.ad-banner { display: none !important; }', explanation: '隐藏广告' }))

    const result = await generateCssRule({ instruction: '隐藏广告', domSummary: dom, settings })

    expect(result.css).toContain('.ad-banner')
    expect(result.css).toMatch(/display\s*:\s*none/)
    expect(result.explanation).toBe('隐藏广告')
    expect(result.usedFallback).toBe(false)
    expect(result.debug.retriedWithoutResponseFormat).toBe(false)
  })

  it('无 Key:抛"未配置 AI Key",不套 FALLBACK_CSS', async () => {
    await expect(generateCssRule({ instruction: 'x', domSummary: dom })).rejects.toThrow(/未配置 AI Key/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('空响应:抛"空响应"', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '' } }] })
    await expect(generateCssRule({ instruction: 'x', domSummary: dom, settings })).rejects.toThrow(/空响应/)
  })

  it('非 JSON:抛"不是合法 JSON"', async () => {
    mockCreate.mockResolvedValue(ok('totally not json'))
    await expect(generateCssRule({ instruction: 'x', domSummary: dom, settings })).rejects.toThrow(/不是合法 JSON/)
  })

  it('护栏把 CSS 全部剥光:抛"安全检查",不再静默应用兜底', async () => {
    mockCreate.mockResolvedValue(ok({ css: 'body { display: none !important; }', explanation: 'x' }))
    await expect(generateCssRule({ instruction: 'x', domSummary: dom, settings })).rejects.toThrow(/安全检查/)
  })

  it('401 无效 Key → describeLlmError 翻成人话', async () => {
    const err = Object.assign(new Error('Invalid token'), { status: 401 })
    mockCreate.mockRejectedValue(err)

    await expect(generateCssRule({ instruction: 'x', domSummary: dom, settings }))
      .rejects.toThrow(/Key.*无效|过期/)
    // 关键:auth 类错误不应触发 retry
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('400 抱怨 response_format → 去掉重试一次成功', async () => {
    const err = Object.assign(new Error("Unsupported response_format 'json_object'"), { status: 400 })
    mockCreate
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(ok({ css: '.ad { display: none !important; }', explanation: 'ok' }))

    const result = await generateCssRule({ instruction: 'x', domSummary: dom, settings })

    expect(result.css).toContain('.ad')
    expect(result.debug.retriedWithoutResponseFormat).toBe(true)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
