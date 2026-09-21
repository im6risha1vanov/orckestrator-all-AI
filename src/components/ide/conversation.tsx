"use client"

import { Loader2 } from "lucide-react"

import { Markdown } from "@/components/ide/markdown"
import { statusLabel } from "@/lib/format"
import { modelLabel } from "@/lib/executors"
import type { Agent, ChatMessage, Run, RunEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

function AgentMark({ agent }: { agent?: Agent }) {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-[#0b0c10]"
      style={{ background: agent?.color ?? "#82a4ff" }}
    >
      {(agent?.name ?? "А").slice(0, 1)}
    </span>
  )
}

function SubagentCard({
  run,
  agent,
}: {
  run: Run
  agent?: Agent
}) {
  const tools = run.events.filter((e) => e.type === "tool")
  const diffs = run.events.filter((e) => e.type === "diff")
  return (
    <div
      className="rounded-xl bg-black/25 p-3 ring-1 ring-white/8"
      style={{ borderLeft: `3px solid ${agent?.color ?? "#82a4ff"}` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <AgentMark agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-zinc-100">{agent?.name ?? "Подагент"}</div>
          <div className="text-[11px] text-zinc-500">
            {run.usedMock ? "локальный режим · " : ""}
            {modelLabel(run.executor, run.model)} · {statusLabel(run.status)}
          </div>
        </div>
        {(run.status === "running" || run.status === "queued") && (
          <Loader2 className="size-3.5 animate-spin text-sky-300" />
        )}
      </div>
      {tools.length > 0 && (
        <div className="mb-2 space-y-1">
          {tools.slice(-4).map((event) => (
            <ToolLine key={event.id} event={event} />
          ))}
        </div>
      )}
      {run.thinking && run.status === "running" && !run.content && (
        <div className="mb-2 text-[12px] italic text-zinc-500">{run.thinking}</div>
      )}
      {run.content && <Markdown text={run.content} />}
      {diffs.map((event) => (
        <pre
          key={event.id}
          className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-4 text-emerald-200/90"
        >
          {event.patch}
        </pre>
      ))}
    </div>
  )
}

function ToolLine({ event }: { event: RunEvent }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
      <span className="rounded bg-white/6 px-1.5 py-0.5 text-zinc-400">{event.tool}</span>
      <span className="truncate">{event.path || event.text}</span>
    </div>
  )
}

export function Conversation({
  messages,
  runs,
  agents,
}: {
  messages: ChatMessage[]
  runs: Run[]
  agents: Agent[]
}) {
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]))
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-[#2a2d3a] px-4 py-2.5 text-[13.5px] leading-6 text-zinc-100">
                {message.content}
              </div>
            </div>
          )
        }
        const root = runs.find((r) => r.id === message.runId)
        const children = runs.filter((r) => r.parentRunId === message.runId)
        const agent = byId[message.agentId ?? ""]
        return (
          <div key={message.id} className="flex gap-3">
            <AgentMark agent={agent} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 text-[12px]">
                <span className="font-medium text-zinc-200">{agent?.name ?? "Агент"}</span>
                {root && (
                  <span className="text-zinc-500">
                    {root.usedMock ? "локальный режим · " : ""}
                    {modelLabel(root.executor, root.model)} · {statusLabel(root.status)}
                  </span>
                )}
                {root && (root.status === "running" || root.status === "queued") && (
                  <Loader2 className="size-3 animate-spin text-sky-300" />
                )}
              </div>
              {root?.thinking && !root.content && (
                <div className="mb-2 text-[12.5px] italic text-zinc-500">{root.thinking}</div>
              )}
              {root?.events.filter((e) => e.type === "tool" && !e.childRunId).slice(-3).map((event) => (
                <ToolLine key={event.id} event={event} />
              ))}
              {(root?.content || message.content) && (
                <Markdown text={root?.content || message.content} />
              )}
              {children.length > 0 && (
                <div className="mt-3 space-y-2">
                  {children.map((child) => (
                    <SubagentCard key={child.id} run={child} agent={byId[child.agentId]} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function EmptyHero({ onPrompt }: { onPrompt: (text: string) => void }) {
  const prompts = [
    "Разложи рефакторинг на архитектора, инженера и ревьюера",
    "Посмотри структуру репозитория и предложи план",
    "Создай подагента, который пишет тесты на каждое изменение",
  ]
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 text-center">
      <div className="mb-5 size-16 overflow-hidden rounded-[1.35rem] shadow-[0_0_40px_rgba(130,164,255,0.35)]">
        <img src="/artel-icon.png" alt="Артель" className="size-16" />
      </div>
      <h1 className="text-[28px] font-medium tracking-tight text-zinc-50">Артель</h1>
      <p className="mt-2 max-w-md text-[14px] leading-6 text-zinc-400">
        Оркестратор агентов. Подключи GitHub, клонируй репозиторий или открой папку — оркестратор раздаст работу Claude, Claude Code, Codex и Cursor.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault()
              onPrompt(prompt)
            }}
            onClick={() => onPrompt(prompt)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-left text-[13px] text-zinc-300 ring-1 ring-white/8",
              "hover:bg-white/5 hover:text-zinc-100"
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
