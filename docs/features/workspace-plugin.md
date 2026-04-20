# Workspace Plugin

The workspace plugin allows you to connect your local OpenCode TUI to a running opencode-manager instance and use its projects as remote workspaces.

## Overview

The workspace plugin consists of two main components:

1. **Manager-side**: Backend endpoints and authentication for serving project information
2. **Plugin**: An OpenCode plugin that connects to the manager and registers remote workspaces

## Features

- **Bearer Token Authentication**: Secure API tokens for external access
- **Project Discovery**: Automatically discover and register all manager projects
- **Remote Workspace Support**: Use manager projects as remote workspaces in OpenCode TUI
- **SSE Streaming**: Server-sent events are properly streamed (not buffered)
- **WebSocket Support**: WebSocket connections are proxied correctly

## Setup

### 1. Create an API Token

1. Open your opencode-manager web UI
2. Navigate to Settings → API Tokens
3. Click "Create Token"
4. Give it a descriptive name (e.g., "OpenCode TUI")
5. **Copy the token immediately** - it won't be shown again
6. Store the token securely

### 2. Install the Plugin

In your OpenCode configuration (`opencode.json`), add:

```json
{
  "plugin": [
    ["@opencode-manager/workspace-plugin", {
      "url": "http://localhost:5003",
      "token": "<your-bearer-token>"
    }]
  ]
}
```

Or use environment variables:

```bash
export OPENCODE_MANAGER_URL="http://localhost:5003"
export OPENCODE_MANAGER_TOKEN="<your-bearer-token>"
```

### 3. Start OpenCode TUI

Launch the OpenCode TUI. You should see your manager projects appear in the workspace picker as `manager:<slug>`.

## How It Works

1. **Plugin Initialization**: When OpenCode starts, the plugin calls `GET /api/workspace-plugin/projects` on the manager
2. **Project Registration**: For each project returned, the plugin registers a `WorkspaceAdaptor` with type `manager:<slug>`
3. **Workspace Selection**: When you select a workspace in the TUI, the adaptor provides:
   - Remote target URL: `<manager>/api/opencode`
   - Authorization header: `Bearer <token>`
   - Project slug header: `x-opencode-manager-project: <slug>`
4. **Request Proxying**: The manager proxies requests to the embedded OpenCode server with the appropriate `?directory=` parameter

## API Reference

### `GET /api/workspace-plugin/projects`

Returns a list of projects available in the manager.

**Authentication**: Bearer token or session cookie

**Response**:
```json
{
  "projects": [
    {
      "slug": "1",
      "name": "my-project",
      "directory": "/path/to/project",
      "description": "https://github.com/user/repo.git"
    }
  ]
}
```

### `GET /api/settings/tokens`

List all API tokens for the current user.

**Response**:
```json
{
  "tokens": [
    {
      "id": "uuid",
      "name": "token-name",
      "scope": "workspace-plugin",
      "lastUsedAt": 1234567890,
      "createdAt": 1234567890,
      "expiresAt": null
    }
  ]
}
```

### `POST /api/settings/tokens`

Create a new API token.

**Request**:
```json
{
  "name": "token-name",
  "scope": "workspace-plugin",
  "expiresAt": 1234567890
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "token-name",
  "token": "raw-token-shown-once"
}
```

### `DELETE /api/settings/tokens/:id`

Revoke an API token.

## Security Considerations

- **Token Storage**: Tokens are stored as SHA-256 hashes in the database
- **One-Time Display**: Raw tokens are shown only once on creation
- **Token Revocation**: Tokens can be revoked at any time from the Settings UI
- **Scope Restriction**: Tokens have a `workspace-plugin` scope by default
- **CORS Bypass**: Bearer tokens bypass CORS origin requirements (explicit opt-in)

## Token Scopes

- `workspace-plugin`: Access to workspace plugin endpoints (default)
- `*`: Full access to all protected endpoints

## Troubleshooting

### Plugin fails to connect

1. Verify the manager URL is correct and accessible
2. Check that the token is valid and not expired
3. Ensure the token has the correct scope (`workspace-plugin`)
4. Check the manager logs for authentication errors

### Projects don't appear

1. Verify the manager has projects configured
2. Check that the token has not been revoked
3. Look for errors in the OpenCode TUI console

### SSE events not streaming

The proxy has been updated to stream response bodies instead of buffering. If you experience issues:

1. Check that the manager is running the latest version
2. Verify the upstream OpenCode server is sending proper SSE headers
3. Look for buffering in network inspection tools

## Development

### Testing the Plugin

```bash
cd packages/workspace-plugin
pnpm test
pnpm typecheck
```

### Testing the Manager

```bash
cd backend
pnpm test test/services/api-tokens.test.ts
pnpm test test/routes/workspace-plugin.test.ts
```
