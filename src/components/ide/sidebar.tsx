"use client"

import type { ReactNode } from "react"
import { Bot, FolderGit2, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { executorLabel, modelLabel, modelsFor, resolveModel } from "@/lib/executors"
import { relativeTime } from "@/lib/format"
import type { Agent, Project, Thread } from "@/lib/types"
import { cn } from "@/lib/utils"

export function SidebarHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex h-12 items-center justify-between px-3">
      <div className="text-[13px] font-medium tracking-wide text-zinc-200">{title}</div>
      {onAction && (
        <Button variant="ghost" size="sm" onClick={onAction} className="h-7 gap-1 text-zinc-400">
          <Plus className="size-3.5" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export function ChatList({
  threads,
  activeId,
  onSelect,
  onDelete,
}: {
  threads: Thread[]
  activeId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  if (threads.length === 0) {
    return (
      <Empty
        icon={<Bot className="size-5" />}
        title="Чатов ещё нет"
        text="Опишите задачу внизу — оркестратор откроет новый чат."
      />
    )
  }
  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-0.5 px-2 pb-3">
        {threads.map((thread) => (
          <div
            key={thread.id}
            className={cn(
              "group flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 hover:bg-white/5",
              activeId === thread.id && "bg-white/8"
            )}
            onClick={() => onSelect(thread.id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-zinc-200">{thread.title}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{relativeTime(thread.updatedAt)}</div>
            </div>
            <button
              type="button"
              className="hidden size-6 items-center justify-center rounded-md text-zinc-600 hover:bg-white/8 hover:text-zinc-300 group-hover:flex"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(thread.id)
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

export function AgentList({
  agents,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onCreate,
  onModel,
}: {
  agents: Agent[]
  selectedId?: string
  onSelect: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onModel: (id: string, model: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader title="Агенты" actionLabel="Создать" onAction={onCreate} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 px-2 pb-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className={cn(
                "cursor-pointer rounded-xl px-2.5 py-2 ring-1 ring-transparent hover:bg-white/5",
                selectedId === agent.id && "bg-white/6 ring-white/8"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex size-7 items-center justify-center rounded-lg text-[11px] font-semibold text-[#0b0c10]"
                  style={{ background: agent.color }}
                >
                  {agent.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-zinc-100">{agent.name}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {agent.role} · {executorLabel(agent.executor)} · {modelLabel(agent.executor, agent.model)}
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={agent.enabled}
                  disabled={agent.system}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(checked) => onToggle(agent.id, Boolean(checked))}
                />
              </div>
              <select
                value={resolveModel(agent.executor, agent.model)}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onModel(agent.id, e.target.value)}
                className="mt-1.5 h-7 w-full rounded-md bg-white/5 px-2 text-[11px] text-zinc-300 outline-none ring-1 ring-white/8"
              >
                {modelsFor(agent.executor).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {!agent.system && (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className="text-[11px] text-zinc-600 hover:text-zinc-300"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(agent.id)
                    }}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export function ProjectList({
  projects,
  activeId,
  onSelect,
  onDelete,
  onCreate,
}: {
  projects: Project[]
  activeId?: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SidebarHeader title="Проекты" actionLabel="Добавить" onAction={onCreate} />
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 px-2 pb-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => onSelect(project.id)}
              className={cn(
                "cursor-pointer rounded-xl px-2.5 py-2 hover:bg-white/5",
                activeId === project.id && "bg-white/8"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-white/6 text-zinc-300">
                  <FolderGit2 className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-zinc-100">{project.name}</div>
                  <div className="truncate font-mono text-[10.5px] text-zinc-500">
                    {project.githubUrl
                      ? project.githubUrl.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")
                      : project.path}
                  </div>
                </div>
              </div>
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  className="text-[11px] text-zinc-600 hover:text-zinc-300"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(project.id)
                  }}
                >
                  Убрать
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

export function Empty({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="mb-1 text-zinc-600">{icon}</div>
      <div className="text-[13px] text-zinc-300">{title}</div>
      <div className="text-[12px] leading-5 text-zinc-500">{text}</div>
    </div>
  )
}
