import { DEFAULTS } from '@opencode-manager/shared/config/defaults'

export const PROXY_REQUEST_TIMEOUT_MS = DEFAULTS.PROXY.REQUEST_TIMEOUT_MS

export function isStreamingPath(pathname: string): boolean {
  return pathname.endsWith('/event')
}

export function buildFetchSignal(pathname: string, timeoutMs: number = PROXY_REQUEST_TIMEOUT_MS): AbortSignal | undefined {
  if (isStreamingPath(pathname)) {
    return undefined
  }
  return AbortSignal.timeout(timeoutMs)
}
