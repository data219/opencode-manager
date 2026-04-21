import { pluginLogger } from "./logger.js"
import type { ManagerProject } from "./types.js"

export class ManagerClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "content-type": "application/json" }
  }

  async listProjects(): Promise<ManagerProject[]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/workspace-plugin/projects`
    pluginLogger.info(`client.listProjects start url=${url}`)
    try {
      const res = await fetch(url, { headers: this.headers() })
      if (!res.ok) {
        pluginLogger.error(`client.listProjects http_error status=${res.status} statusText=${res.statusText}`)
        throw new Error(`manager listProjects failed: ${res.status} ${res.statusText}`)
      }
      const json = (await res.json()) as { projects: ManagerProject[] }
      const projects = json.projects ?? []
      pluginLogger.info(`client.listProjects ok count=${projects.length}`)
      return projects
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("manager listProjects failed")) {
        throw error
      }
      pluginLogger.error(`client.listProjects network_error`, error)
      throw error
    }
  }
}
