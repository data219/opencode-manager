import { z } from "zod"

export const PluginOptionsSchema = z.object({
  url: z.string().url().optional(),
  token: z.string().min(1).optional(),
})

export type PluginOptions = z.infer<typeof PluginOptionsSchema>

export type ManagerProject = {
  slug: string
  name: string
  directory: string
  description?: string
}
