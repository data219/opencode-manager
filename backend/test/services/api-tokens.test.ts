import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { ApiTokenService } from '../../src/services/api-tokens'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'

describe('ApiTokenService', () => {
  let db: Database
  let service: ApiTokenService
  const testUserId = 'test-user-123'

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    service = new ApiTokenService(db)
  })

  describe('create', () => {
    it('returns raw token on creation', () => {
      const result = service.create(testUserId, 'test-token')
      
      expect(result.id).toBeDefined()
      expect(result.name).toBe('test-token')
      expect(result.token).toBeDefined()
      expect(result.token.length).toBeGreaterThan(0)
    })

    it('generates different tokens on identical calls', () => {
      const result1 = service.create(testUserId, 'test-token')
      const result2 = service.create(testUserId, 'test-token')
      
      expect(result1.token).not.toBe(result2.token)
      expect(result1.id).not.toBe(result2.id)
    })

    it('stores token with correct scope', () => {
      const result = service.create(testUserId, 'test-token', 'custom-scope')
      
      const tokens = service.list(testUserId)
      const created = tokens.find(t => t.id === result.id)
      
      expect(created).toBeDefined()
      expect(created?.scope).toBe('custom-scope')
    })

    it('stores expiration time when provided', () => {
      const expiresAt = Date.now() + 3600000
      const result = service.create(testUserId, 'test-token', 'workspace-plugin', expiresAt)
      
      const tokens = service.list(testUserId)
      const created = tokens.find(t => t.id === result.id)
      
      expect(created?.expiresAt).toBe(expiresAt)
    })
  })

  describe('verify', () => {
    it('returns userId and scope for valid token', () => {
      const createResult = service.create(testUserId, 'test-token', 'workspace-plugin')
      
      const verified = service.verify(createResult.token)
      
      expect(verified).toBeDefined()
      expect(verified?.userId).toBe(testUserId)
      expect(verified?.scope).toBe('workspace-plugin')
      expect(verified?.id).toBe(createResult.id)
    })

    it('returns null for unknown token', () => {
      const verified = service.verify('unknown-token')
      
      expect(verified).toBeNull()
    })

    it('returns null for expired token', () => {
      const expiredAt = Date.now() - 3600000
      const createResult = service.create(testUserId, 'test-token', 'workspace-plugin', expiredAt)
      
      const verified = service.verify(createResult.token)
      
      expect(verified).toBeNull()
    })

    it('returns null for revoked token', () => {
      const createResult = service.create(testUserId, 'test-token')
      
      service.revoke(testUserId, createResult.id)
      const verified = service.verify(createResult.token)
      
      expect(verified).toBeNull()
    })

    it('updates last_used_at on successful verify', () => {
      const createResult = service.create(testUserId, 'test-token')
      const beforeTokens = service.list(testUserId)
      const beforeToken = beforeTokens.find(t => t.id === createResult.id)
      const beforeLastUsed = beforeToken?.lastUsedAt
      
      service.verify(createResult.token)
      
      const afterTokens = service.list(testUserId)
      const afterToken = afterTokens.find(t => t.id === createResult.id)
      
      expect(afterToken?.lastUsedAt).toBeDefined()
      expect(afterToken?.lastUsedAt).toBeGreaterThan(beforeLastUsed ?? 0)
    })
  })

  describe('list', () => {
    it('returns empty array when no tokens exist', () => {
      const tokens = service.list(testUserId)
      
      expect(tokens).toEqual([])
    })

    it('returns tokens for user ordered by creation date', () => {
      service.create(testUserId, 'token1')
      service.create(testUserId, 'token2')
      
      const tokens = service.list(testUserId)
      
      expect(tokens.length).toBe(2)
      expect(tokens[0]?.name).toBe('token2')
      expect(tokens[1]?.name).toBe('token1')
    })

    it('does not expose token hash in list results', () => {
      service.create(testUserId, 'test-token')
      
      const tokens = service.list(testUserId)
      
      expect(tokens[0]).not.toHaveProperty('tokenHash')
      expect(tokens[0]).not.toHaveProperty('token')
    })
  })

  describe('revoke', () => {
    it('returns true when revoking existing token', () => {
      const result = service.create(testUserId, 'test-token')
      
      const revoked = service.revoke(testUserId, result.id)
      
      expect(revoked).toBe(true)
    })

    it('returns false when revoking non-existent token', () => {
      const revoked = service.revoke(testUserId, 'non-existent-id')
      
      expect(revoked).toBe(false)
    })

    it('prevents subsequent verify of revoked token', () => {
      const createResult = service.create(testUserId, 'test-token')
      
      service.revoke(testUserId, createResult.id)
      const verified = service.verify(createResult.token)
      
      expect(verified).toBeNull()
    })

    it('only revokes tokens belonging to the user', () => {
      const user1Token = service.create('user1', 'token1')
      service.create('user2', 'token2')
      
      const revoked = service.revoke('user2', user1Token.id)
      
      expect(revoked).toBe(false)
    })
  })
})
