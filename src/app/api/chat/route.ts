import { NextResponse } from "next/server"

import { startTurn } from "@/lib/orchestrator"
import { getStore } from "@/lib/store"
import { id, nowIso } from "@/lib/ids"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      threadId?: string
      projectId: string
      content: string
      agentId?: string
      allowSubagents?: boolean
      model?: string
      subagentModels?: Record<string, string>
    }
    const content = body.content?.trim()
    if (!content) {
      return NextResponse.json({ error: "Пустое сообщение" }, { status: 400 })
    }
    const store = getStore()
    if (!store.project(body.projectId)) {
      return NextResponse.json({ error: "Проект не найден" }, { status: 400 })
    }

    let threadId = body.threadId
    if (!threadId) {
      const thread = {
        id: id("thr"),
        projectId: body.projectId,
        title: "Новый чат",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      store.mutate((s) => s.threads.unshift(thread))
      threadId = thread.id
    }

    const result = await startTurn({
      threadId,
      projectId: body.projectId,
      content,
      agentId: body.agentId || "agent_orchestrator",
      allowSubagents: body.allowSubagents !== false,
      model: body.model,
      subagentModels: body.subagentModels,
    })
    return NextResponse.json({ ...result, state: store.snapshot() })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    )
  }
}
