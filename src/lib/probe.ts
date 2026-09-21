import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { inspectClaudeSubscription } from "./claude-subscription"
import type { ExecutorId, ProbeResult, Settings } from "./types"

const exec = promisify(execFile)

async function lookupOnPath(cmd: string): Promise<string | null> {
  const tool = process.platform === "win32" ? "where" : "which"
  try {
    const { stdout } = await exec(tool, [cmd], { timeout: 4000, windowsHide: true })
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("INFO:"))
    return first || null
  } catch {
    return null
  }
}

function exists(file: string) {
  try {
    fs.accessSync(file)
    return true
  } catch {
    return false
  }
}

function knownBins(name: string): string[] {
  const home = os.homedir()
  const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local")
  const candidates: string[] = []
  if (name === "agent" || name === "cursor-agent" || name === "cursor") {
    candidates.push(
      path.join(home, ".local", "bin", "agent"),
      path.join(home, ".local", "bin", "agent.exe"),
      path.join(home, ".local", "bin", "cursor-agent"),
      path.join(home, ".local", "bin", "cursor-agent.exe"),
      path.join(local, "cursor-agent", "agent.exe"),
      path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"),
      path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor.exe"),
      path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor")
    )
  }
  if (process.platform === "win32") {
    candidates.push(`${name}.cmd`, `${name}.exe`)
  }
  return candidates
}

async function version(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: 5000, windowsHide: true })
    const text = (stdout || stderr).trim().split(/\r?\n/)[0]
    return text.slice(0, 120) || null
  } catch {
    return null
  }
}

export async function findBinary(names: string[]) {
  for (const name of names) {
    const fromPath = await lookupOnPath(name)
    if (fromPath) return fromPath
    for (const extra of knownBins(name)) {
      if (exists(extra)) return extra
    }
  }
  return null
}

export async function probeExecutors(settings: Settings): Promise<ProbeResult[]> {
  const claude = await inspectClaudeSubscription()
  const hasApiKey = Boolean(settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY)
  const codexPath = await findBinary(["codex"])
  const codexVer = codexPath ? await version(codexPath, ["--version"]) : null
  const cursorPath = await findBinary(["cursor-agent", "agent", "cursor"])
  const cursorKey = Boolean(settings.cursorApiKey || process.env.CURSOR_API_KEY)

  return [
    {
      executor: "claude" as ExecutorId,
      available: claude.ready || hasApiKey,
      detail: claude.ready
        ? claude.detail
        : hasApiKey
          ? "Запасной ключ API задан. Это не подписка claude.ai"
          : claude.detail,
    },
    {
      executor: "claude-code" as ExecutorId,
      available: claude.installed && (claude.loggedIn || hasApiKey),
      detail: claude.installed
        ? `${claude.binary ?? "claude"}${
            claude.loggedIn ? " · подписка" : hasApiKey ? " · ключ API" : " · нужен claude login"
          }`
        : "CLI `claude` не найден. Установите Claude Code и выполните claude login",
    },
    {
      executor: "codex" as ExecutorId,
      available: Boolean(codexPath),
      detail: codexPath
        ? `${codexPath}${codexVer ? ` · ${codexVer}` : ""}${
            settings.starimgApiKey || settings.openaiApiKey || process.env.STARIMG_API_KEY
              ? " · ключ шлюза есть"
              : " · нет ключа ai.starimg / OpenAI"
          }`
        : "CLI `codex` не найден в PATH",
    },
    {
      executor: "cursor" as ExecutorId,
      available: Boolean(cursorPath) || cursorKey,
      detail: cursorPath
        ? `${cursorPath}${cursorKey ? " · ключ задан" : " · аккаунт Cursor / agent login"}`
        : cursorKey
          ? "Ключ есть, CLI Cursor не найден в PATH"
          : "Нет CLI Cursor. Поставь agent и выполни agent login — это тот же аккаунт, что в Cursor.",
    },
    {
      executor: "local" as ExecutorId,
      available: true,
      detail: "Встроенный исполнитель Артели всегда доступен",
    },
  ]
}
