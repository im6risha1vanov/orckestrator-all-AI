export async function fetchState() {
  const response = await fetch("/api/state", { cache: "no-store" })
  if (!response.ok) throw new Error("Не удалось загрузить состояние")
  return response.json() as Promise<{
    state: import("@/lib/types").ArtelState
    probe: import("@/lib/types").ProbeResult[]
    claude: import("@/lib/types").ClaudeSubscription
    github: import("@/lib/types").GithubAccount
    cloneParent: string
  }>
}

export async function mutate(op: string, payload?: Record<string, unknown> | object) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, payload }),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error || "Ошибка запроса")
  return json
}

export async function sendChat(input: {
  threadId?: string
  projectId: string
  content: string
  agentId: string
  allowSubagents: boolean
  model?: string
  subagentModels?: Record<string, string>
}) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  const json = await response.json()
  if (!response.ok) throw new Error(json.error || "Не удалось отправить")
  return json as {
    runId: string
    threadId: string
    state: import("@/lib/types").ArtelState
  }
}

export async function cancelRun(runId: string) {
  await fetch(`/api/runs/${runId}/cancel`, { method: "POST" })
}
