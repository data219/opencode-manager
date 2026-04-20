import { Hono } from 'hono'
import { z } from 'zod'
import { ApiTokenService } from '../services/api-tokens'
import { logger } from '../utils/logger'
import type { Session } from '../auth'

type AppVariables = {
  session: Session['session']
  user: Session['user']
}

const CreateTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scope: z.string().optional().default('workspace-plugin'),
  expiresAt: z.number().optional(),
})

export function createApiTokenRoutes(apiTokenService: ApiTokenService) {
  const app = new Hono<{ Variables: AppVariables }>()

  app.get('/', async (c) => {
    try {
      const session = c.get('session')
      if (!session) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const tokens = apiTokenService.list(session.userId)
      return c.json({
        tokens: tokens.map(t => ({
          id: t.id,
          name: t.name,
          scope: t.scope,
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
        })),
      })
    } catch (error) {
      logger.error('Failed to list API tokens:', error)
      return c.json({ error: 'Failed to list API tokens' }, 500)
    }
  })

  app.post('/', async (c) => {
    try {
      const session = c.get('session')
      if (!session) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const body = await c.req.json()
      const validated = CreateTokenSchema.parse(body)

      const result = apiTokenService.create(
        session.userId,
        validated.name,
        validated.scope,
        validated.expiresAt,
      )

      logger.info(`Created API token '${result.name}' for user ${session.userId}`)

      return c.json({
        id: result.id,
        name: result.name,
        token: result.token,
      })
    } catch (error) {
      logger.error('Failed to create API token:', error)
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Invalid token data', details: error.issues }, 400)
      }
      return c.json({ error: 'Failed to create API token' }, 500)
    }
  })

  app.delete('/:id', async (c) => {
    try {
      const session = c.get('session')
      if (!session) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const id = c.req.param('id')
      const revoked = apiTokenService.revoke(session.userId, id)

      if (!revoked) {
        return c.json({ error: 'Token not found' }, 404)
      }

      logger.info(`Revoked API token '${id}' for user ${session.userId}`)

      return c.json({ success: true })
    } catch (error) {
      logger.error('Failed to revoke API token:', error)
      return c.json({ error: 'Failed to revoke API token' }, 500)
    }
  })

  return app
}
