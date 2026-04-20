import type { ManagerProject } from "./types.js"

export class ManagerClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, "content-type": "application/json" }
  }

  async listProjects(): Promise<ManagerProject[]> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/workspace-plugin/projects`, {
      headers: this.headers(),
    })
    if (!res.ok) throw new Error(`manager listProjects failed: ${res.status} ${res.statusText}`)
    const json = (await res.json()) as { projects: ManagerProject[] }
    return json.projects ?? []
  }
}
