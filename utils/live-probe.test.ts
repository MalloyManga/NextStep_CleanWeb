import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// 探针只在显式开启时真打 API，避免 npm test 误触发网络/计费。
const LIVE = process.env.CLEANWEB_LIVE === '1'

vi.mock('wxt/utils/storage', () => ({
  storage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}))

import { generateCssRule } from './llm'
import { sanitizeGeneratedCss } from './css-safety'
import type { DomSummaryItem } from '../types/cleanweb'

function readEnv(name: string) {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  return text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
}
// 一份贴近真实、不含任何站点专有词的“嘈杂页面”摘要
function noisyPageSummary(): DomSummaryItem[] {
  const base = { tag: 'div', text: '', visible: true, rect: { x: 0, y: 0, width: 300, height: 200 } }
  return [
    { ...base, selector: 'aside.sidebar', tag: 'aside', className: 'sidebar', text: '推荐关注 热门动态', rect: { x: 0, y: 80, width: 240, height: 600 }, childElementCount: 20 },
    { ...base, selector: 'div.ad-banner', className: 'ad-banner', text: '广告 推广位', rect: { x: 320, y: 0, width: 728, height: 90 }, iframeCount: 1 },
    { ...base, selector: 'div.recommend-feed', className: 'recommend-feed', text: '猜你喜欢', rect: { x: 320, y: 600, width: 728, height: 300 }, childElementCount: 12 },
    { ...base, selector: 'article.post', tag: 'article', text: '这里是正文内容，一段比较长的重要文章主体。'.repeat(4), rect: { x: 340, y: 120, width: 680, height: 460 }, linkCount: 3, childElementCount: 8 },
    { ...base, selector: 'nav.top-nav', tag: 'nav', className: 'top-nav', text: '首页 分类 登录 注册 搜索', rect: { x: 0, y: 0, width: 1200, height: 56 }, linkCount: 24 },
    { ...base, selector: 'footer.site-footer', tag: 'footer', text: '关于我们 联系方式 备案', rect: { x: 0, y: 900, width: 1200, height: 120 }, linkCount: 15 },
  ]
}

describe('live AI cleaner probe (manual, opt-in)', () => {
  it.skipIf(!LIVE)('generateCssRule produces sanitized CSS from a real LLM', async () => {
    const settings = {
      apiKey: readEnv('VITE_LLM_API_KEY'),
      baseUrl: readEnv('VITE_LLM_BASE_URL'),
      model: readEnv('VITE_LLM_MODEL'),
    }
    expect(settings.apiKey, 'no API key in .env').toBeTruthy()

    const instruction = '隐藏侧边栏、广告和推荐流，把正文居中并限制阅读宽度，不要动导航栏和登录按钮'
    const domSummary = noisyPageSummary()

    let result
    try {
      result = await generateCssRule({ instruction, domSummary, settings })
    } catch (error) {
      // 新契约：失败(含无效/过期 Key、网络、解析)一律抛清晰错误，不再静默套兜底 CSS。
      const message = error instanceof Error ? error.message : String(error)
      console.info('===== PROBE: threw (honest error, no silent fallback) =====\n', message)
      expect(message).toMatch(/AI|配置|检查|重试|安全|失败/)
      return
    }

    // 成功路径：必须是真 AI 生成、非空、且过护栏后仍有内容
    console.info('===== PROBE: explanation =====\n', result.explanation)
    console.info('===== PROBE: raw css from model =====\n', result.css)
    console.info('===== PROBE: retried w/o response_format =====\n', result.debug.retriedWithoutResponseFormat)

    expect(result.usedFallback).toBe(false)
    expect(result.css.trim().length).toBeGreaterThan(0)

    const safe = sanitizeGeneratedCss(result.css, domSummary, instruction)
    console.info('===== PROBE: after guardrail =====\n', safe)
    // 红线：导航不能被整块隐藏；正文可以被 restyle，但不能被 display:none
    expect(safe).not.toMatch(/(^|[ ,{])nav(\b|[^-a-z])/i)
    expect(safe).not.toMatch(/article\.post\b[^}]*display\s*:\s*none/i)
    // 应当出现"该出现的":侧栏/广告/推荐被隐藏,正文被 restyle
    expect(safe).toMatch(/aside\.sidebar[^}]*display\s*:\s*none/i)
    expect(safe).toMatch(/\.ad-banner[^}]*display\s*:\s*none/i)
    expect(safe).toMatch(/article\.post\b[^}]*max-width/i)
  }, 90_000)
})
