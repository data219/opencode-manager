import { createMiddleware } from 'hono/factory'
import type { Database } from 'bun:sqlite'
import type { AuthInstance, Session } from './index'
import { ApiTokenService } from '../services/api-tokens'
import { logger } from '../utils/logger'

interface UserRow {
  id: string
  name: string
  email: string
  emailVerified: number | boolean | null
  image: string | null
  createdAt: string | number | null
  updatedAt: string | number | null
  role: string | null
}

function loadUserById(db: Database, userId: string): Session['user'] | null {
  const row = db
    .prepare('SELECT id, name, email, emailVerified, image, createdAt, updatedAt, role FROM "user" WHERE id = ?')
    .get(userId) as UserRow | undefined

  if (!row) return null

  const toDate = (value: string | number | null): Date => {
    if (!value) return new Date()
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: Boolean(row.emailVerified),
    image: row.image,
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    role: row.role ?? undefined,
  }
}

export function createAuthMiddleware(
  auth: AuthInstance,
  apiTokenService?: ApiTokenService,
  db?: Database,
) {
  return createMiddleware<{
    Variables: {
      session: Session['session']
      user: Session['user']
      tokenScope?: string
    }
  }>(async (c, next) => {
    const cookies = c.req.header('cookie')
    const origin = c.req.header('origin')

    logger.debug(`Auth check - Path: ${c.req.path}, Origin: ${origin}, Has cookies: ${!!cookies}`)
    if (cookies) {
      const cookieNames = cookies.split(';').map(c => c.trim().split('=')[0]).join(', ')
      logger.debug(`Cookie names: ${cookieNames}`)
    }

    let session: Session | null = null
    try {
      const result = await auth.api.getSession({
        headers: c.req.raw.headers,
      })
      session = (result as Session | null) ?? null
    } catch (error) {
      logger.error('Session lookup failed', { error })
      return c.json({ error: 'Internal Server Error' }, 500)
    }

    logger.debug(`Session result: ${session ? 'found' : 'not found'}`)

    let tokenScope: string | undefined

    if (!session && apiTokenService) {
      const authHeader = c.req.header('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        const raw = authHeader.slice(7).trim()
        const verified = apiTokenService.verify(raw)
        if (verified) {
          tokenScope = verified.scope

          const realUser = db ? loadUserById(db, verified.userId) : null
          if (!realUser) {
            logger.warn(`Bearer token references unknown user ${verified.userId}`)
            return c.json({ error: 'Unauthorized' }, 401)
          }

          session = {
            session: {
              id: `token-${verified.id}`,
              userId: verified.userId,
              token: 'bearer',
              expiresAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            user: realUser,
          }
          logger.debug(`Bearer token verified for user ${verified.userId} (scope: ${verified.scope})`)
        }
      }
    }

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('session', session.session)
    c.set('user', session.user)
    if (tokenScope !== undefined) {
      c.set('tokenScope', tokenScope)
    }
    await next()
  })
}
