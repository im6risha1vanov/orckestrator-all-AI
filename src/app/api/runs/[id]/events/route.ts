import { NextResponse } from "next/server"

import { subscribe } from "@/lib/bus"
import { getStore } from "@/lib/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const store = getStore()
  const run = store.run(id)
  if (!run) {
    return NextResponse.json({ error: "Запуск не найден" }, { status: 404 })
  }

  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const related = store
        .snapshot()
        .runs.filter((r) => r.id === id || r.rootRunId === run.rootRunId)
      for (const relatedRun of related) {
        for (const event of relatedRun.events) send(event)
      }

      const unsub = subscribe(run.rootRunId, (event) => {
        send(event)
        if (event.type === "done" && event.runId === id) {
          closed = true
          unsub()
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
      })

      const heartbeat = setInterval(() => {
        if (closed) return
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15000)

      const current = store.run(id)
      if (current && (current.status === "done" || current.status === "error" || current.status === "cancelled")) {
        clearInterval(heartbeat)
        unsub()
        closed = true
        try {
          controller.close()
        } catch {
          /* ignore */
        }
      }

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat)
        unsub()
        closed = true
        try {
          controller.close()
        } catch {
          /* ignore */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
