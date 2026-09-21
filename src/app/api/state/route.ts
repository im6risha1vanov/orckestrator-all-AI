import { NextResponse } from "next/server"
import fs from "node:fs"

import { flattenFiles, readTree } from "@/lib/files"
import { id, nowIso } from "@/lib/ids"
import {
  cloneGithubRepo,
  defaultCloneParent,
  githubAccount,
  listGithubRepos,
  tokenFrom,
} from "@/lib/github"
import { inspectClaudeSubscription } from "@/lib/claude-subscription"
import { probeExecutors } from "@/lib/probe"
import { resolveModel } from "@/lib/executors"
import { getStore } from "@/lib/store"
import type { Agent, ExecutorId, Settings } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const store = getStore()
  const state = store.snapshot()
  const probe = await probeExecutors(state.settings)
  const claude = await inspectClaudeSubscription()
  const github = await githubAccount(tokenFrom(state.settings))
  return NextResponse.json({
    state,
    probe,
    claude,
    github,
    cloneParent: defaultCloneParent(),
  })
}

export async function POST(request: Request) {
  const body = (await request.json()) as { op: string; payload?: Record<string, unknown> }
  const store = getStore()
  const op = body.op
  const p = body.payload ?? {}

  try {
    switch (op) {
      case "createProject": {
        const name = String(p.name ?? "").trim()
        const pathValue = String(p.path ?? "").trim()
        if (!name || !pathValue) throw new Error("Нужны имя и путь")
        if (!fs.existsSync(pathValue) || !fs.statSync(pathValue).isDirectory()) {
          throw new Error("Каталог не найден. Укажите существующий путь на этой машине.")
        }
        const project = {
          id: id("proj"),
          name,
          path: pathValue,
          githubUrl: typeof p.githubUrl === "string" ? p.githubUrl : undefined,
          createdAt: nowIso(),
        }
        store.mutate((s) => s.projects.push(project))
        store.flush()
        return NextResponse.json({ project })
      }
      case "deleteProject": {
        const projectId = String(p.id)
        store.mutate((s) => {
          s.projects = s.projects.filter((x) => x.id !== projectId)
        })
        store.flush()
        return NextResponse.json({ ok: true })
      }
      case "createAgent": {
        const agent: Agent = {
          id: id("agent"),
          name: String(p.name ?? "").trim() || "Новый агент",
          role: String(p.role ?? "").trim() || "Специалист",
          instructions: String(p.instructions ?? "").trim(),
          executor: (p.executor as ExecutorId) || "local",
          model: resolveModel(
            (p.executor as ExecutorId) || "local",
            typeof p.model === "string" ? p.model : undefined
          ),
          color: String(p.color ?? "#82a4ff"),
          kind: "worker",
          canSpawn: Boolean(p.canSpawn),
          system: false,
          enabled: true,
          createdAt: nowIso(),
        }
        store.mutate((s) => s.agents.push(agent))
        return NextResponse.json({ agent })
      }
      case "updateAgent": {
        store.mutate((s) => {
          const agent = s.agents.find((a) => a.id === p.id)
          if (!agent) throw new Error("Агент не найден")
          if (typeof p.name === "string") agent.name = p.name
          if (typeof p.role === "string") agent.role = p.role
          if (typeof p.instructions === "string") agent.instructions = p.instructions
          if (typeof p.executor === "string") {
            agent.executor = p.executor as ExecutorId
            if (typeof p.model !== "string") agent.model = resolveModel(agent.executor, agent.model)
          }
          if (typeof p.model === "string") agent.model = resolveModel(agent.executor, p.model)
          if (typeof p.color === "string") agent.color = p.color
          if (typeof p.canSpawn === "boolean") agent.canSpawn = p.canSpawn
          if (typeof p.enabled === "boolean" && !agent.system) agent.enabled = p.enabled
        })
        return NextResponse.json({ ok: true })
      }
      case "deleteAgent": {
        const agentId = String(p.id)
        store.mutate((s) => {
          const agent = s.agents.find((a) => a.id === agentId)
          if (!agent) return
          if (agent.system) throw new Error("Системного агента нельзя удалить")
          s.agents = s.agents.filter((a) => a.id !== agentId)
        })
        return NextResponse.json({ ok: true })
      }
      case "createThread": {
        const projectId = String(p.projectId)
        if (!store.project(projectId)) throw new Error("Проект не найден")
        const thread = {
          id: id("thr"),
          projectId,
          title: String(p.title ?? "Новый чат"),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        store.mutate((s) => s.threads.unshift(thread))
        return NextResponse.json({ thread })
      }
      case "deleteThread": {
        const threadId = String(p.id)
        store.mutate((s) => {
          s.threads = s.threads.filter((t) => t.id !== threadId)
          s.messages = s.messages.filter((m) => m.threadId !== threadId)
          s.runs = s.runs.filter((r) => r.threadId !== threadId)
        })
        return NextResponse.json({ ok: true })
      }
      case "updateSettings": {
        store.mutate((s) => {
          s.settings = { ...s.settings, ...(p as Partial<Settings>) }
        })
        return NextResponse.json({ settings: store.snapshot().settings })
      }
      case "githubRepos": {
        const repos = await listGithubRepos(tokenFrom(store.snapshot().settings))
        return NextResponse.json({ repos })
      }
      case "cloneGithub": {
        const settings = store.snapshot().settings
        const cloneUrl = String(p.cloneUrl ?? p.url ?? "").trim()
        const destParent = String(p.destParent ?? defaultCloneParent())
        const cloned = await cloneGithubRepo({
          cloneUrl,
          destParent,
          token: tokenFrom(settings),
        })
        const existing = store.snapshot().projects.find(
          (item) =>
            item.path === cloned.dest ||
            (cloned.githubUrl && item.githubUrl === cloned.githubUrl)
        )
        if (existing) {
          return NextResponse.json({ project: existing, alreadyOpen: true })
        }
        const project = {
          id: id("proj"),
          name: cloned.name,
          path: cloned.dest,
          githubUrl: cloned.githubUrl,
          createdAt: nowIso(),
        }
        store.mutate((s) => s.projects.push(project))
        store.flush()
        return NextResponse.json({ project })
      }
      case "tree": {
        const project = store.project(String(p.projectId))
        if (!project) throw new Error("Проект не найден")
        const tree = readTree(project.path)
        return NextResponse.json({
          tree,
          files: flattenFiles(tree).slice(0, 80),
        })
      }
      default:
        throw new Error("Неизвестная операция")
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    )
  }
}
