"use client"

import { Loader2, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { executorLabel, modelsFor, resolveModel } from "@/lib/executors"
import type { Agent } from "@/lib/types"
import { cn } from "@/lib/utils"

function ModelSelect({
  executor,
  value,
  onChange,
  className,
}: {
  executor: Agent["executor"]
  value: string
  onChange: (model: string) => void
  className?: string
}) {
  const models = modelsFor(executor)
  const current = resolveModel(executor, value)
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={models.some((item) => item.id === current) ? current : "__custom"}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            onChange("")
            return
          }
          onChange(e.target.value)
        }}
        className={cn(
          "h-8 max-w-[160px] rounded-lg bg-white/5 px-2 text-[12px] text-zinc-200 outline-none ring-1 ring-white/8",
          className
        )}
      >
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
        <option value="__custom">Свой id…</option>
      </select>
      {!models.some((item) => item.id === current) && (
        <input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="id модели"
          className="h-8 w-[140px] rounded-lg bg-white/5 px-2 font-mono text-[11px] text-zinc-200 outline-none ring-1 ring-white/8"
        />
      )}
    </div>
  )
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  running,
  allowSubagents,
  onAllowSubagents,
  agents,
  agentId,
  onAgentId,
  onAgentModel,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  allowSubagents: boolean
  onAllowSubagents: (value: boolean) => void
  agents: Agent[]
  agentId: string
  onAgentId: (id: string) => void
  onAgentModel: (agentId: string, model: string) => void
  placeholder: string
}) {
  const selected = agents.find((agent) => agent.id === agentId)
  const workers = agents.filter((agent) => agent.kind !== "orchestrator" && agent.enabled)

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5">
      <div className="rounded-2xl bg-[#161821] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_18px_50px_rgba(0,0,0,0.35)]">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSend()
            }
          }}
          className="min-h-[72px] w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
          <select
            value={agentId}
            onChange={(e) => onAgentId(e.target.value)}
            className="h-8 max-w-[180px] rounded-lg bg-white/5 px-2 text-[12px] text-zinc-200 outline-none ring-1 ring-white/8"
          >
            {agents
              .filter((a) => a.enabled)
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {executorLabel(agent.executor)}
                </option>
              ))}
          </select>
          {selected && (
            <ModelSelect
              executor={selected.executor}
              value={selected.model}
              onChange={(model) => onAgentModel(selected.id, model)}
            />
          )}
          <label className="flex items-center gap-2 text-[12px] text-zinc-400">
            <Switch
              size="sm"
              checked={allowSubagents}
              onCheckedChange={(checked) => onAllowSubagents(Boolean(checked))}
            />
            Подагенты
          </label>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[11px] text-zinc-600 sm:inline">Ctrl+Enter</span>
            {running ? (
              <Button size="sm" variant="secondary" onClick={onStop} className="gap-1">
                <Square className="size-3 fill-current" />
                Стоп
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onSend}
                disabled={!value.trim()}
                className={cn(
                  "bg-sky-500/90 text-zinc-950 hover:bg-sky-400",
                  !value.trim() && "opacity-40"
                )}
              >
                Отправить
              </Button>
            )}
            {running && <Loader2 className="size-4 animate-spin text-sky-300" />}
          </div>
        </div>
        {allowSubagents && workers.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-white/6 px-3 py-2">
            <span className="w-full text-[11px] text-zinc-500">Модели подагентов</span>
            {workers.map((agent) => (
              <label key={agent.id} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                <span className="max-w-[88px] truncate" style={{ color: agent.color }}>
                  {agent.name}
                </span>
                <ModelSelect
                  executor={agent.executor}
                  value={agent.model}
                  onChange={(model) => onAgentModel(agent.id, model)}
                  className="h-7 max-w-[132px] text-[11px]"
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
