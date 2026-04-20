import type { Migration } from '../migration-runner'

const migration: Migration = {
  version: 12,
  name: 'api-tokens',

  up(db) {
    db.run(`
      CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT 'workspace-plugin',
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `)

    db.run('CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)')
    db.run('CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id)')
  },

  down(db) {
    db.run('DROP TABLE IF EXISTS api_tokens')
  },
}

export default migration
