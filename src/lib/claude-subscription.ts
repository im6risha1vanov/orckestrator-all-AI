import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

import type { ClaudeSubscription } from "./types"

export type { ClaudeSubscription }

const exec = promisify(execFile)

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("which", [cmd], { timeout: 3000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

function credentialFiles() {
  const home = os.homedir()
  return [
    path.join(home, ".claude.json"),
    path.join(home, ".claude", ".credentials.json"),
    path.join(home, ".claude", "credentials.json"),
    path.join(home, ".config", "claude", "credentials.json"),
    path.join(home, ".config", "claude-code", "credentials.json"),
  ]
}

function scanAuth(
  value: unknown,
  acc: { loggedIn: boolean; email: string | null } = { loggedIn: false, email: null }
) {
  if (!value || typeof value !== "object") return acc
  if (Array.isArray(value)) {
    for (const item of value) scanAuth(item, acc)
    return acc
  }
  const record = value as Record<string, unknown>
  if (typeof record.email === "string" && record.email.includes("@") && !acc.email) {
    acc.email = record.email
  }
  for (const key of ["claudeAiOauth", "oauthAccount", "accessToken", "refreshToken", "oauthToken"]) {
    if (record[key]) acc.loggedIn = true
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") scanAuth(nested, acc)
  }
  return acc
}

function readSavedLogin() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { loggedIn: true, email: null as string | null }
  }
  for (const file of credentialFiles()) {
    try {
      if (!fs.existsSync(/* turbopackIgnore: true */ file)) continue
      const parsed = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf8")) as unknown
      const found = scanAuth(parsed)
      if (found.loggedIn) return found
    } catch {
      /* ignore unreadable credential files */
    }
  }
  return { loggedIn: false, email: null as string | null }
}

export async function inspectClaudeSubscription(): Promise<ClaudeSubscription> {
  const binary = await which("claude")
  const saved = readSavedLogin()
  const installed = Boolean(binary)
  const loggedIn = saved.loggedIn
  const ready = installed && loggedIn

  if (ready) {
    return {
      installed,
      loggedIn,
      ready,
      binary,
      email: saved.email,
      detail: saved.email
        ? `Подписка Claude · ${saved.email}`
        : "Подписка Claude · вход выполнен",
      hint: "Агенты Claude идут через Claude Code, без ключа API.",
    }
  }

  if (installed && !loggedIn) {
    return {
      installed,
      loggedIn,
      ready,
      binary,
      email: null,
      detail: "Claude Code установлен, но вход в подписку не выполнен",
      hint: "В терминале на этой машине: claude login — тем же аккаунтом, что и claude.ai.",
    }
  }

  return {
    installed: false,
    loggedIn,
    ready: false,
    binary: null,
    email: saved.email,
    detail: loggedIn
      ? "Сессия подписки найдена, но CLI `claude` не в PATH"
      : "Claude Code не установлен",
    hint: "Установите Claude Code, затем выполните claude login. Ключ API для подписки не нужен.",
  }
}

export const CLAUDE_INSTALL_HINT = [
  "npm install -g @anthropic-ai/claude-code",
  "claude login",
].join("\n")
