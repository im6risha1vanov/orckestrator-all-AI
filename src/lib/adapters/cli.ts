import { spawn } from "node:child_process"

import { findBinary } from "../probe"
import { isAbort, streamText, type Adapter, type AdapterContext, type Emit } from "./types"
import { localAdapter } from "./local"

function spawnEnv(extra: Record<string, string>) {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...extra }
  if (extra.__ARTEL_STRIP_ANTHROPIC === "1") {
    delete merged.ANTHROPIC_API_KEY
    delete merged.ANTHROPIC_AUTH_TOKEN
    delete merged.__ARTEL_STRIP_ANTHROPIC
  }
  return merged
}

export function runCli(
  bin: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
  emit: Emit
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: spawnEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    })

    const onAbort = () => {
      child.kill("SIGTERM")
    }
    signal.addEventListener("abort", onAbort)

    let buffer = ""
    const handle = (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      const parts = buffer.split("\n")
      buffer = parts.pop() ?? ""
      for (const line of parts) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>
          const type = String(json.type ?? json.kind ?? "")
          const text = String(
            json.text ?? json.delta ?? json.content ?? json.message ?? ""
          )
          if (text && (type.includes("text") || type.includes("assistant") || type === "delta")) {
            emit({ type: "token", text })
          } else if (type.includes("tool") || json.tool) {
            emit({
              type: "tool",
              tool: String(json.tool ?? json.name ?? "tool"),
              text: String(json.input ?? json.args ?? json.path ?? "").slice(0, 400),
            })
          } else if (text) {
            emit({ type: "token", text: text + "\n" })
          }
        } catch {
          emit({ type: "token", text: trimmed + "\n" })
        }
      }
    }

    child.stdout?.on("data", handle)
    child.on("error", (error) => {
      signal.removeEventListener("abort", onAbort)
      reject(error)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8")
      if (text.trim()) emit({ type: "thinking", text: text.slice(0, 500) })
    })
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort)
      if (buffer.trim()) emit({ type: "token", text: buffer.trim() + "\n" })
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"))
        return
      }
      if (code && code !== 0) {
        reject(new Error(`Процесс завершился с кодом ${code}`))
        return
      }
      resolve()
    })
  })
}

export function cliAdapter(
  executor: "claude-code" | "codex" | "cursor",
  binaries: string[],
  argsFor: (ctx: AdapterContext) => string[],
  extraEnv: (ctx: AdapterContext) => Record<string, string> = () => ({})
): Adapter {
  return {
    id: executor,
    async run(ctx, emit) {
      const bin = await findBinary(binaries)
      if (!bin) {
        emit({
          type: "thinking",
          text: `${executor}: бинарь не найден, переключаюсь на локальный режим.`,
        })
        await localAdapter.run(ctx, emit)
        return
      }
      emit({ type: "tool", tool: "spawn", text: `${bin} ${argsFor(ctx).join(" ")}` })
      try {
        await runCli(bin, argsFor(ctx), ctx.worktreePath, extraEnv(ctx), ctx.signal, emit)
      } catch (error) {
        if (isAbort(error)) throw error
        emit({
          type: "thinking",
          text: `CLI вернул ошибку: ${error instanceof Error ? error.message : String(error)}. Локальный режим.`,
        })
        await streamText(
          `\n\nНастоящий ${executor} не смог завершить запуск. Ниже — локальный ответ Артели.\n\n`,
          emit,
          ctx.signal,
          8
        )
        await localAdapter.run(ctx, emit)
      }
    },
  }
}

export const claudeCodeAdapter = cliAdapter(
  "claude-code",
  ["claude"],
  (ctx) => ["-p", ctx.prompt, "--model", ctx.model, "--output-format", "stream-json", "--verbose"]
)

function cursorArgs(ctx: AdapterContext, bin: string) {
  const base = ["-p", ctx.prompt, "--model", ctx.model]
  const name = bin.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? ""
  if (name === "cursor" || name === "cursor.exe" || name === "cursor.cmd") {
    return ["agent", ...base]
  }
  return base
}

export const cursorAdapter: Adapter = {
  id: "cursor",
  async run(ctx, emit) {
    const bin = await findBinary(["cursor-agent", "agent", "cursor"])
    if (!bin) {
      emit({
        type: "thinking",
        text: "Cursor CLI не найден. Поставь agent (https://cursor.com/docs/cli) и выполни agent login — тот же аккаунт, что в Cursor.",
      })
      await localAdapter.run(ctx, emit)
      return
    }
    const { getStore } = await import("../store")
    const key =
      getStore().snapshot().settings.cursorApiKey || process.env.CURSOR_API_KEY || ""
    const env: Record<string, string> = {}
    if (key) env.CURSOR_API_KEY = key
    const args = cursorArgs(ctx, bin)
    emit({ type: "tool", tool: "spawn", text: `${bin} ${args.join(" ")}` })
    try {
      await runCli(bin, args, ctx.worktreePath, env, ctx.signal, emit)
    } catch (error) {
      if (isAbort(error)) throw error
      emit({
        type: "thinking",
        text: `CLI вернул ошибку: ${error instanceof Error ? error.message : String(error)}. Локальный режим.`,
      })
      await streamText(
        "\n\nНастоящий cursor не смог завершить запуск. Ниже — локальный ответ Артели.\n\n",
        emit,
        ctx.signal,
        8
      )
      await localAdapter.run(ctx, emit)
    }
  },
}
