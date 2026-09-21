import type { ExecutorId } from "./types"

export const EXECUTORS: {
  id: ExecutorId
  label: string
  short: string
  hint: string
}[] = [
  {
    id: "claude",
    label: "Claude",
    short: "Claude",
    hint: "Подписка claude.ai через Claude Code (claude login). Ключ API не обязателен.",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    short: "Code",
    hint: "Тот же вход по подписке, агент в каталоге проекта",
  },
  {
    id: "codex",
    label: "Codex",
    short: "Codex",
    hint: "Через ai.starimg или OpenAI-совместимый шлюз",
  },
  {
    id: "cursor",
    label: "Cursor",
    short: "Cursor",
    hint: "Твой аккаунт Cursor через CLI agent / cursor-agent",
  },
  {
    id: "local",
    label: "Локальный режим",
    short: "Артель",
    hint: "Встроенный исполнитель, если CLI и ключи недоступны",
  },
]

const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5" },
  { id: "claude-opus-4-5", label: "Opus 4.5" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5" },
]

export const MODELS: Record<ExecutorId, { id: string; label: string }[]> = {
  claude: CLAUDE_MODELS,
  "claude-code": CLAUDE_MODELS,
  codex: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "o3", label: "o3" },
  ],
  cursor: [
    { id: "auto", label: "Auto" },
    { id: "composer-2", label: "Composer 2" },
    { id: "grok-4.6", label: "Grok 4.6" },
    { id: "claude-4.5-sonnet", label: "Claude Sonnet 4.5" },
    { id: "claude-4.5-opus", label: "Claude Opus 4.5" },
    { id: "claude-4.5-haiku", label: "Claude Haiku 4.5" },
    { id: "gpt-5", label: "GPT-5" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  local: [{ id: "artel-local", label: "Локальный" }],
}

export function modelsFor(executor: ExecutorId) {
  return MODELS[executor] ?? MODELS.local
}

export function defaultModel(executor: ExecutorId) {
  return modelsFor(executor)[0]?.id ?? "artel-local"
}

export function resolveModel(executor: ExecutorId, model?: string) {
  const list = modelsFor(executor)
  if (model && list.some((item) => item.id === model)) return model
  if (model && model.trim()) return model.trim()
  return list[0]?.id ?? "artel-local"
}

export function modelLabel(executor: ExecutorId, model?: string) {
  const id = resolveModel(executor, model)
  return modelsFor(executor).find((item) => item.id === id)?.label ?? id
}

export function executorLabel(id: ExecutorId) {
  return EXECUTORS.find((e) => e.id === id)?.label ?? id
}

export const AGENT_COLORS = [
  "#82a4ff",
  "#c4b5fd",
  "#67e8f9",
  "#86efac",
  "#fcd34d",
  "#fda4af",
  "#fdba74",
  "#f0abfc",
]
