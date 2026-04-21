import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('bun:sqlite', () => ({
  Database: vi.fn(),
}))

vi.mock('@opencode-manager/shared/config/env', () => ({
  ENV: {
    OPENCODE: { PORT: 5551, HOST: '127.0.0.1' },
  },
}))

interface MockEventSourceInstance {
  onopen: (() => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  close: () => void
  fetchOption: ((input: string | URL, init?: RequestInit) => Promise<Response>) | undefined
}

const eventSourceInstances: MockEventSourceInstance[] = []

vi.mock('eventsource', () => {
  return {
    EventSource: vi.fn().mockImplementation((_url: string, init?: { fetch?: (input: string | URL, init?: RequestInit) => Promise<Response> }) => {
      const instance: MockEventSourceInstance = {
        onopen: null,
        onerror: null,
        onmessage: null,
        close: vi.fn(),
        fetchOption: init?.fetch,
      }
      eventSourceInstances.push(instance)
      return instance
    }),
  }
})

const loggerMock = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}

vi.mock('../../src/utils/logger', () => ({
  logger: loggerMock,
}))

const withOpenCodeAuthSpy = vi.fn((headers: Record<string, string> = {}) => headers)

vi.mock('../../src/services/proxy', () => ({
  withOpenCodeAuth: (headers: Record<string, string> = {}) => withOpenCodeAuthSpy(headers),
}))

describe('sse-aggregator', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    eventSourceInstances.length = 0
    withOpenCodeAuthSpy.mockImplementation((headers: Record<string, string> = {}) => headers)
    vi.resetModules()
  })

  afterEach(async () => {
    const mod = await import('../../src/services/sse-aggregator')
    mod.sseAggregator.shutdown()
  })

  describe('authentication', () => {
    it('passes fetch option to EventSource that calls withOpenCodeAuth', async () => {
      const { sseAggregator } = await import('../../src/services/sse-aggregator')

      sseAggregator.addClient('c1', vi.fn(), ['/repo/a'])

      expect(eventSourceInstances).toHaveLength(1)
      const instance = eventSourceInstances[0]!
      expect(instance.fetchOption).toBeDefined()

      const mockFetch = vi.fn().mockResolvedValue(new Response(''))
      global.fetch = mockFetch as unknown as typeof fetch

      await instance.fetchOption!('http://127.0.0.1:5551/event?directory=/repo/a', {
        headers: { 'X-Custom': '1' },
      })

      expect(withOpenCodeAuthSpy).toHaveBeenCalled()
      const authCallArgs = withOpenCodeAuthSpy.mock.calls[0]![0]
      expect(authCallArgs).toEqual({ 'X-Custom': '1' })
    })

    it('forwards Authorization header from withOpenCodeAuth to the underlying fetch', async () => {
      withOpenCodeAuthSpy.mockImplementation((headers: Record<string, string> = {}) => ({
        ...headers,
        Authorization: 'Basic dGVzdDpwdw==',
      }))

      const { sseAggregator } = await import('../../src/services/sse-aggregator')
      sseAggregator.addClient('c1', vi.fn(), ['/repo/a'])

      const instance = eventSourceInstances[0]!
      const mockFetch = vi.fn().mockResolvedValue(new Response(''))
      global.fetch = mockFetch as unknown as typeof fetch

      await instance.fetchOption!('http://127.0.0.1:5551/event?directory=/repo/a', {})

      const forwardedInit = mockFetch.mock.calls[0]![1] as RequestInit
      const forwardedHeaders = forwardedInit.headers as Record<string, string>
      expect(forwardedHeaders.Authorization).toBe('Basic dGVzdDpwdw==')
    })
  })

  describe('failure warn throttling', () => {
    it('warns on first failure and every Nth failure', async () => {
      const { sseAggregator } = await import('../../src/services/sse-aggregator')
      sseAggregator.addClient('c1', vi.fn(), ['/repo/a'])

      const instance = eventSourceInstances[0]!

      for (let i = 0; i < 12; i++) {
        instance.onerror?.()
      }

      const warnCalls = loggerMock.warn.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('SSE upstream unreachable')
      )
      expect(warnCalls).toHaveLength(3)
      expect(warnCalls[0]![0]).toContain('attempt 1')
      expect(warnCalls[1]![0]).toContain('attempt 5')
      expect(warnCalls[2]![0]).toContain('attempt 10')
    })

    it('resets consecutiveFailures on successful open', async () => {
      const { sseAggregator } = await import('../../src/services/sse-aggregator')
      sseAggregator.addClient('c1', vi.fn(), ['/repo/a'])

      const instance = eventSourceInstances[0]!

      instance.onerror?.()
      instance.onerror?.()

      loggerMock.warn.mockClear()

      instance.onopen?.()

      instance.onerror?.()

      const warnCalls = loggerMock.warn.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('SSE upstream unreachable')
      )
      expect(warnCalls).toHaveLength(1)
      expect(warnCalls[0]![0]).toContain('attempt 1')
    })
  })

  describe('log level', () => {
    it('uses debug (not info) for initial connection attempt', async () => {
      const { sseAggregator } = await import('../../src/services/sse-aggregator')
      sseAggregator.addClient('c1', vi.fn(), ['/repo/a'])

      const debugConnectCalls = loggerMock.debug.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('SSE connecting to OpenCode')
      )
      const infoConnectCalls = loggerMock.info.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('SSE connecting to OpenCode')
      )

      expect(debugConnectCalls).toHaveLength(1)
      expect(infoConnectCalls).toHaveLength(0)
    })
  })
})
