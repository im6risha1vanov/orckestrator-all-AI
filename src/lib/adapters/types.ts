import type { ExecutorId, RunEvent } from "../types"

export interface AdapterContext {
  prompt: string
  projectPath: string
  worktreePath: string
  fileHints: string[]
  agentName: string
  agentRole: string
  agentInstructions: string
  executor: ExecutorId
  model: string
  signal: AbortSignal
}

export type Emit = (partial: Omit<RunEvent, "id" | "rootRunId" | "runId" | "ts">) => void

export interface Adapter {
  id: ExecutorId
  run(ctx: AdapterContext, emit: Emit): Promise<void>
}

export function chunkText(text: string, size = 7): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

export async function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true }
    )
  })
}

export async function streamText(
  text: string,
  emit: Emit,
  signal: AbortSignal,
  delay = 12
) {
  for (const chunk of chunkText(text)) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")
    emit({ type: "token", text: chunk })
    await sleep(delay, signal)
  }
}

export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}
