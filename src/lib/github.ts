import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import type { GithubAccount, GithubRepo } from "./types"

export type { GithubAccount, GithubRepo }

const exec = promisify(execFile)

export function tokenFrom(settings: { githubToken?: string }) {
  return (settings.githubToken || process.env.GITHUB_TOKEN || "").trim()
}

export function defaultCloneParent() {
  return path.join(os.homedir(), "Documents")
}

export function normalizeGithubCloneUrl(input: string): string {
  let value = input.trim()
  if (!value) throw new Error("Укажи URL репозитория или owner/repo")
  value = value.replace(/\/+$/, "")

  const ssh = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
  if (ssh) {
    return `https://github.com/${ssh[1]}/${ssh[2].replace(/\.git$/i, "")}.git`
  }

  if (/^[\w.-]+\/[\w.-]+$/.test(value)) {
    return `https://github.com/${value}.git`
  }

  if (/^(www\.)?github\.com\//i.test(value)) {
    value = `https://${value}`
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Нужен HTTPS-адрес GitHub, например https://github.com/user/repo")
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("Клонировать можно только репозитории github.com")
  }

  const parts = url.pathname
    .replace(/^\//, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean)
  if (parts.length < 2) {
    throw new Error("Нужен адрес вида https://github.com/user/repo")
  }
  return `https://github.com/${parts[0]}/${parts[1]}.git`
}

export function githubHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "artel",
    "x-github-api-version": "2022-11-28",
  }
}

export async function githubAccount(token: string): Promise<GithubAccount> {
  if (!token) {
    return {
      connected: false,
      login: null,
      name: null,
      detail: "Токен не задан",
    }
  }
  const response = await fetch("https://api.github.com/user", {
    headers: githubHeaders(token),
  })
  if (!response.ok) {
    const body = await response.text()
    return {
      connected: false,
      login: null,
      name: null,
      detail:
        response.status === 401
          ? "Токен не принят. Создай classic PAT с правом repo."
          : `GitHub ${response.status}: ${body.slice(0, 160)}`,
    }
  }
  const user = (await response.json()) as { login?: string; name?: string }
  return {
    connected: true,
    login: user.login ?? null,
    name: user.name ?? null,
    detail: `Подключено как ${user.login}`,
  }
}

export async function listGithubRepos(token: string): Promise<GithubRepo[]> {
  if (!token) throw new Error("Сначала подключи GitHub в Настройках")
  const repos: GithubRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&page=${page}&affiliation=owner,collaborator,organization_member`,
      { headers: githubHeaders(token) }
    )
    if (!response.ok) {
      throw new Error(`Не удалось получить репозитории: HTTP ${response.status}`)
    }
    const batch = (await response.json()) as {
      full_name: string
      name: string
      html_url: string
      clone_url: string
      private: boolean
      description: string | null
      default_branch: string
    }[]
    if (!Array.isArray(batch) || batch.length === 0) break
    for (const repo of batch) {
      repos.push({
        fullName: repo.full_name,
        name: repo.name,
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        private: repo.private,
        description: repo.description ?? "",
        defaultBranch: repo.default_branch,
      })
    }
    if (batch.length < 100) break
  }
  return repos
}

function cloneUrlWithToken(cloneUrl: string, token: string) {
  const url = new URL(cloneUrl)
  if (token) {
    url.username = "x-access-token"
    url.password = token
  }
  return url.toString()
}

async function ensureGit() {
  try {
    await exec("git", ["--version"], { timeout: 8000 })
  } catch {
    throw new Error(
      "Git не найден в PATH. Установи Git for Windows и перезапусти Артель."
    )
  }
}

export async function cloneGithubRepo(input: {
  cloneUrl: string
  destParent: string
  token: string
}) {
  await ensureGit()
  const githubUrl = normalizeGithubCloneUrl(input.cloneUrl)
  const destParent = path.resolve(
    /* turbopackIgnore: true */ input.destParent.trim() || defaultCloneParent()
  )
  fs.mkdirSync(destParent, { recursive: true })
  const base = githubUrl.replace(/\.git$/i, "").split("/").filter(Boolean).pop()
  if (!base) throw new Error("Не понял имя репозитория из URL")
  const dest = path.join(destParent, base)

  if (fs.existsSync(dest)) {
    const gitDir = path.join(dest, ".git")
    if (fs.existsSync(gitDir)) {
      return { dest, name: base, githubUrl, reused: true }
    }
    if (fs.readdirSync(dest).length > 0) {
      throw new Error(`Папка уже не пустая: ${dest}`)
    }
  }

  const authed = cloneUrlWithToken(githubUrl, input.token)
  try {
    await exec("git", ["clone", "--", authed, dest], {
      timeout: 180000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const message = input.token ? raw.split(input.token).join("***") : raw
    throw new Error(
      /not found|Repository not found|Authentication failed|could not read Username/i.test(message)
        ? "Репозиторий не найден или нет доступа. Проверь токен и URL."
        : `git clone не удался: ${message.slice(0, 400)}`
    )
  }
  return { dest, name: base, githubUrl, reused: false }
}
