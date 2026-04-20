import { Database } from 'bun:sqlite'
import crypto from 'crypto'

export interface ApiToken {
  id: string
  userId: string
  name: string
  tokenHash: string
  scope: string
  lastUsedAt: number | null
  createdAt: number
  expiresAt: number | null
}

export interface ApiTokenCreateResult {
  id: string
  name: string
  token: string
}

export interface ApiTokenVerifyResult {
  userId: string
  scope: string
  id: string
}

export class ApiTokenService {
  constructor(private db: Database) {}

  create(userId: string, name: string, scope = 'workspace-plugin', expiresAt?: number): ApiTokenCreateResult {
    const id = crypto.randomUUID()
    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const createdAt = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO api_tokens (id, user_id, name, token_hash, scope, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, userId, name, tokenHash, scope, createdAt, expiresAt ?? null)

    return { id, name, token: rawToken }
  }

  list(userId: string): Omit<ApiToken, 'tokenHash'>[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, name, scope, last_used_at, created_at, expires_at
      FROM api_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC, rowid DESC
    `)

    const rows = stmt.all(userId) as Array<{
      id: string
      user_id: string
      name: string
      scope: string
      last_used_at: number | null
      created_at: number
      expires_at: number | null
    }>

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      scope: row.scope,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }))
  }

  revoke(userId: string, id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM api_tokens
      WHERE id = ? AND user_id = ?
    `)

    const result = stmt.run(id, userId)
    return result.changes > 0
  }

  verify(rawToken: string): ApiTokenVerifyResult | null {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const stmt = this.db.prepare(`
      SELECT id, user_id, scope, expires_at
      FROM api_tokens
      WHERE token_hash = ?
    `)

    const row = stmt.get(tokenHash) as { id: string; user_id: string; scope: string; expires_at: number | null } | undefined

    if (!row) {
      return null
    }

    if (row.expires_at && row.expires_at < Date.now()) {
      return null
    }

    const updateStmt = this.db.prepare(`
      UPDATE api_tokens
      SET last_used_at = ?
      WHERE id = ?
    `)

    updateStmt.run(Date.now(), row.id)

    return {
      userId: row.user_id,
      scope: row.scope,
      id: row.id,
    }
  }

  getById(userId: string, id: string): Omit<ApiToken, 'tokenHash'> | null {
    const stmt = this.db.prepare(`
      SELECT id, user_id, name, scope, last_used_at, created_at, expires_at
      FROM api_tokens
      WHERE id = ? AND user_id = ?
    `)

    const row = stmt.get(id, userId) as {
      id: string
      user_id: string
      name: string
      scope: string
      last_used_at: number | null
      created_at: number
      expires_at: number | null
    } | undefined

    if (!row) {
      return null
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      scope: row.scope,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }
  }
}
