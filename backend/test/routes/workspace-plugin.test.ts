import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import { createAuth } from '../../src/auth'
import { createAuthMiddleware } from '../../src/auth/middleware'
import { ApiTokenService } from '../../src/services/api-tokens'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { createWorkspacePluginRoutes } from '../../src/routes/workspace-plugin'
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

function seedRepo(db: Database, id: number, localPath: string, repoUrl?: string, sourcePath?: string) {
  db.prepare(
    `INSERT INTO repos (id, local_path, repo_url, source_path, clone_status, cloned_at)
     VALUES (?, ?, ?, ?, 'cloned', strftime('%s','now'))`
  ).run(id, localPath, repoUrl ?? null, sourcePath ?? null)
}

describe('Workspace Plugin Routes', () => {
  let db: Database
  let auth: ReturnType<typeof createAuth>
  let apiTokenService: ApiTokenService

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    auth = createAuth(db)
    apiTokenService = new ApiTokenService(db)
  })

  describe('GET /projects', () => {
    it('returns projects list with valid session', async () => {
      seedUser(db, 'user-123')
      seedRepo(db, 1, 'test-repo', 'https://github.com/test/repo', '/workspace/repos/test-repo')
      const tokenResult = apiTokenService.create('user-123', 'test-token')

      const app = new Hono<{ Variables: AppVariables }>()
      app.use('/api/workspace-plugin/*', createAuthMiddleware(auth, apiTokenService, db))
      app.route('/api/workspace-plugin', createWorkspacePluginRoutes(db))

      const res = await app.request('http://localhost/api/workspace-plugin/projects', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json() as { projects: Array<{ slug: string; name: string; directory: string }> }
      expect(json.projects).toHaveLength(1)
      expect(json.projects[0]?.slug).toBe('1')
      expect(json.projects[0]?.name).toBe('test-repo')
      expect(json.projects[0]?.directory).toBe('/workspace/repos/test-repo')
    })

    it('returns 401 without session', async () => {
      const app = new Hono<{ Variables: AppVariables }>()
      app.use('/api/workspace-plugin/*', createAuthMiddleware(auth, apiTokenService, db))
      app.route('/api/workspace-plugin', createWorkspacePluginRoutes(db))

      const res = await app.request('http://localhost/api/workspace-plugin/projects')

      expect(res.status).toBe(401)
    })

    it('returns 403 with insufficient token scope', async () => {
      seedUser(db, 'user-123')
      const tokenResult = apiTokenService.create('user-123', 'test-token', 'other-scope')

      const app = new Hono<{ Variables: AppVariables }>()
      app.use('/api/workspace-plugin/*', createAuthMiddleware(auth, apiTokenService, db))
      app.route('/api/workspace-plugin', createWorkspacePluginRoutes(db))

      const res = await app.request('http://localhost/api/workspace-plugin/projects', {
        headers: { Authorization: `Bearer ${tokenResult.token}` },
      })

      expect(res.status).toBe(403)
    })
  })
})
