import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { createApiTokenRoutes } from '../../src/routes/api-tokens'
import { ApiTokenService } from '../../src/services/api-tokens'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import type { Session } from '../../src/auth'

type AppVariables = {
  session: Session['session']
  user: Session['user']
}

const TEST_USER_ID = 'test-user-123'

const testSession: { session: Session['session']; user: Session['user'] } = {
  session: {
    id: 'test-session',
    userId: TEST_USER_ID,
    token: 'test-token',
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: TEST_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}

function buildAuthedApp(apiTokenService: ApiTokenService, authed: boolean): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>()
  app.use('/*', async (c, next) => {
    if (authed) {
      c.set('session', testSession.session)
      c.set('user', testSession.user)
    }
    await next()
  })
  app.route('/tokens', createApiTokenRoutes(apiTokenService))
  return app
}

describe('API Tokens Routes', () => {
  let db: Database
  let apiTokenService: ApiTokenService

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    apiTokenService = new ApiTokenService(db)
  })

  describe('GET /tokens', () => {
    it('returns list of tokens for authenticated user', async () => {
      apiTokenService.create(TEST_USER_ID, 'token1')
      apiTokenService.create(TEST_USER_ID, 'token2')

      const app = buildAuthedApp(apiTokenService, true)
      const res = await app.request('http://localhost/tokens')

      expect(res.status).toBe(200)
      const json = await res.json() as { tokens: Array<{ id: string; name: string }> }
      expect(json.tokens.length).toBe(2)
    })
  })

  describe('POST /tokens', () => {
    it('creates new token with valid request', async () => {
      const app = buildAuthedApp(apiTokenService, true)
      const res = await app.request('http://localhost/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-token' }),
      })

      expect(res.status).toBe(200)
      const json = await res.json() as { id: string; name: string; token: string }
      expect(json.id).toBeTruthy()
      expect(json.name).toBe('new-token')
      expect(json.token).toBeTruthy()
    })

    it('returns raw token only once on creation', async () => {
      const app = buildAuthedApp(apiTokenService, true)

      const createRes = await app.request('http://localhost/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'new-token' }),
      })

      const created = await createRes.json() as { id: string; token: string }
      expect(created.token).toBeTruthy()

      const listRes = await app.request('http://localhost/tokens')
      const listJson = await listRes.json() as { tokens: Array<{ id: string; token?: string }> }
      const found = listJson.tokens.find((t) => t.id === created.id)
      expect(found).toBeDefined()
      expect(found?.token).toBeUndefined()
    })

    it('returns 400 with invalid data', async () => {
      const app = buildAuthedApp(apiTokenService, true)
      const res = await app.request('http://localhost/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /tokens/:id', () => {
    it('revokes existing token', async () => {
      const token = apiTokenService.create(TEST_USER_ID, 'token1')
      const app = buildAuthedApp(apiTokenService, true)

      const res = await app.request(`http://localhost/tokens/${token.id}`, { method: 'DELETE' })

      expect(res.status).toBe(200)
      expect(apiTokenService.list(TEST_USER_ID).length).toBe(0)
    })

    it('returns 404 for non-existent token', async () => {
      const app = buildAuthedApp(apiTokenService, true)
      const res = await app.request('http://localhost/tokens/non-existent-id', { method: 'DELETE' })

      expect(res.status).toBe(404)
    })
  })
})
