import type { Plugin, WorkspaceAdaptor, WorkspaceInfo } from "@opencode-ai/plugin"
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
      const base = cfg.url.replace(/\/$/, "")
      const url = `${base}/api/workspace-plugin/opencode/${encodeURIComponent(project.slug)}`
      pluginLogger.info(`adaptor.target slug=${project.slug} workspaceID=${info.id} url=${url}`)
      return {
        type: "remote" as const,
        url,
        headers: { Authorization: `Bearer ${cfg.token}` },
      }
    },
  }
}

export const OpencodeManagerWorkspacePlugin: Plugin = async ({ experimental_workspace }, options) => {
  try {
    const cfg = resolveConfig(options)
    pluginLogger.info(`plugin.init url=${cfg.url}`)
    const client = new ManagerClient(cfg.url, cfg.token)
    const projects = await client.listProjects()
    pluginLogger.info(`plugin.init loaded ${projects.length} project(s)`)
    for (const project of projects) {
      experimental_workspace.register(`manager:${project.slug}`, makeAdaptor(cfg, project))
    }
    pluginLogger.info(`plugin.ready`)
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
