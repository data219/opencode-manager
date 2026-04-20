# @opencode-manager/workspace-plugin

Connect your local OpenCode TUI to a running opencode-manager instance and use its projects as remote workspaces.

## Installation

Add the plugin to your `opencode.json` configuration:

```json
{
  "plugin": [
    ["@opencode-manager/workspace-plugin", {
      "url": "https://manager.example.com",
      "token": "<bearer token from manager settings>"
    }]
  ]
}
```

## Configuration

### Options

- `url` (required): The base URL of your opencode-manager instance
- `token` (required): Bearer token created from the manager's Settings page

### Environment Variables

As an alternative to configuring in `opencode.json`, you can use:

- `OPENCODE_MANAGER_URL`: The base URL of your opencode-manager instance
- `OPENCODE_MANAGER_TOKEN`: Bearer token for authentication

## Usage

Once configured, the plugin will automatically discover all projects in your opencode-manager instance and register them as remote workspaces. Each project will appear in the OpenCode TUI workspace picker as `manager:<slug>`.

### Creating a Bearer Token

1. Open your opencode-manager web UI
2. Navigate to Settings → API Tokens
3. Click "Create Token"
4. Give it a name (e.g., "OpenCode TUI")
5. Copy the token immediately (it won't be shown again)
6. Paste it into your `opencode.json` or set `OPENCODE_MANAGER_TOKEN`

### Token Scope

Tokens created for the workspace plugin have the `workspace-plugin` scope by default. This restricts their access to only the workspace plugin endpoints.

## How It Works

1. On startup, the plugin calls `GET /api/workspace-plugin/projects` on the manager
2. For each project returned, it registers a `WorkspaceAdaptor` with type `manager:<slug>`
3. When you select a workspace in the TUI, the adaptor provides:
   - Remote target URL: `<manager>/api/opencode`
   - Authorization header: `Bearer <token>`
   - Project slug header: `x-opencode-manager-project: <slug>`

The manager then proxies requests to the embedded OpenCode server with the appropriate `?directory=` parameter.

## Security Notes

- Bearer tokens are stored hashed (SHA-256) in the manager database
- Tokens are shown only once on creation
- Tokens can be revoked at any time from the Settings page
- Tokens bypass CORS origin requirements (explicit opt-in authentication)
