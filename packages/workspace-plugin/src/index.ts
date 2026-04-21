import type { Plugin, PluginInput, WorkspaceAdaptor, WorkspaceInfo } from "@opencode-ai/plugin"
import { ManagerClient } from "./client.js"
import { pluginLogger } from "./logger.js"
import { PluginOptionsSchema, type ManagerProject } from "./types.js"

export interface ResolvedConfig {
  url: string
  token: string
}

export function resolveConfig(options: unknown): ResolvedConfig {
  const parsed = PluginOptionsSchema.parse(options ?? {})
  const url = parsed.url ?? process.env.OPENCODE_MANAGER_URL
  const token = parsed.token ?? process.env.OPENCODE_MANAGER_TOKEN
  if (!url) throw new Error("@opencode-manager/workspace-plugin: missing `url`")
  if (!token) throw new Error("@opencode-manager/workspace-plugin: missing `token`")
  return { url, token }
}

export function makeAdaptor(cfg: ResolvedConfig, project: ManagerProject): WorkspaceAdaptor {
  return {
    name: `Manager: ${project.name}`,
    description: `Connect to the "${project.name}" project`,
    configure(info: WorkspaceInfo) {
      pluginLogger.info(`adaptor.configure slug=${project.slug} workspaceID=${info.id} dir=${project.directory}`)
      return {
        ...info,
        name: project.name,
        directory: project.directory,
        extra: { slug: project.slug },
      }
    },
    async create(info) {
      pluginLogger.info(`adaptor.create slug=${project.slug} workspaceID=${info.id} dir=${project.directory}`)
    },
    async remove(info) {
      pluginLogger.info(`adaptor.remove slug=${project.slug} workspaceID=${info.id}`)
    },
    target(info) {
      pluginLogger.info(`adaptor.target slug=${project.slug} workspaceID=${info.id} dir=${project.directory}`)
      return { type: "local" as const, directory: project.directory }
    },
  }
}

const prewarmed = new Set<string>()

async function prewarmProject(input: PluginInput, project: ManagerProject): Promise<void> {
  if (prewarmed.has(project.directory)) return
  prewarmed.add(project.directory)
  const start = Date.now()
  try {
    await input.client.project.current({ query: { directory: project.directory } })
    pluginLogger.info(
      `prewarm.ok slug=${project.slug} dir=${project.directory} elapsed_ms=${Date.now() - start}`,
    )
  } catch (error) {
    prewarmed.delete(project.directory)
    pluginLogger.warn(
      `prewarm.failed slug=${project.slug} dir=${project.directory} elapsed_ms=${Date.now() - start}`,
      error,
    )
  }
}

export const OpencodeManagerWorkspacePlugin: Plugin = async (input, options) => {
  try {
    const cfg = resolveConfig(options)
    pluginLogger.info(`plugin.init url=${cfg.url}`)
    const client = new ManagerClient(cfg.url, cfg.token)
    const projects = await client.listProjects()
    pluginLogger.info(`plugin.init loaded ${projects.length} project(s)`)
    for (const project of projects) {
      input.experimental_workspace.register(`manager:${project.slug}`, makeAdaptor(cfg, project))
    }
    pluginLogger.info(`plugin.ready`)
    void Promise.all(projects.map((project) => prewarmProject(input, project)))
    return {}
  } catch (error) {
    pluginLogger.error(`plugin.init failed`, error)
    throw error
  }
}

export default {
  id: "opencode-manager-workspace",
  server: OpencodeManagerWorkspacePlugin,
}
