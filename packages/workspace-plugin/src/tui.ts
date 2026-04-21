import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { pluginLogger } from "./logger.js"

const MANAGER_WORKSPACE_PREFIX = "manager:"

type WorkspaceRecord = {
  id: string
  type: string
}

type PrewarmResult = {
  ok: number
  failed: number
  durationMs: number
}

async function prewarmWorkspace(api: TuiPluginApi, workspaceID: string): Promise<PrewarmResult> {
  const started = Date.now()
  const client = api.client
  const scoped = { workspace: workspaceID }

  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: "config.get", run: () => client.config.get(scoped) },
    { name: "config.providers", run: () => client.config.providers(scoped) },
    { name: "provider.list", run: () => client.provider.list(scoped) },
    { name: "provider.auth", run: () => client.provider.auth(scoped) },
    { name: "app.agents", run: () => client.app.agents(scoped) },
    { name: "command.list", run: () => client.command.list(scoped) },
    { name: "vcs.get", run: () => client.vcs.get(scoped) },
    { name: "session.status", run: () => client.session.status(scoped) },
    { name: "lsp.status", run: () => client.lsp.status(scoped) },
    { name: "formatter.status", run: () => client.formatter.status(scoped) },
  ]

  const outcomes = await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run()
        return true
      } catch (error) {
        pluginLogger.warn(`tui.prewarm task failed workspaceID=${workspaceID} task=${task.name}`, error)
        return false
      }
    }),
  )

  const ok = outcomes.filter(Boolean).length
  return { ok, failed: outcomes.length - ok, durationMs: Date.now() - started }
}

async function refreshWorkspaceIndex(api: TuiPluginApi, index: Map<string, WorkspaceRecord>): Promise<void> {
  try {
    const res = await api.client.experimental.workspace.list()
    const list = res.data ?? []
    index.clear()
    for (const item of list) {
      if (typeof item.id !== "string" || typeof item.type !== "string") continue
      index.set(item.id, { id: item.id, type: item.type })
    }
    pluginLogger.info(`tui.workspaceIndex refreshed count=${index.size}`)
  } catch (error) {
    pluginLogger.warn(`tui.workspaceIndex refresh failed`, error)
  }
}

function isManagerWorkspace(record: WorkspaceRecord | undefined): boolean {
  return !!record && record.type.startsWith(MANAGER_WORKSPACE_PREFIX)
}

export const OpencodeManagerWorkspaceTuiPlugin: TuiPlugin = async (api) => {
  pluginLogger.info(`tui.init`)

  const workspaceIndex = new Map<string, WorkspaceRecord>()
  const inflight = new Map<string, Promise<PrewarmResult>>()

  const runPrewarm = (workspaceID: string, reason: string) => {
    const existing = inflight.get(workspaceID)
    if (existing) return existing

    pluginLogger.info(`tui.prewarm start workspaceID=${workspaceID} reason=${reason}`)
    const task = prewarmWorkspace(api, workspaceID)
      .then((result) => {
        pluginLogger.info(
          `tui.prewarm done workspaceID=${workspaceID} reason=${reason} ok=${result.ok} failed=${result.failed} durationMs=${result.durationMs}`,
        )
        return result
      })
      .finally(() => {
        inflight.delete(workspaceID)
      })

    inflight.set(workspaceID, task)
    return task
  }

  await refreshWorkspaceIndex(api, workspaceIndex)

  const offSessionCreated = api.event.on("session.created", (event) => {
    const workspaceID = event.properties.info.workspaceID
    if (!workspaceID) return

    const record = workspaceIndex.get(workspaceID)
    if (isManagerWorkspace(record)) {
      void runPrewarm(workspaceID, "session.created")
      return
    }

    void refreshWorkspaceIndex(api, workspaceIndex).then(() => {
      const refreshed = workspaceIndex.get(workspaceID)
      if (isManagerWorkspace(refreshed)) {
        void runPrewarm(workspaceID, "session.created:after-refresh")
      }
    })
  })

  const offWorkspaceStatus = api.event.on("workspace.status", (event) => {
    const { workspaceID, status } = event.properties
    if (status !== "connected") return

    const record = workspaceIndex.get(workspaceID)
    if (isManagerWorkspace(record)) {
      void runPrewarm(workspaceID, "workspace.status:connected")
      return
    }

    void refreshWorkspaceIndex(api, workspaceIndex).then(() => {
      const refreshed = workspaceIndex.get(workspaceID)
      if (isManagerWorkspace(refreshed)) {
        void runPrewarm(workspaceID, "workspace.status:connected:after-refresh")
      }
    })
  })

  api.lifecycle.onDispose(() => {
    offSessionCreated()
    offWorkspaceStatus()
    pluginLogger.info(`tui.dispose`)
  })
}

export default {
  id: "opencode-manager-workspace",
  tui: OpencodeManagerWorkspaceTuiPlugin,
}
