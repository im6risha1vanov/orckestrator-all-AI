import { adapterFor } from "./adapters"
import { chunkText, type AdapterContext, type Emit } from "./adapters/types"
import { publish } from "./bus"
import { flattenFiles, readTree, relativeTo } from "./files"
import { id, nowIso } from "./ids"
import { modelLabel, resolveModel } from "./executors"
import { getStore } from "./store"
import type { Agent, ExecutorId, Run, RunEvent } from "./types"

const aborts = new Map<string, AbortController>()

function emitFor(run: Run): Emit {
  return (partial) => {
    const event: RunEvent = {
      id: id("evt"),
      rootRunId: run.rootRunId,
      runId: run.id,
      ts: nowIso(),
      agentId: run.agentId,
      ...partial,
    }
    getStore().mutate((state) => {
      const current = state.runs.find((r) => r.id === run.id)
      if (!current) return
      current.events.push(event)
      if (event.type === "token" && event.text) current.content += event.text
      if (event.type === "thinking" && event.text) {
        current.thinking = event.text
      }
      if (event.type === "error" && event.text) current.error = event.text
    })
    publish(run.rootRunId, event)
  }
}

function createRun(input: {
  threadId: string
  projectId: string
  agentId: string
  prompt: string
  parentRunId?: string
  rootRunId?: string
  executor: ExecutorId
  model: string
}): Run {
  const runId = id("run")
  const run: Run = {
    id: runId,
    threadId: input.threadId,
    projectId: input.projectId,
    agentId: input.agentId,
    parentRunId: input.parentRunId,
    rootRunId: input.rootRunId ?? runId,
    prompt: input.prompt,
    content: "",
    thinking: "",
    status: "queued",
    executor: input.executor,
    model: input.model,
    usedMock: false,
    events: [],
    createdAt: nowIso(),
  }
  getStore().mutate((state) => {
    state.runs.push(run)
  })
  return run
}

function setRun(runId: string, patch: Partial<Run>) {
  getStore().mutate((state) => {
    const run = state.runs.find((r) => r.id === runId)
    if (!run) return
    Object.assign(run, patch)
  })
}

function fileHints(projectPath: string): string[] {
  try {
    return flattenFiles(readTree(projectPath)).slice(0, 80)
  } catch {
    return []
  }
}

export function planSpawns(message: string, agents: Agent[], allow: boolean): { agent: Agent; prompt: string }[] {
  if (!allow) return []
  const workers = agents.filter((a) => a.kind !== "orchestrator" && a.enabled)
  if (workers.length === 0) return []

  const lower = message.toLowerCase()
  const mentioned = workers.filter((a) => lower.includes(a.name.toLowerCase()))
  let picked = mentioned

  if (picked.length === 0) {
    const codey =
      /код|файл|репозитор|баг|тест|рефактор|api|компонент|ui|верстк|функц|реализ|патч|архитектур|агент|оркестр/i.test(
        message
      )
    if (codey) {
      const byRole = workers.filter((a) =>
        /архитект|инженер|code|codex|ревью|тест/i.test(`${a.name} ${a.role}`)
      )
      picked = byRole.slice(0, 3)
    }
  }

  if (picked.length === 0) {
    picked = workers.slice(0, 2)
  }

  picked = picked.slice(0, 4)
  return picked.map((agent) => ({
    agent,
    prompt: [
      `Подагент «${agent.name}». Роль: ${agent.role}.`,
      agent.instructions,
      "",
      "Задача от оркестратора:",
      message,
      "",
      "Верни конкретный результат своей роли. Не подменяй других агентов.",
    ].join("\n"),
  }))
}

async function executeRun(run: Run, agent: Agent, projectPath: string, worktreePath: string) {
  const controller = new AbortController()
  aborts.set(run.id, controller)
  const usedMock = { value: agent.executor === "local" }
  const emit = emitFor(run)
  setRun(run.id, { status: "running", worktreePath })

  const ctx: AdapterContext = {
    prompt: run.prompt,
    projectPath,
    worktreePath,
    fileHints: fileHints(projectPath),
    agentName: agent.name,
    agentRole: agent.role,
    agentInstructions: agent.instructions,
    executor: agent.executor,
    model: resolveModel(agent.executor, run.model || agent.model),
    signal: controller.signal,
  }

  try {
    const preferCli = getStore().snapshot().settings.preferCli
    const adapter = adapterFor(agent.executor, preferCli, usedMock)
    await adapter.run(ctx, emit)
    setRun(run.id, {
      status: "done",
      usedMock: usedMock.value,
      finishedAt: nowIso(),
    })
    emit({ type: "done" })
  } catch (error) {
    const aborted = controller.signal.aborted
    setRun(run.id, {
      status: aborted ? "cancelled" : "error",
      usedMock: usedMock.value,
      error: error instanceof Error ? error.message : String(error),
      finishedAt: nowIso(),
    })
    emit({
      type: aborted ? "done" : "error",
      text: aborted ? "Остановлено" : error instanceof Error ? error.message : String(error),
    })
    if (!aborted) emit({ type: "done" })
  } finally {
    aborts.delete(run.id)
  }
}

export function cancelRun(runId: string) {
  const store = getStore()
  const snapshot = store.snapshot()
  const root = snapshot.runs.find((r) => r.id === runId)
  if (!root) return
  const ids = snapshot.runs
    .filter((r) => r.id === runId || r.rootRunId === root.rootRunId || r.parentRunId === runId)
    .map((r) => r.id)
  for (const idValue of ids) {
    aborts.get(idValue)?.abort()
    const run = store.run(idValue)
    if (run && (run.status === "running" || run.status === "queued")) {
      setRun(idValue, { status: "cancelled", finishedAt: nowIso() })
    }
  }
}

export async function startTurn(input: {
  threadId: string
  projectId: string
  content: string
  agentId: string
  allowSubagents: boolean
  model?: string
  subagentModels?: Record<string, string>
}) {
  const store = getStore()
  const project = store.project(input.projectId)
  const agent = store.agent(input.agentId)
  if (!project) throw new Error("Проект не найден")
  if (!agent) throw new Error("Агент не найден")

  const thread = store.thread(input.threadId)
  if (!thread) throw new Error("Чат не найден")

  const userMessage = {
    id: id("msg"),
    threadId: input.threadId,
    role: "user" as const,
    content: input.content,
    createdAt: nowIso(),
  }

  if (input.model || input.subagentModels) {
    store.mutate((state) => {
      if (input.model) {
        const current = state.agents.find((a) => a.id === agent.id)
        if (current) current.model = resolveModel(current.executor, input.model)
      }
      for (const [idValue, model] of Object.entries(input.subagentModels ?? {})) {
        const current = state.agents.find((a) => a.id === idValue)
        if (current) current.model = resolveModel(current.executor, model)
      }
    })
  }

  const rootModel = resolveModel(agent.executor, input.model || agent.model)

  const root = createRun({
    threadId: input.threadId,
    projectId: input.projectId,
    agentId: agent.id,
    prompt: input.content,
    executor: agent.executor,
    model: rootModel,
  })

  const assistantMessage = {
    id: id("msg"),
    threadId: input.threadId,
    role: "assistant" as const,
    agentId: agent.id,
    runId: root.id,
    content: "",
    createdAt: nowIso(),
  }

  store.mutate((state) => {
    state.messages.push(userMessage, assistantMessage)
    const t = state.threads.find((x) => x.id === input.threadId)
    if (t) {
      t.updatedAt = nowIso()
      if (t.title === "Новый чат") {
        t.title = input.content.replace(/\s+/g, " ").trim().slice(0, 48) || "Новый чат"
      }
    }
  })

  void runTurn(root, agent, project.path, input.allowSubagents, assistantMessage.id)

  return { runId: root.id, threadId: input.threadId }
}

async function runTurn(
  root: Run,
  agent: Agent,
  projectPath: string,
  allowSubagents: boolean,
  assistantMessageId: string
) {
  const store = getStore()
  const emit = emitFor(root)
  const hints = fileHints(projectPath)
  const hintNames = hints.slice(0, 8).map((f) => relativeTo(projectPath, f))

  const spawn =
    agent.canSpawn && allowSubagents
      ? planSpawns(root.prompt, store.snapshot().agents, true)
      : []

  if (spawn.length > 0) {
    setRun(root.id, { status: "running" })
    emit({
      type: "thinking",
      text: `Раскладываю задачу на ${spawn.length} подагентов…`,
    })
    const intro = [
      `Принял задачу. В проекте вижу: ${hintNames.join(", ") || "файлов пока мало"}.`,
      "",
      "Запускаю подагентов:",
      ...spawn.map(
        (s, i) =>
          `${i + 1}. **${s.agent.name}** — ${s.agent.role} · ${modelLabel(s.agent.executor, s.agent.model)}`
      ),
      "",
    ].join("\n")
    for (const chunk of chunkText(intro, 10)) {
      emit({ type: "token", text: chunk })
    }

    const children = spawn.map((s) => {
      const child = createRun({
        threadId: root.threadId,
        projectId: root.projectId,
        agentId: s.agent.id,
        prompt: s.prompt,
        parentRunId: root.id,
        rootRunId: root.rootRunId,
        executor: s.agent.executor,
        model: resolveModel(s.agent.executor, s.agent.model),
      })
      emit({
        type: "spawn",
        agentId: s.agent.id,
        childRunId: child.id,
        text: s.agent.name,
      })
      return { child, agent: s.agent }
    })

    await Promise.allSettled(
      children.map(({ child, agent: childAgent }) =>
        executeRun(child, childAgent, projectPath, projectPath)
      )
    )

    const snapshot = store.snapshot()
    const childRuns = snapshot.runs.filter((r) => r.parentRunId === root.id)
    const summaryParts = childRuns.map((r) => {
      const a = snapshot.agents.find((x) => x.id === r.agentId)
      const body = r.content.trim() || r.error || "без ответа"
      return `### ${a?.name ?? "Агент"}\n\n${body.slice(0, 1200)}`
    })
    const summary = [
      "",
      "---",
      "",
      "Сводка оркестратора:",
      "",
      ...summaryParts,
      "",
      childRuns.some((r) => r.usedMock)
        ? "_Часть агентов работала в локальном режиме — CLI или ключи не подключены._"
        : "",
    ].join("\n")
    emit({ type: "token", text: summary })
    setRun(root.id, { status: "done", finishedAt: nowIso() })
    emit({ type: "done" })
  } else {
    await executeRun(root, agent, projectPath, projectPath)
  }

  const final = getStore().run(root.id)
  getStore().mutate((state) => {
    const msg = state.messages.find((m) => m.id === assistantMessageId)
    if (msg && final) msg.content = final.content
  })
}

export function threadRuns(threadId: string) {
  return getStore().runsFor(threadId)
}
