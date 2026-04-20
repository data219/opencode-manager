import { useState, useEffect } from 'react'
import { useApiTokens } from '@/hooks/useApiTokens'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Key, Trash2, Copy, Check, X } from 'lucide-react'

const NEW_TOKEN_AUTO_DISMISS_MS = 60_000

export function ApiTokensPanel() {
  const {
    tokens,
    isLoading,
    createToken,
    revokeToken,
    showNewToken,
    clearNewToken,
    isCreating,
    isRevoking,
  } = useApiTokens()
  const [newTokenName, setNewTokenName] = useState('')
  const [copied, setCopied] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    if (!showNewToken) return
    const timer = window.setTimeout(clearNewToken, NEW_TOKEN_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [showNewToken, clearNewToken])

  const handleCreate = () => {
    const trimmed = newTokenName.trim()
    if (!trimmed) return
    createToken({ name: trimmed })
    setNewTokenName('')
    setCreateDialogOpen(false)
  }

  const handleCopy = async () => {
    if (!showNewToken) return
    try {
      await navigator.clipboard.writeText(showNewToken)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never'
    return new Date(timestamp).toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Tokens</h3>
          <p className="text-sm text-muted-foreground">
            Manage API tokens for external access
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Key className="w-4 h-4 mr-2" />
              Create Token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Token</DialogTitle>
              <DialogDescription>
                Create a new API token for workspace plugin access. The token will be shown once and cannot be retrieved again.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="token-name">Token Name</Label>
              <Input
                id="token-name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="e.g., OpenCode TUI"
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setNewTokenName('')
                  setCreateDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating || !newTokenName.trim()}>
                {isCreating ? 'Creating...' : 'Create Token'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {showNewToken && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <AlertDescription className="text-green-800 dark:text-green-200">
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-sm break-all flex-1">
                {showNewToken}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearNewToken}
                  aria-label="Dismiss token"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs mt-2 font-semibold">
              Copy this token now. It will not be shown again and will auto-dismiss shortly.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading tokens...</div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No API tokens yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <Card key={token.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{token.name}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Scope: {token.scope}</span>
                    <span>Created: {formatDate(token.createdAt)}</span>
                    <span>Last used: {formatDate(token.lastUsedAt)}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => revokeToken(token.id)}
                  disabled={isRevoking}
                  aria-label={`Revoke token ${token.name}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
