"use client"

import { Bot, FolderGit2, MessageSquare, Settings } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SidebarView } from "@/lib/types"

const ITEMS: { id: SidebarView; label: string; icon: typeof Bot }[] = [
  { id: "chats", label: "Чаты", icon: MessageSquare },
  { id: "agents", label: "Агенты", icon: Bot },
  { id: "projects", label: "Проекты", icon: FolderGit2 },
  { id: "settings", label: "Настройки", icon: Settings },
]

export function ActivityBar({
  view,
  onView,
}: {
  view: SidebarView
  onView: (view: SidebarView) => void
}) {
  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center border-r border-white/6 bg-[#0b0c10] py-3">
      <div className="mb-4 size-8 overflow-hidden rounded-xl shadow-[0_0_18px_rgba(130,164,255,0.35)]">
        <img src="/artel-icon.png" alt="Артель" className="size-8" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <div key={item.id} className="group relative">
              <button
                type="button"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => onView(item.id)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/6 hover:text-zinc-200",
                  active && "bg-white/8 text-sky-200"
                )}
              >
                <Icon className="size-4" />
              </button>
              <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 rounded-md bg-zinc-100 px-2 py-1 text-[11px] whitespace-nowrap text-zinc-900 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
