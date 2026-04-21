import type { Plugin, WorkspaceAdaptor, WorkspaceInfo } from "@opencode-ai/plugin"
import { ManagerClient } from "./client.js"
import { pluginLogger } from "./logger.js"
import { PluginOptionsSchema, type ManagerProject } from "./types.js"

export function resolveConfig(options: unknown): { url: string; token: string } {
  const parsed = PluginOptionsSchema.parse(options ?? {})
  const url = parsed.url ?? process.env.OPENCODE_MANAGER_URL
  const token = parsed.token ?? process.env.OPENCODE_MANAGER_TOKEN
  if (!url) throw new Error("@opencode-manager/workspace-plugin: missing `url`")
  if (!token) throw new Error("@opencode-manager/workspace-plugin: missing `token`")
  return { url, token }
}

export function makeAdaptor(cfg: { url: string; token: string }, project: ManagerProject): WorkspaceAdaptor {
  return {
    name: `Manager: ${project.name}`,
    description: `Connect to the "${project.name}" project on opencode-manager at ${cfg.url}`,
    configure(info: WorkspaceInfo) {
      const result = { ...info, name: project.name, directory: project.directory, extra: { slug: project.slug } }
      pluginLogger.info(
        `adaptor.configure slug=${project.slug} input=${JSON.stringify(info)} output=${JSON.stringify(result)}`,
      )
      return result
    },
    async create(info, env) {
      pluginLogger.info(
        `adaptor.create slug=${project.slug} info=${JSON.stringify(info)} env_keys=${Object.keys(env ?? {}).join(",")}`,
      )
    },
    async remove(info) {
      pluginLogger.info(`adaptor.remove slug=${project.slug} info=${JSON.stringify(info)}`)
    },
    target(info) {
      const base = cfg.url.replace(/\/$/, "")
      const url = `${base}/api/workspace-plugin/opencode/${encodeURIComponent(project.slug)}`
      const result = {
        type: "remote" as const,
        url,
        headers: { Authorization: `Bearer ${cfg.token}` },
      }
      pluginLogger.info(
        `adaptor.target slug=${project.slug} input=${JSON.stringify(info)} output=${JSON.stringify({ type: result.type, url: result.url })}`,
      )
      return result
    },
  }
}

export const OpencodeManagerWorkspacePlugin: Plugin = async ({ experimental_workspace }, options) => {
  try {
    const cfg = resolveConfig(options)
    pluginLogger.info(
      `plugin.init url=${cfg.url} env.OPENCODE_EXPERIMENTAL_WORKSPACES=${process.env.OPENCODE_EXPERIMENTAL_WORKSPACES ?? "unset"} env.OPENCODE_EXPERIMENTAL=${process.env.OPENCODE_EXPERIMENTAL ?? "unset"}`,
    )
    const client = new ManagerClient(cfg.url, cfg.token)
    const projects = await client.listProjects()
    pluginLogger.info(`plugin.init loaded ${projects.length} project(s)`)
    for (const project of projects) {
      pluginLogger.info(`plugin.register slug=${project.slug} name=${project.name}`)
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
