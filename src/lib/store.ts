import fs from "node:fs"
import path from "node:path"

import { AGENT_COLORS, defaultModel, resolveModel } from "./executors"
import { id, nowIso } from "./ids"
import type { Agent, ArtelState, ChatMessage, Project, Run, Settings, Thread } from "./types"

const DATA_DIR = path.join(process.cwd(), "data")
const DATA_FILE = path.join(DATA_DIR, "artel.json")

function defaultSettings(): Settings {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    starimgApiKey: process.env.STARIMG_API_KEY ?? "",
    starimgBaseUrl: process.env.STARIMG_BASE_URL ?? "https://ai.starimg.com/v1",
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    cursorApiKey: process.env.CURSOR_API_KEY ?? "",
    githubToken: process.env.GITHUB_TOKEN ?? "",
    preferCli: true,
  }
}

const DEFAULT_PROJECT_ID = "proj_local"
const DEFAULT_WORKER_IDS = [
  "agent_architect",
  "agent_engineer",
  "agent_claude_code",
  "agent_reviewer",
] as const

function seed(): ArtelState {
  const createdAt = nowIso()
  const projectId = DEFAULT_PROJECT_ID
  const orchestrator: Agent = {
    id: "agent_orchestrator",
    name: "Оркестратор",
    role: "Координатор",
    instructions:
      "Ты главный агент Артели. Разбираешь задачу пользователя, решаешь, каких подагентов запустить, ставишь им чёткие подзадачи и собираешь единый ответ. Сам пишешь код только если подагентов нет или задача короткая.",
    executor: "claude",
    model: defaultModel("claude"),
    color: "#82a4ff",
    kind: "orchestrator",
    canSpawn: true,
    system: true,
    enabled: true,
    createdAt,
  }

  const workers: Omit<Agent, "id" | "createdAt">[] = [
    {
      name: "Архитектор",
      role: "Проектирование",
      instructions:
        "Предлагаешь структуру модулей, границы ответственности и список файлов. Код не пишешь — только план, риски и порядок работ.",
      executor: "claude",
      color: AGENT_COLORS[1],
      kind: "worker",
      canSpawn: false,
      system: false,
      enabled: true,
      model: defaultModel("claude"),
    },
    {
      name: "Инженер",
      role: "Реализация",
      instructions:
        "Пишешь и правишь код в рабочем каталоге. Следуешь плану. Минимум воды, максимум конкретного патча и списка изменённых файлов.",
      executor: "codex",
      color: AGENT_COLORS[2],
      kind: "worker",
      canSpawn: false,
      system: false,
      enabled: true,
      model: defaultModel("codex"),
    },
    {
      name: "Claude Code",
      role: "Агентный кодинг",
      instructions:
        "Исполняешь задачу через Claude Code в каталоге проекта: читаешь файлы, правишь, запускаешь проверки.",
      executor: "claude-code",
      color: "#e8b86d",
      kind: "worker",
      canSpawn: false,
      system: false,
      enabled: true,
      model: defaultModel("claude-code"),
    },
    {
      name: "Ревьюер",
      role: "Проверка",
      instructions:
        "Смотришь дифф и план. Ищешь баги, дыры, расхождения с задачей. Пишешь нумерованный список правок, без пересказа всего файла.",
      executor: "claude",
      color: AGENT_COLORS[3],
      kind: "worker",
      canSpawn: false,
      system: false,
      enabled: true,
      model: defaultModel("claude"),
    },
  ]

  return {
    version: 1,
    projects: [
      {
        id: projectId,
        name: "Артель",
        path: process.cwd(),
        createdAt,
      },
    ],
    agents: [
      orchestrator,
      ...workers.map((w, index) => ({
        ...w,
        id: DEFAULT_WORKER_IDS[index] ?? id("agent"),
        createdAt,
      })),
    ],
    threads: [],
    messages: [],
    runs: [],
    settings: defaultSettings(),
  }
}

function load(): ArtelState {
  try {
    if (!fs.existsSync(DATA_FILE)) return seed()
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as ArtelState
    if (raw.version !== 1) return seed()
    raw.settings = { ...defaultSettings(), ...raw.settings }
    raw.agents = (raw.agents ?? []).map((agent) => ({
      ...agent,
      model: resolveModel(agent.executor, agent.model),
    }))
    return raw
  } catch {
    return seed()
  }
}

class Store {
  data: ArtelState
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private writing = false

  constructor() {
    this.data = load()
    this.flush()
  }

  snapshot(): ArtelState {
    return this.data
  }

  mutate<T>(fn: (state: ArtelState) => T): T {
    const result = fn(this.data)
    this.schedulePersist()
    return result
  }

  project(id: string): Project | undefined {
    return this.data.projects.find((p) => p.id === id)
  }

  agent(id: string): Agent | undefined {
    return this.data.agents.find((a) => a.id === id)
  }

  thread(id: string): Thread | undefined {
    return this.data.threads.find((t) => t.id === id)
  }

  run(id: string): Run | undefined {
    return this.data.runs.find((r) => r.id === id)
  }

  messagesFor(threadId: string): ChatMessage[] {
    return this.data.messages.filter((m) => m.threadId === threadId)
  }

  runsFor(threadId: string): Run[] {
    return this.data.runs.filter((r) => r.threadId === threadId)
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.flush()
    }, 250)
  }

  flush() {
    if (this.writing) {
      this.schedulePersist()
      return
    }
    this.writing = true
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      const tmp = DATA_FILE + ".tmp"
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8")
      fs.renameSync(tmp, DATA_FILE)
    } finally {
      this.writing = false
    }
  }
}

const globalStore = globalThis as typeof globalThis & { __artelStore?: Store }

export function getStore() {
  if (!globalStore.__artelStore) {
    globalStore.__artelStore = new Store()
  }
  return globalStore.__artelStore
}

export { DATA_DIR }
