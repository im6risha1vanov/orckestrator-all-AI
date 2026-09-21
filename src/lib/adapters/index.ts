import type { ExecutorId } from "../types"
import { claudeAdapter, runClaudeCli } from "./claude-api"
import { cursorAdapter } from "./cli"
import { codexAdapter } from "./codex"
import { localAdapter } from "./local"
import type { Adapter } from "./types"

const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  async run(ctx, emit) {
    const ok = await runClaudeCli(ctx, emit)
    if (!ok) await localAdapter.run(ctx, emit)
  },
}

export function adapterFor(executor: ExecutorId, preferCli: boolean, usedMock: { value: boolean }): Adapter {
  if (!preferCli && executor !== "local") {
    // adapters themselves fall back
  }
  switch (executor) {
    case "claude":
      return wrap(claudeAdapter, usedMock)
    case "claude-code":
      return wrap(claudeCodeAdapter, usedMock)
    case "codex":
      return wrap(codexAdapter, usedMock)
    case "cursor":
      return wrap(cursorAdapter, usedMock)
    default:
      usedMock.value = true
      return localAdapter
  }
}

function wrap(adapter: Adapter, usedMock: { value: boolean }): Adapter {
  return {
    id: adapter.id,
    async run(ctx, emit) {
      const original = emit
      const tracking: typeof emit = (partial) => {
        if (
          partial.type === "thinking" &&
          typeof partial.text === "string" &&
          /локальн/i.test(partial.text)
        ) {
          usedMock.value = true
        }
        original(partial)
      }
      await adapter.run(ctx, tracking)
    },
  }
}

export { localAdapter }
