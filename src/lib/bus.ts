import type { RunEvent } from "./types"

type Handler = (event: RunEvent) => void

const listeners = new Map<string, Set<Handler>>()

export function subscribe(rootRunId: string, handler: Handler) {
  let set = listeners.get(rootRunId)
  if (!set) {
    set = new Set()
    listeners.set(rootRunId, set)
  }
  set.add(handler)
  return () => {
    set!.delete(handler)
    if (set!.size === 0) listeners.delete(rootRunId)
  }
}

export function publish(rootRunId: string, event: RunEvent) {
  const set = listeners.get(rootRunId)
  if (!set) return
  for (const handler of set) {
    try {
      handler(event)
    } catch {
      /* ignore subscriber errors */
    }
  }
}
