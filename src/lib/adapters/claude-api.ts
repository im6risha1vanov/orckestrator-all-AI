import { modelLabel, resolveModel } from "../executors"
import { inspectClaudeSubscription } from "../claude-subscription"
import { getStore } from "../store"
import { runCli } from "./cli"
import { localAdapter } from "./local"
import { isAbort, streamText, type Adapter, type AdapterContext, type Emit } from "./types"

const CLAUDE_ARGS = (prompt: string, model: string) =>
  ["-p", prompt, "--model", model, "--output-format", "stream-json", "--verbose"] as string[]

function apiKey() {
  const settings = getStore().snapshot().settings
  return settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ""
}

export async function runClaudeCli(ctx: AdapterContext, emit: Emit) {
  const sub = await inspectClaudeSubscription()
  const bin = sub.binary
  if (!bin) {
    emit({
      type: "thinking",
      text: "Подписка Claude идёт через Claude Code, не через ключ API. CLI `claude` не найден. Установите: npm install -g @anthropic-ai/claude-code",
    })
    return false
  }
  if (!sub.loggedIn && !apiKey()) {
    emit({
      type: "thinking",
      text: "Claude Code установлен. Войдите в подписку в терминале: claude login",
    })
    return false
  }
  emit({
    type: "thinking",
    text: sub.loggedIn
      ? `Claude по подписке${sub.email ? ` · ${sub.email}` : ""} · ${modelLabel("claude", ctx.model)}…`
      : `Claude Code с ключом API · ${modelLabel("claude", ctx.model)} (это не подписка)…`,
  })
  emit({ type: "tool", tool: "spawn", text: `${bin} -p … --model ${resolveModel("claude", ctx.model)}` })
  const extra: Record<string, string> = sub.loggedIn ? { __ARTEL_STRIP_ANTHROPIC: "1" } : {}
  await runCli(bin, CLAUDE_ARGS(ctx.prompt, resolveModel("claude", ctx.model)), ctx.worktreePath, extra, ctx.signal, emit)
  return true
}

async function runViaApi(ctx: AdapterContext, emit: Emit) {
  const key = apiKey()
  if (!key) return false

  emit({ type: "thinking", text: `Запрос к Claude API · ${modelLabel("claude", ctx.model)}…` })
  const system = [
    `Ты агент «${ctx.agentName}» в оркестраторе Артель.`,
    `Роль: ${ctx.agentRole}.`,
    ctx.agentInstructions,
    `Рабочий каталог: ${ctx.worktreePath}.`,
    ctx.fileHints.length
      ? `Файлы проекта (фрагмент):\n${ctx.fileHints.slice(0, 40).join("\n")}`
      : "",
    "Отвечай по-русски, коротко и по делу. Если предлагаешь правки — списком файлов.",
  ]
    .filter(Boolean)
    .join("\n")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: resolveModel("claude", ctx.model),
      max_tokens: 1600,
      system,
      messages: [{ role: "user", content: ctx.prompt }],
    }),
    signal: ctx.signal,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Claude API ${response.status}: ${body.slice(0, 240)}`)
  }
  const json = (await response.json()) as {
    content?: { type: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = json.content?.map((c) => c.text ?? "").join("\n") ?? ""
  await streamText(text || "Пустой ответ Claude.", emit, ctx.signal, 8)
  emit({
    type: "usage",
    inputTokens: json.usage?.input_tokens,
    outputTokens: json.usage?.output_tokens,
  })
  return true
}

export const claudeAdapter: Adapter = {
  id: "claude",
  async run(ctx, emit) {
    const sub = await inspectClaudeSubscription()
    try {
      if (sub.ready || sub.installed) {
        const ok = await runClaudeCli(ctx, emit)
        if (ok) return
      }
      const usedApi = await runViaApi(ctx, emit)
      if (usedApi) return
    } catch (error) {
      if (isAbort(error)) throw error
      emit({
        type: "thinking",
        text: `Claude недоступен: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    emit({
      type: "thinking",
      text: sub.hint,
    })
    await localAdapter.run(ctx, emit)
  },
}
