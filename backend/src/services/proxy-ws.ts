import type { Server, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import { logger } from '../utils/logger'
import { OPENCODE_SERVER_URL, withOpenCodeAuth } from './proxy'
import { WS_UPSTREAM_CONNECT_TIMEOUT_MS } from '@opencode-manager/shared/config/defaults'

interface AuthResult {
  userId: string
  scope: string
}

export interface WebSocketProxyOptions {
  upstreamBaseUrl: string
  verifyAuth: (headers: Headers) => Promise<AuthResult | null>
  pathPrefix?: string
}

const DEFAULT_PATH_PREFIX = '/api/opencode'

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  try {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  } catch (error) {
    logger.debug('Failed to write upgrade rejection:', error)
  }
  socket.destroy()
}

function headersFromIncoming(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    headers.set(key, Array.isArray(value) ? value.join(',') : String(value))
  }
  return headers
}

function bridge(client: WebSocket, upstream: WebSocket): void {
  const closeBoth = (code = 1000, reason = ''): void => {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      try { client.close(code, reason) } catch { /* ignore */ }
    }
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      try { upstream.close(code, reason) } catch { /* ignore */ }
    }
  }

  client.on('message', (data, isBinary) => {
    if (upstream.readyState !== WebSocket.OPEN) return
    upstream.send(data, { binary: isBinary })
  })

  upstream.on('message', (data, isBinary) => {
    if (client.readyState !== WebSocket.OPEN) return
    client.send(data, { binary: isBinary })
  })

  client.on('close', (code, reason) => closeBoth(code, reason.toString()))
  upstream.on('close', (code, reason) => closeBoth(code, reason.toString()))

  client.on('error', (error) => {
    logger.error('Client WebSocket error:', error)
    closeBoth(1011, 'client error')
  })

  upstream.on('error', (error) => {
    logger.error('Upstream WebSocket error:', error)
    closeBoth(1011, 'upstream error')
  })
}

export function attachWorkspacePluginWs(server: Server, options: WebSocketProxyOptions): void {
  const wss = new WebSocketServer({ noServer: true })
  const pathPrefix = options.pathPrefix ?? DEFAULT_PATH_PREFIX

  server.on('upgrade', (req, socket, head) => {
    let url: URL
    try {
      url = new URL(req.url ?? '', OPENCODE_SERVER_URL)
    } catch (error) {
      logger.debug('Invalid upgrade URL:', error)
      rejectUpgrade(socket, 400, 'Bad Request')
      return
    }

    if (!url.pathname.startsWith(pathPrefix)) {
      return
    }

    const headers = headersFromIncoming(req)

    void (async () => {
      const auth = await options.verifyAuth(headers).catch((error) => {
        logger.error('verifyAuth threw:', error)
        return null
      })

      if (!auth) {
        rejectUpgrade(socket, 401, 'Unauthorized')
        return
      }

      const remainingPath = url.pathname.slice(pathPrefix.length) || '/'
      const targetUrl = `${options.upstreamBaseUrl}${remainingPath}${url.search}`

      const upstreamWsUrl = (() => {
        const u = new URL(targetUrl)
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
        return u.toString()
      })()

      logger.info(`Proxying WebSocket upgrade to ${upstreamWsUrl}`)

      const upstreamHeaders = withOpenCodeAuth({})
      const upstream = new WebSocket(upstreamWsUrl, { headers: upstreamHeaders })

      const connectTimer = setTimeout(() => {
        try {
          upstream.terminate()
        } catch {
          // ignore
        }
        rejectUpgrade(socket, 504, 'Gateway Timeout')
      }, WS_UPSTREAM_CONNECT_TIMEOUT_MS)

      const onUpstreamError = (error: Error): void => {
        clearTimeout(connectTimer)
        logger.error('Upstream WebSocket connect error:', error)
        rejectUpgrade(socket, 502, 'Bad Gateway')
      }

      upstream.once('error', onUpstreamError)
      upstream.once('open', () => {
        clearTimeout(connectTimer)
        upstream.off('error', onUpstreamError)
        wss.handleUpgrade(req, socket, head, (clientWs) => {
          bridge(clientWs, upstream)
        })
      })
    })()
  })
}
