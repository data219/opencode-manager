import type { Plugin, WorkspaceAdaptor, WorkspaceInfo } from "@opencode-ai/plugin"
import { ManagerClient } from "./client.js"
import { PluginOptionsSchema, type ManagerProject } from "./types.js"

export function resolveConfig(options: unknown): { url: string; token: string } {
  const parsed = PluginOptionsSchema.parse(options ?? {})
  const url = parsed.url ?? process.env.OPENCODE_MANAGER_URL
  const token = parsed.token ?? process.env.OPENCODE_MANAGER_TOKEN
  if (!url) throw new Error("@opencode-manager/workspace-plugin: missing `url`")
  if (!token) throw new Error("@opencode-manager/workspace-plugin: missing `token`")
  return { url, token }
}

function makeAdaptor(cfg: { url: string; token: string }, project: ManagerProject): WorkspaceAdaptor {
  return {
    name: `Manager: ${project.name}`,
    description: `Connect to the "${project.name}" project on opencode-manager at ${cfg.url}`,
    configure(info: WorkspaceInfo) {
      return { ...info, name: project.name, directory: project.directory, extra: { slug: project.slug } }
    },
    async create() {},
    async remove() {},
    target() {
      return {
        type: "remote",
        url: `${cfg.url.replace(/\/$/, "")}/api/opencode`,
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "x-opencode-manager-project": project.slug,
        },
      }
    },
  }
}

export const OpencodeManagerWorkspacePlugin: Plugin = async ({ experimental_workspace }, options) => {
  const cfg = resolveConfig(options)
  const client = new ManagerClient(cfg.url, cfg.token)
  const projects = await client.listProjects()
  for (const project of projects) {
    experimental_workspace.register(`manager:${project.slug}`, makeAdaptor(cfg, project))
  }
  return {}
}

export default OpencodeManagerWorkspacePlugin
