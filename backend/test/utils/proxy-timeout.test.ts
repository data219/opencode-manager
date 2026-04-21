import { describe, it, expect } from 'vitest'
import { isStreamingPath, buildFetchSignal } from '../../src/utils/proxy-timeout'

describe('isStreamingPath', () => {
  it('returns true for /event', () => {
    expect(isStreamingPath('/event')).toBe(true)
  })

  it('returns true for /global/event', () => {
    expect(isStreamingPath('/global/event')).toBe(true)
  })

  it('returns true for /session/X/event', () => {
    expect(isStreamingPath('/session/abc123/event')).toBe(true)
  })

  it('returns false for /sync/history', () => {
    expect(isStreamingPath('/sync/history')).toBe(false)
  })

  it('returns false for /config', () => {
    expect(isStreamingPath('/config')).toBe(false)
  })

  it('returns false for /', () => {
    expect(isStreamingPath('/')).toBe(false)
  })

  it('returns false for /session/X/config', () => {
    expect(isStreamingPath('/session/abc123/config')).toBe(false)
  })
})

describe('buildFetchSignal', () => {
  it('returns undefined for streaming paths', () => {
    expect(buildFetchSignal('/event')).toBeUndefined()
    expect(buildFetchSignal('/global/event')).toBeUndefined()
    expect(buildFetchSignal('/session/abc/event')).toBeUndefined()
  })

  it('returns AbortSignal for non-streaming paths', () => {
    const signal = buildFetchSignal('/config')
    expect(signal).toBeDefined()
    expect(signal).toBeInstanceOf(AbortSignal)
  })

  it('uses custom timeout when provided', () => {
    const customTimeout = 5000
    const signal = buildFetchSignal('/config', customTimeout)
    expect(signal).toBeDefined()
  })
})
