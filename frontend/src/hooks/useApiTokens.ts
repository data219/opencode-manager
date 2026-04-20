import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ApiToken {
  id: string
  name: string
  scope: string
  lastUsedAt: number | null
  createdAt: number
  expiresAt: number | null
}

interface CreateTokenResult {
  id: string
  name: string
  token: string
}

export function useApiTokens() {
  const queryClient = useQueryClient()
  const [showNewToken, setShowNewToken] = useState<string | null>(null)

  const { data: tokens, isLoading, error } = useQuery<{ tokens: ApiToken[] }, Error>({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const res = await fetch('/api/settings/tokens')
      if (!res.ok) throw new Error('Failed to fetch tokens')
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; scope?: string; expiresAt?: number }): Promise<CreateTokenResult> => {
      const res = await fetch('/api/settings/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create token')
      return res.json()
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setShowNewToken(result.token)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/tokens/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to revoke token')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  const createToken = useCallback((data: { name: string; scope?: string; expiresAt?: number }) => {
    createMutation.mutate(data)
  }, [createMutation])

  const revokeToken = useCallback((id: string) => {
    revokeMutation.mutate(id)
  }, [revokeMutation])

  const clearNewToken = useCallback(() => {
    setShowNewToken(null)
  }, [])

  return {
    tokens: tokens?.tokens ?? [],
    isLoading,
    error,
    createToken,
    revokeToken,
    showNewToken,
    clearNewToken,
    isCreating: createMutation.isPending,
    isRevoking: revokeMutation.isPending,
  }
}
