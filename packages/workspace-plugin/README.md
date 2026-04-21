# @opencode-manager/workspace-plugin

Connect your local OpenCode TUI to a running opencode-manager instance and use its projects as local workspaces.

The plugin queries the manager for the list of projects, then configures each workspace to use the project's local directory. The manager is only used for project discovery; all session operations run in-process against the local repository.

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

- `url` (required): Base URL of your opencode-manager instance. Used only to fetch the project list.
- `token` (required): Bearer token created from the manager's Settings page.

### Environment Variables

As an alternative to configuring in `opencode.json`:

- `OPENCODE_MANAGER_URL`: Base URL of your opencode-manager instance
- `OPENCODE_MANAGER_TOKEN`: Bearer token for manager discovery

## Usage

Once configured, the plugin will discover all projects in your opencode-manager instance and register them as local workspaces. Each project appears in the OpenCode TUI workspace picker as `manager:<slug>`.

### Creating a Bearer Token

1. Open your opencode-manager web UI
2. Navigate to Settings → API Tokens
3. Click "Create Token"
4. Give it a name (e.g., "OpenCode TUI")
5. Copy the token immediately (it won't be shown again)
6. Paste it into your `opencode.json` or set `OPENCODE_MANAGER_TOKEN`

### Token Scope

Tokens created for the workspace plugin have the `workspace-plugin` scope by default. This restricts their access to the `/api/workspace-plugin/projects` endpoint.

### Using the TUI

After starting the opencode-manager server, connect the TUI with:

```bash
opencode attach http://localhost:5551
```

Select a workspace from the manager's project list. Each workspace is rooted at the project's local repository directory.

## How It Works

1. On startup, the plugin calls `GET /api/workspace-plugin/projects` on the manager to enumerate projects.
2. For each project, it registers a `WorkspaceAdaptor` as `manager:<slug>`.
3. When the user selects a workspace, the adaptor returns a `type: "local"` target with the project's directory.
4. All session/message/event traffic flows through the in-process opencode server, scoped to the project's directory.

### TUI pre-warming

The package also ships a TUI plugin (`./tui` subpath) that opencode loads alongside the server plugin. It listens for `session.created` and `workspace.status` events, and when a `manager:*` workspace becomes active it pre-fetches the workspace-scoped endpoints (`config`, `providers`, `agents`, `commands`, `vcs`, `session.status`, etc.) so that the TUI's own `sync.bootstrap` resolves from warm server-side state.

This avoids the race where a newly created workspace appears empty on the first session open and only renders correctly after navigating back and re-entering. No user configuration is required — the single `plugin` entry in `opencode.json` activates both halves.

## Security Notes

- The manager bearer token is only used for project discovery. It never reaches the opencode server.
- Manager bearer tokens are stored hashed (SHA-256) in the manager database and shown only once on creation.
