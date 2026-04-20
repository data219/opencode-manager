import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { createAuth } from '../../src/auth'
import { createAuthMiddleware } from '../../src/auth/middleware'
import { ApiTokenService } from '../../src/services/api-tokens'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import type { Session } from '../../src/auth'

type AppVariables = {
  session: Session['session']
  user: Session['user']
  tokenScope?: string
}

function seedUser(db: Database, id: string, email = `${id}@example.com`, name = `User ${id}`) {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, 1, now, now, 'user')
}

describe('Auth Middleware', () => {
  let db: Database
  let auth: ReturnType<typeof createAuth>
  let apiTokenService: ApiTokenService

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    auth = createAuth(db)
    apiTokenService = new ApiTokenService(db)
  })

  describe('Bearer token authentication', () => {
    it('accepts valid bearer token and loads real user', async () => {
      seedUser(db, 'user-123', 'alice@example.com', 'Alice')
      const tokenResult = apiTokenService.create('user-123', 'test-token')

      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono<{ Variables: AppVariables }>()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({
        success: true,
        user: c.get('user'),
        tokenScope: c.get('tokenScope') ?? null,
      }))

      const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; user: { id: string; email: string; name: string }; tokenScope: string | null }
      expect(json.success).toBe(true)
      expect(json.user.id).toBe('user-123')
      expect(json.user.email).toBe('alice@example.com')
      expect(json.user.name).toBe('Alice')
      expect(json.tokenScope).toBe('workspace-plugin')
    })

    it('rejects bearer token whose user no longer exists', async () => {
      const tokenResult = apiTokenService.create('ghost-user', 'test-token')

      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({ success: true }))

      const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(401)
    })

    it('rejects invalid bearer token', async () => {
      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({ success: true }))

      const res = await app.request('http://localhost/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      })

      expect(res.status).toBe(401)
    })

    it('rejects expired bearer token', async () => {
      seedUser(db, 'user-123')
      const expiredAt = Date.now() - 3600000
      const tokenResult = apiTokenService.create('user-123', 'test-token', 'workspace-plugin', expiredAt)

      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({ success: true }))

      const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(401)
    })

    it('rejects revoked bearer token', async () => {
      seedUser(db, 'user-123')
      const tokenResult = apiTokenService.create('user-123', 'test-token')
      apiTokenService.revoke('user-123', tokenResult.id)

      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({ success: true }))

      const res = await app.request('http://localhost/test', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(401)
    })

    it('rejects request without auth when bearer service not provided', async () => {
      const requireAuth = createAuthMiddleware(auth)
      const app = new Hono()
      app.use('/*', requireAuth)
      app.get('/test', (c) => c.json({ success: true }))

      const res = await app.request('http://localhost/test')

      expect(res.status).toBe(401)
    })

    it('propagates custom token scope to downstream handlers', async () => {
      seedUser(db, 'user-scope')
      const tokenResult = apiTokenService.create('user-scope', 'custom', 'custom-scope')

      const requireAuth = createAuthMiddleware(auth, apiTokenService, db)
      const app = new Hono<{ Variables: AppVariables }>()
      app.use('/*', requireAuth)
      app.get('/scope', (c) => c.json({ scope: c.get('tokenScope') ?? null }))

      const res = await app.request('http://localhost/scope', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json() as { scope: string | null }
      expect(json.scope).toBe('custom-scope')
    })
  })
})
