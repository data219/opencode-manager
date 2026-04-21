import { DEFAULTS } from '@opencode-manager/shared/config/defaults'

export const PROXY_REQUEST_TIMEOUT_MS = DEFAULTS.PROXY.REQUEST_TIMEOUT_MS

const STREAMING_PATHS = new Set(['/event', '/global/event'])
const STREAMING_SUFFIXES = ['/event']

export function isStreamingPath(pathname: string): boolean {
  if (STREAMING_PATHS.has(pathname)) return true
  return STREAMING_SUFFIXES.some((s) => pathname.endsWith(s))
}

export function buildFetchSignal(pathname: string, timeoutMs: number = PROXY_REQUEST_TIMEOUT_MS): AbortSignal | undefined {
  if (isStreamingPath(pathname)) {
    return undefined
  }
  return AbortSignal.timeout(timeoutMs)
}
