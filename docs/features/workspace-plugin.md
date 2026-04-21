# Workspace Plugin

The workspace plugin connects a local OpenCode TUI to a running opencode-manager instance and exposes its projects as local workspaces.

## Overview

The plugin uses the manager **only** to discover the list of projects. Once projects are registered, all runtime traffic (sessions, messages, SSE, WebSockets) flows through the in-process opencode server. The manager is not a proxy for OpenCode traffic.

Two components:

1. **Manager-side**: `GET /api/workspace-plugin/projects` endpoint plus bearer-token auth.
2. **Plugin** (`@opencode-manager/workspace-plugin`): An OpenCode plugin that calls the manager at startup, then configures each workspace with the project's local directory.

## Features

- Bearer token auth for manager discovery.
- Local workspace targeting — all session ops run in-process against the repository directory.
- Native SSE and WebSocket support via the opencode server.

## Setup

### 1. Create an API Token

1. Open your opencode-manager web UI.
2. Navigate to Settings → API Tokens.
3. Click "Create Token".
4. Give it a descriptive name (e.g., "OpenCode TUI").
5. **Copy the token immediately** — it won't be shown again.

### 2. Install the Plugin

In your OpenCode configuration (`opencode.json`):

```json
{
  "plugin": [
    ["@opencode-manager/workspace-plugin", {
      "url": "http://localhost:5003",
      "token": "<bearer-token>"
    }]
  ]
}
```

Or use environment variables:

```bash
export OPENCODE_MANAGER_URL="http://localhost:5003"
export OPENCODE_MANAGER_TOKEN="<bearer-token>"
```

### 3. Start OpenCode TUI

Launch the TUI and attach to the manager's opencode server:

```bash
opencode attach http://localhost:5551
```

Manager projects appear in the workspace picker as `manager:<slug>`.

## How It Works

1. **Discovery**: The plugin calls `GET /api/workspace-plugin/projects` on the manager with the bearer token.
2. **Registration**: For each project returned, the plugin registers a `WorkspaceAdaptor` as `manager:<slug>`.
3. **Selection**: When the user picks a workspace, the adaptor returns `{ type: "local", directory: project.directory }`.
4. **Runtime**: The opencode server uses the directory to scope the session to that project's repository. All operations run in-process against the local filesystem.

## API Reference

### `GET /api/workspace-plugin/projects`

Returns a list of projects available in the manager.

**Authentication**: Bearer token with `workspace-plugin` or `*` scope.

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

### `POST /api/settings/tokens`

Create a new API token. The raw token is returned in the response only once.

### `DELETE /api/settings/tokens/:id`

Revoke an API token.

## Security Considerations

- **Token storage**: Manager tokens are stored as SHA-256 hashes.
- **One-time display**: Raw tokens are shown only once.
- **Scope restriction**: Default `workspace-plugin` scope grants access only to `/api/workspace-plugin/*`.

## Token Scopes

- `workspace-plugin`: Access to `/api/workspace-plugin/*` (default).
- `*`: Full access to all protected endpoints.

## Troubleshooting

### Plugin fails to connect

1. Verify the manager URL is correct and reachable.
2. Check that the token is valid and not expired.
3. Ensure the token scope is `workspace-plugin` or `*`.
4. Check the manager logs for authentication errors.

### Projects don't appear

1. Verify the manager has projects configured.
2. Check that the token has not been revoked.
3. Look for errors in the OpenCode TUI plugin logs.

### Session operations fail after project shows up

1. Verify the project directory exists on the local filesystem.
2. Check that the directory is accessible and has proper permissions.
3. Look for errors in the opencode server logs.

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
