import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('bun:sqlite', () => ({
  Database: vi.fn(),
}))

vi.mock('@opencode-manager/shared/config/env', () => ({
  ENV: {
    OPENCODE: { PORT: 5551, HOST: '127.0.0.1' },
  },
}))

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

class MockUpstreamWebSocket extends EventEmitter {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSED = 3
  readyState = 0
  terminate = vi.fn()
  close = vi.fn()
  send = vi.fn()
  override off = this.removeListener.bind(this)
}

const upstreamInstances: MockUpstreamWebSocket[] = []
const handleUpgradeMock = vi.fn()

vi.mock('ws', () => {
  return {
    WebSocket: vi.fn().mockImplementation(() => {
      const instance = new MockUpstreamWebSocket()
      upstreamInstances.push(instance)
      return instance
    }),
    WebSocketServer: vi.fn().mockImplementation(() => ({
      handleUpgrade: handleUpgradeMock,
    })),
  }
})

function createMockSocket() {
  return {
    write: vi.fn(),
    destroy: vi.fn(),
  }
}

function createMockServer() {
  const emitter = new EventEmitter()
  return {
    server: { on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler) },
    emitter,
  }
}

async function triggerUpgrade(options?: { slug?: string }) {
  const { attachWorkspacePluginWs } = await import('../../src/services/proxy-ws')
  const { server, emitter } = createMockServer()
  const socket = createMockSocket()
  const mockReq = {
    url: '/api/opencode/test',
    headers: options?.slug ? { 'x-opencode-manager-project': options.slug } : {},
  } as unknown as Parameters<typeof attachWorkspacePluginWs>[0] extends never ? never : unknown

  attachWorkspacePluginWs(server as Parameters<typeof attachWorkspacePluginWs>[0], {
    upstreamBaseUrl: 'http://127.0.0.1:5551',
    verifyAuth: vi.fn().mockResolvedValue({ userId: 'u', scope: 's' }),
    projectService: options?.slug ? { getBySlug: vi.fn(() => ({ directory: '/test' })) } : undefined,
  })

  emitter.emit('upgrade', mockReq, socket, Buffer.from([]))
  await vi.waitFor(() => {
    expect(upstreamInstances.length).toBeGreaterThan(0)
  })
  return { socket, upstream: upstreamInstances[upstreamInstances.length - 1]! }
}

describe('proxy-ws upstream connect timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upstreamInstances.length = 0
    handleUpgradeMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects with 504 when upstream WS never opens within connect timeout', async () => {
    const { socket, upstream } = await triggerUpgrade()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(upstream.terminate).toHaveBeenCalledTimes(1)
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('504 Gateway Timeout'))
    expect(socket.destroy).toHaveBeenCalled()
    expect(handleUpgradeMock).not.toHaveBeenCalled()
  })

  it('bridges when upstream opens before timeout', async () => {
    const { socket, upstream } = await triggerUpgrade()

    upstream.emit('open')

    await vi.advanceTimersByTimeAsync(15_000)

    expect(handleUpgradeMock).toHaveBeenCalledTimes(1)
    expect(upstream.terminate).not.toHaveBeenCalled()
    expect(socket.write).not.toHaveBeenCalledWith(expect.stringContaining('504'))
  })

  it('rejects with 502 on upstream error before timeout', async () => {
    const { socket, upstream } = await triggerUpgrade()

    upstream.emit('error', new Error('ECONNREFUSED'))

    await vi.advanceTimersByTimeAsync(15_000)

    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('502 Bad Gateway'))
    expect(upstream.terminate).not.toHaveBeenCalled()
    expect(handleUpgradeMock).not.toHaveBeenCalled()
  })
})
