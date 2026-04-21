import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const PREFIX = "[opencode-manager]"
const LOG_DIR = join(homedir(), ".local", "share", "opencode-manager")
const LOG_FILE = join(LOG_DIR, "plugin.log")

let initialized = false

function ensureLogDir(): void {
  if (initialized) return
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    initialized = true
  } catch {
    // ignore; we'll still try to write
  }
}

function format(level: string, message: string): string {
  const timestamp = new Date().toISOString()
  return `${timestamp} ${PREFIX} [${level}] ${message}`
}

function serializeArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`
  if (typeof arg === "string") return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function emit(level: string, message: string, args: unknown[]): void {
  ensureLogDir()
  const suffix = args.length > 0 ? " " + args.map(serializeArg).join(" ") : ""
  const line = format(level, message) + suffix + "\n"
  try {
    appendFileSync(LOG_FILE, line)
  } catch {
    // fall back to stderr as last resort
    process.stderr.write(line)
  }
}

export const pluginLogger = {
  info(message: string, ...args: unknown[]): void {
    emit("info", message, args)
  },
  warn(message: string, ...args: unknown[]): void {
    emit("warn", message, args)
  },
  error(message: string, ...args: unknown[]): void {
    emit("error", message, args)
  },
}
