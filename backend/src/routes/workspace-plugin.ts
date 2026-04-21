import { Hono } from 'hono'
import type { Database } from 'bun:sqlite'
import { listRepos } from '../db/queries'
import { SettingsService } from '../services/settings'
import { logger } from '../utils/logger'
import type { Session } from '../auth'

type AppVariables = {
  session: Session['session']
  user: Session['user']
  tokenScope?: string
}

export interface ProjectInfo {
  slug: string
  name: string
  directory: string
  description?: string
}

const ALLOWED_WORKSPACE_PLUGIN_SCOPES = new Set(['*', 'workspace-plugin'])

export function createWorkspacePluginRoutes(db: Database) {
  const app = new Hono<{ Variables: AppVariables }>()

  app.get('/projects', async (c) => {
    try {
      const session = c.get('session')
      if (!session) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const tokenScope = c.get('tokenScope')
      if (tokenScope !== undefined && !ALLOWED_WORKSPACE_PLUGIN_SCOPES.has(tokenScope)) {
        logger.warn(`Token with scope '${tokenScope}' attempted to access workspace-plugin endpoint`)
        return c.json({ error: 'Forbidden: insufficient token scope' }, 403)
      }

      const settingsService = new SettingsService(db)
      const settings = settingsService.getSettings()
      const repos = listRepos(db, settings.preferences.repoOrder)

      const projects: ProjectInfo[] = repos.map(repo => {
        const slug = repo.id.toString()
        const name = repo.localPath.split('/').pop() ?? `repo-${repo.id}`
        const directory = repo.fullPath

        return {
          slug,
          name,
          directory,
          description: repo.repoUrl ?? undefined,
        }
      })

      return c.json({ projects })
    } catch (error) {
      logger.error('Failed to list projects for workspace plugin:', error)
      return c.json({ error: 'Failed to list projects' }, 500)
    }
  })

  return app
}
