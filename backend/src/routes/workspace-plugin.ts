import { Hono } from 'hono'
import type { Database } from 'bun:sqlite'
import { listRepos } from '../db/queries'
import { SettingsService } from '../services/settings'
import { logger } from '../utils/logger'
import type { Session } from '../auth'
import { proxyRequest, type ProxyProjectService } from '../services/proxy'

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

export function createProjectService(db: Database): ProxyProjectService {
  return {
    getBySlug: (slug: string) => {
      const settingsService = new SettingsService(db)
      const settings = settingsService.getSettings()
      const repos = listRepos(db, settings.preferences.repoOrder)
      const repo = repos.find((r) => r.id.toString() === slug)
      if (!repo) return null
      return { directory: repo.fullPath }
    },
  }
}

export function createWorkspacePluginRoutes(db: Database) {
  const app = new Hono<{ Variables: AppVariables }>()

  const projectService = createProjectService(db)

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

  app.all('/opencode/:slug/*', async (c) => {
    const slug = c.req.param('slug')
    const inbound = c.req.raw
    const inboundUrl = new URL(inbound.url)

    const session = c.get('session')
    if (!session) {
      logger.warn(`workspace-plugin proxy: unauthorized slug=${slug} path=${inboundUrl.pathname}`)
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const tokenScope = c.get('tokenScope')
    if (tokenScope !== undefined && !ALLOWED_WORKSPACE_PLUGIN_SCOPES.has(tokenScope)) {
      logger.warn(`Token with scope '${tokenScope}' attempted to access workspace-plugin opencode proxy`)
      return c.json({ error: 'Forbidden: insufficient token scope' }, 403)
    }

    const rewritten = new URL(inbound.url)
    const prefix = `/api/workspace-plugin/opencode/${slug}`
    const rest = inboundUrl.pathname.slice(prefix.length) || '/'
    rewritten.pathname = `/api/opencode${rest}`

    const forwardedHeaders = new Headers(inbound.headers)
    forwardedHeaders.set('x-opencode-manager-project', slug)
    const forwarded = new Request(rewritten.toString(), {
      method: inbound.method,
      headers: forwardedHeaders,
      body: inbound.method === 'GET' || inbound.method === 'HEAD' ? undefined : inbound.body,
    })

    return proxyRequest(forwarded, projectService)
  })

  return app
}
