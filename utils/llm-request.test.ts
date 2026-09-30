import { describe, expect, it } from 'vitest'
import { describeLlmError, isResponseFormatUnsupported } from './llm-request'

function errWithStatus(status: number, message: string): Error {
  const error = new Error(message)
  ;(error as unknown as { status: number }).status = status
  return error
}

describe('isResponseFormatUnsupported', () => {
  it('仅对 400 且明确抱怨 response_format/json_object 才为 true', () => {
    expect(isResponseFormatUnsupported(errWithStatus(400, 'Unsupported response_format'))).toBe(true)
    expect(isResponseFormatUnsupported(errWithStatus(400, "'json_object' is not supported"))).toBe(true)
    expect(isResponseFormatUnsupported(errWithStatus(400, 'response_format 参数无效'))).toBe(true)
  })

  it('其它 400 与所有 401/402/429/5xx 都不算', () => {
    expect(isResponseFormatUnsupported(errWithStatus(400, 'missing model field'))).toBe(false)
    expect(isResponseFormatUnsupported(errWithStatus(401, 'Invalid token'))).toBe(false)
    expect(isResponseFormatUnsupported(errWithStatus(402, 'insufficient balance'))).toBe(false)
    expect(isResponseFormatUnsupported(errWithStatus(429, 'rate limited'))).toBe(false)
    expect(isResponseFormatUnsupported(errWithStatus(500, 'server'))).toBe(false)
    expect(isResponseFormatUnsupported(new Error('fetch failed'))).toBe(false)
  })
})

describe('describeLlmError', () => {
  it('401/402/404/429/5xx → 人话中文', () => {
    expect(describeLlmError(errWithStatus(401, 'Invalid token'))).toMatch(/Key.*无效|过期/)
    expect(describeLlmError(errWithStatus(402, 'no body'))).toMatch(/余额不足/)
    expect(describeLlmError(errWithStatus(404, 'no route'))).toMatch(/Base URL|模型/)
    expect(describeLlmError(errWithStatus(429, 'slow down'))).toMatch(/过于频繁/)
    expect(describeLlmError(errWithStatus(500, 'boom'))).toMatch(/暂时不可用/)
    expect(describeLlmError(errWithStatus(503, 'maintenance'))).toMatch(/暂时不可用/)
  })

  it('其它 HTTP 状态保留原文与状态码', () => {
    const msg = describeLlmError(errWithStatus(418, 'teapot'))
    expect(msg).toContain('418')
    expect(msg).toContain('teapot')
  })

  it('无 HTTP status(网络/其它)→ 兜底"AI 请求失败：..."', () => {
    expect(describeLlmError(new Error('fetch failed'))).toBe('AI 请求失败：fetch failed')
    expect(describeLlmError('plain string'))
      .toBe('AI 请求失败：plain string')
  })
})
