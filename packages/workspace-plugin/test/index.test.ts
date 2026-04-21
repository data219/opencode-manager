import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PluginOptionsSchema } from '../src/types'
import { resolveConfig } from '../src/index'
import type { WorkspaceInfo } from '@opencode-ai/plugin'

describe('PluginOptionsSchema', () => {
  it('accepts url from options', () => {
    const parsed = PluginOptionsSchema.parse({ url: 'http://test.com' })
    expect(parsed.url).toBe('http://test.com')
  })

  it('accepts token from options', () => {
    const parsed = PluginOptionsSchema.parse({ token: 'test-token' })
    expect(parsed.token).toBe('test-token')
  })

  it('requires token to be non-empty', () => {
    expect(() => PluginOptionsSchema.parse({ token: '' })).toThrow()
  })

  it('rejects malformed url', () => {
    expect(() => PluginOptionsSchema.parse({ url: 'not-a-url' })).toThrow()
  })
})

describe('resolveConfig', () => {
  const ORIGINAL_URL = process.env.OPENCODE_MANAGER_URL
  const ORIGINAL_TOKEN = process.env.OPENCODE_MANAGER_TOKEN

  beforeEach(() => {
    delete process.env.OPENCODE_MANAGER_URL
    delete process.env.OPENCODE_MANAGER_TOKEN
  })

  afterEach(() => {
    if (ORIGINAL_URL === undefined) delete process.env.OPENCODE_MANAGER_URL
    else process.env.OPENCODE_MANAGER_URL = ORIGINAL_URL
    if (ORIGINAL_TOKEN === undefined) delete process.env.OPENCODE_MANAGER_TOKEN
    else process.env.OPENCODE_MANAGER_TOKEN = ORIGINAL_TOKEN
  })

  it('uses options when provided', () => {
    const cfg = resolveConfig({ url: 'http://options.com', token: 'options-token' })
    expect(cfg).toEqual({ url: 'http://options.com', token: 'options-token' })
  })

  it('falls back to env vars when options omit fields', () => {
    process.env.OPENCODE_MANAGER_URL = 'http://env.com'
    process.env.OPENCODE_MANAGER_TOKEN = 'env-token'

    const cfg = resolveConfig({})
    expect(cfg).toEqual({ url: 'http://env.com', token: 'env-token' })
  })

  it('prefers options over env vars when both present', () => {
    process.env.OPENCODE_MANAGER_URL = 'http://env.com'
    process.env.OPENCODE_MANAGER_TOKEN = 'env-token'

    const cfg = resolveConfig({ url: 'http://options.com', token: 'options-token' })
    expect(cfg).toEqual({ url: 'http://options.com', token: 'options-token' })
  })

  it('throws when url missing from both options and env', () => {
    process.env.OPENCODE_MANAGER_TOKEN = 'env-token'
    expect(() => resolveConfig({})).toThrow(/missing `url`/)
  })

  it('throws when token missing from both options and env', () => {
    process.env.OPENCODE_MANAGER_URL = 'http://env.com'
    expect(() => resolveConfig({})).toThrow(/missing `token`/)
  })
})

describe('adaptor.target', () => {
  const sampleInfo: WorkspaceInfo = {
    name: 'Test Workspace',
    directory: '/test/dir',
    extra: {},
  }

  it('returns { type: "remote", url, headers } with bearer auth when target is invoked', async () => {
    const { makeAdaptor } = await import('../src/index.js')
    const cfg = { url: 'http://manager.test:5003', token: 'tok-abc' }
    const project = { slug: '42', name: 'Test Project', directory: '/workspace/repos/test' }
    const adaptor = makeAdaptor(cfg, project)
    const result = adaptor.target(sampleInfo)
    expect(result.type).toBe('remote')
    expect(result.url).toBe('http://manager.test:5003/api/workspace-plugin/opencode/42')
    expect(result.headers).toEqual({ Authorization: 'Bearer tok-abc' })
  })

  it('url-encodes special slug characters', async () => {
    const { makeAdaptor } = await import('../src/index.js')
    const cfg = { url: 'http://manager.test:5003', token: 'tok-abc' }
    const project = { slug: 'a/b c', name: 'Test Project', directory: '/workspace/repos/test' }
    const adaptor = makeAdaptor(cfg, project)
    const result = adaptor.target(sampleInfo)
    expect(result.url).toContain('a%2Fb%20c')
  })

  it('strips trailing slash from manager url', async () => {
    const { makeAdaptor } = await import('../src/index.js')
    const cfg = { url: 'http://manager.test:5003/', token: 'tok-abc' }
    const project = { slug: '42', name: 'Test Project', directory: '/workspace/repos/test' }
    const adaptor = makeAdaptor(cfg, project)
    const result = adaptor.target(sampleInfo)
    expect(result.url).toBe('http://manager.test:5003/api/workspace-plugin/opencode/42')
  })
})
