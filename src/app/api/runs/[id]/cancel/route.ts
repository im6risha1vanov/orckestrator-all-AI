import { NextResponse } from "next/server"

import { cancelRun } from "@/lib/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  cancelRun(id)
  return NextResponse.json({ ok: true })
}
