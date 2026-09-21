"use client"

import { ChevronRight, File, Folder } from "lucide-react"
import { useState } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { statusLabel } from "@/lib/format"
import type { Agent, FileNode, Run } from "@/lib/types"
import { cn } from "@/lib/utils"

export function RightPanel({
  tab,
  onTab,
  tree,
  runs,
  agents,
  projectPath,
}: {
  tab: "files" | "runs"
  onTab: (tab: "files" | "runs") => void
  tree: FileNode[]
  runs: Run[]
  agents: Agent[]
  projectPath?: string
}) {
  return (
    <aside className="hidden h-full w-[280px] shrink-0 flex-col border-l border-white/6 bg-[#101117] lg:flex">
      <div className="flex h-12 items-center gap-1 px-2">
        {(["files", "runs"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] text-zinc-500",
              tab === id && "bg-white/8 text-zinc-200"
            )}
          >
            {id === "files" ? "Файлы" : "Запуски"}
          </button>
        ))}
      </div>
      {tab === "files" ? (
        <ScrollArea className="flex-1">
          <div className="px-2 pb-3">
            {projectPath && (
              <div className="mb-2 truncate px-1 font-mono text-[10px] text-zinc-600">
                {projectPath}
              </div>
            )}
            {tree.length === 0 ? (
              <div className="px-2 py-6 text-[12px] text-zinc-500">Нет файлов или путь недоступен</div>
            ) : (
              tree.map((node) => <TreeNode key={node.path} node={node} depth={0} />)
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 px-2 pb-3">
            {runs.length === 0 && (
              <div className="px-2 py-6 text-[12px] text-zinc-500">Запусков в этом чате ещё нет</div>
            )}
            {runs
              .slice()
              .reverse()
              .map((run) => {
                const agent = agents.find((a) => a.id === run.agentId)
                return (
                  <div key={run.id} className="rounded-lg px-2 py-1.5 ring-1 ring-white/6">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: agent?.color ?? "#82a4ff" }}
                      />
                      <span className="truncate text-[12px] text-zinc-200">
                        {agent?.name ?? "Агент"}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-4 text-[11px] text-zinc-500">
                      {run.parentRunId ? "подагент · " : ""}
                      {statusLabel(run.status)}
                      {run.usedMock ? " · локально" : ""}
                    </div>
                  </div>
                )
              })}
          </div>
        </ScrollArea>
      )}
    </aside>
  )
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1)
  if (node.type === "dir") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-[12px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          style={{ paddingLeft: 6 + depth * 10 }}
        >
          <ChevronRight className={cn("size-3 transition", open && "rotate-90")} />
          <Folder className="size-3.5 text-sky-300/70" />
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children?.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
      </div>
    )
  }
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 text-[12px] text-zinc-500"
      style={{ paddingLeft: 22 + depth * 10 }}
    >
      <File className="size-3.5" />
      <span className="truncate">{node.name}</span>
    </div>
  )
}
