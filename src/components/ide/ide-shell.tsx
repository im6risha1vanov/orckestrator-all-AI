"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Menu, PanelRight } from "lucide-react"

import { ActivityBar } from "@/components/ide/activity-bar"
import { Composer } from "@/components/ide/composer"
import { Conversation, EmptyHero } from "@/components/ide/conversation"
import { AgentDialog, ProjectDialog } from "@/components/ide/dialogs"
import { RightPanel } from "@/components/ide/right-panel"
import { SettingsPanel } from "@/components/ide/settings-panel"
import { AgentList, ChatList, ProjectList, SidebarHeader } from "@/components/ide/sidebar"
import { Button } from "@/components/ui/button"
import { cancelRun, fetchState, mutate, sendChat } from "@/lib/client-api"
import type {
  ArtelState,
  ClaudeSubscription,
  FileNode,
  GithubAccount,
  ProbeResult,
  RunEvent,
  Settings,
  SidebarView,
} from "@/lib/types"
import { cn } from "@/lib/utils"

function pickProjectId(state: ArtelState, current?: string) {
  if (current && state.projects.some((project) => project.id === current)) {
    return current
  }
  return state.projects[0]?.id
}

export function IdeShell() {
  const [state, setState] = useState<ArtelState | null>(null)
  const [probe, setProbe] = useState<ProbeResult[]>([])
  const [claude, setClaude] = useState<ClaudeSubscription | null>(null)
  const [github, setGithub] = useState<GithubAccount | null>(null)
  const [cloneParent, setCloneParent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<SidebarView>("chats")
  const [rightOpen, setRightOpen] = useState(true)
  const [rightTab, setRightTab] = useState<"files" | "runs">("files")
  const [projectId, setProjectId] = useState<string>()
  const [threadId, setThreadId] = useState<string>()
  const [agentId, setAgentId] = useState("agent_orchestrator")
  const [draft, setDraft] = useState("")
  const [allowSubagents, setAllowSubagents] = useState(true)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [tree, setTree] = useState<FileNode[]>([])
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null)
  const [mobileNav, setMobileNav] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const reload = useCallback(async () => {
    const data = await fetchState()
    setState(data.state)
    setProbe(data.probe)
    setClaude(data.claude)
    setGithub(data.github)
    setCloneParent(data.cloneParent)
    setSettingsDraft(data.state.settings)
    setProjectId((current) => pickProjectId(data.state, current))
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchState()
      .then((data) => {
        if (cancelled) return
        setState(data.state)
        setProbe(data.probe)
        setClaude(data.claude)
        setGithub(data.github)
        setCloneParent(data.cloneParent)
        setSettingsDraft(data.state.settings)
        setProjectId((current) => pickProjectId(data.state, current))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    mutate("tree", { projectId })
      .then((res) => {
        if (!cancelled) setTree(res.tree ?? [])
      })
      .catch(() => {
        if (!cancelled) setTree([])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const project = state?.projects.find((p) => p.id === projectId)
  const threads = useMemo(
    () => (state?.threads.filter((t) => t.projectId === projectId) ?? []).sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    ),
    [state, projectId]
  )
  const messages = useMemo(
    () => state?.messages.filter((m) => m.threadId === threadId) ?? [],
    [state, threadId]
  )
  const runs = useMemo(
    () => state?.runs.filter((r) => r.threadId === threadId) ?? [],
    [state, threadId]
  )

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [messages, runs])

  function applyEvent(event: RunEvent) {
    setState((prev) => {
      if (!prev) return prev
      const next: ArtelState = {
        ...prev,
        runs: prev.runs.map((run) => ({ ...run, events: [...run.events] })),
        messages: prev.messages.map((m) => ({ ...m })),
      }
      if (next.runs.some((r) => r.events.some((e) => e.id === event.id))) return prev
      let run = next.runs.find((r) => r.id === event.runId)
      if (!run) {
        run = {
          id: event.runId,
          threadId: threadId ?? "",
          projectId: projectId ?? "",
          agentId: event.agentId ?? "",
          parentRunId: event.type === "spawn" ? event.runId : undefined,
          rootRunId: event.rootRunId,
          prompt: "",
          content: "",
          thinking: "",
          status: "running",
          executor: "local",
          model: "artel-local",
          usedMock: false,
          events: [],
          createdAt: event.ts,
        }
        next.runs = [...next.runs, run]
      }
      run.events.push(event)
      if (event.type === "token" && event.text) run.content += event.text
      if (event.type === "thinking" && event.text) run.thinking = event.text
      if (event.type === "error") {
        run.status = "error"
        run.error = event.text
      }
      if (event.type === "done") run.status = run.status === "error" ? "error" : "done"
      if (event.type === "spawn" && event.childRunId) {
        if (!next.runs.some((r) => r.id === event.childRunId)) {
          next.runs.push({
            id: event.childRunId,
            threadId: threadId ?? "",
            projectId: projectId ?? "",
            agentId: event.agentId ?? "",
            parentRunId: event.runId,
            rootRunId: event.rootRunId,
            prompt: "",
            content: "",
            thinking: "",
            status: "running",
            executor: "local",
            model: "artel-local",
            usedMock: false,
            events: [],
            createdAt: event.ts,
          })
        }
      }
      const msg = next.messages.find((m) => m.runId === event.rootRunId)
      const root = next.runs.find((r) => r.id === event.rootRunId)
      if (msg && root) msg.content = root.content
      return next
    })
  }

  async function send() {
    if (!state || !projectId || !draft.trim() || runningId) return
    setError(null)
    try {
      const result = await sendChat({
        threadId,
        projectId,
        content: draft.trim(),
        agentId,
        allowSubagents,
        model: state.agents.find((a) => a.id === agentId)?.model,
        subagentModels: Object.fromEntries(
          state.agents
            .filter((a) => a.kind !== "orchestrator")
            .map((a) => [a.id, a.model])
        ),
      })
      setDraft("")
      setThreadId(result.threadId)
      setState(result.state)
      setRunningId(result.runId)
      const source = new EventSource(`/api/runs/${result.runId}/events`)
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as RunEvent
        applyEvent(event)
        if (event.type === "done" && event.runId === result.runId) {
          source.close()
          setRunningId(null)
          reload().catch(() => undefined)
        }
      }
      source.onerror = () => {
        source.close()
        setRunningId(null)
        reload().catch(() => undefined)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function stop() {
    if (!runningId) return
    await cancelRun(runningId)
    setRunningId(null)
    await reload()
  }

  async function setAgentModel(id: string, model: string) {
    setState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        agents: prev.agents.map((agent) => (agent.id === id ? { ...agent, model } : agent)),
      }
    })
    await mutate("updateAgent", { id, model })
  }

  if (!state || !settingsDraft) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[#0d0e12] text-zinc-400">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-violet-500 text-lg font-semibold text-white">
          А
        </div>
        <div className="text-[13px]">{error ?? "Загружаю Артель…"}</div>
        {error && (
          <Button size="sm" variant="secondary" onClick={() => reload().catch(() => undefined)}>
            Повторить
          </Button>
        )}
      </div>
    )
  }

  const settings = settingsDraft

  return (
    <div className="flex h-dvh overflow-hidden bg-[#0d0e12] text-zinc-100">
      <ActivityBar
        view={view}
        onView={(next) => {
          setView(next)
          setMobileNav(true)
        }}
      />

      <div
        className={cn(
          "flex w-[272px] shrink-0 flex-col border-r border-white/6 bg-[#111218]",
          "max-md:absolute max-md:inset-y-0 max-md:left-12 max-md:z-30 max-md:shadow-2xl",
          !mobileNav && "max-md:hidden"
        )}
      >
        {view === "chats" && (
          <>
            <SidebarHeader
              title={project?.name ?? "Чаты"}
              actionLabel="Новый"
              onAction={async () => {
                if (!projectId) return
                const res = await mutate("createThread", { projectId })
                setThreadId(res.thread.id)
                setView("chats")
                await reload()
              }}
            />
            <ChatList
              threads={threads}
              activeId={threadId}
              onSelect={(id) => {
                setThreadId(id)
                setMobileNav(false)
              }}
              onDelete={async (id) => {
                await mutate("deleteThread", { id })
                if (threadId === id) setThreadId(undefined)
                await reload()
              }}
            />
          </>
        )}
        {view === "agents" && (
          <AgentList
            agents={state.agents}
            selectedId={agentId}
            onSelect={setAgentId}
            onCreate={() => setAgentOpen(true)}
            onToggle={async (id, enabled) => {
              await mutate("updateAgent", { id, enabled })
              await reload()
            }}
            onDelete={async (id) => {
              await mutate("deleteAgent", { id })
              await reload()
            }}
            onModel={setAgentModel}
          />
        )}
        {view === "projects" && (
          <ProjectList
            projects={state.projects}
            activeId={projectId}
            onSelect={(id) => {
              setProjectId(id)
              setThreadId(undefined)
            }}
            onCreate={() => setProjectOpen(true)}
            onDelete={async (id) => {
              await mutate("deleteProject", { id })
              await reload()
            }}
          />
        )}
        {view === "settings" && (
          <>
            <SidebarHeader title="Настройки" />
            <SettingsPanel
              settings={settings}
              probe={probe}
              claude={claude}
              github={github}
              onChange={(patch) => setSettingsDraft({ ...settings, ...patch })}
              onSave={async () => {
                await mutate("updateSettings", settings)
                await reload()
              }}
              onRefresh={() => {
                reload().catch(() => undefined)
              }}
            />
          </>
        )}
      </div>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/6 px-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            onClick={() => setMobileNav((v) => !v)}
          >
            <Menu className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-zinc-200">
              {threads.find((t) => t.id === threadId)?.title ?? "Новый чат"}
            </div>
            <div className="truncate text-[11px] text-zinc-500">
              {project
                ? `${project.name} · ${project.githubUrl ? project.githubUrl.replace(/\.git$/, "") : project.path}`
                : "Проект не выбран"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:flex"
              onClick={() => setRightOpen((v) => !v)}
            >
              <PanelRight className="size-4" />
            </Button>
          </div>
        </header>

        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-200">
            {error}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto">
                <EmptyHero onPrompt={setDraft} />
                <div className="w-full">
                  <Composer
                    value={draft}
                    onChange={setDraft}
                    onSend={send}
                    onStop={stop}
                    running={Boolean(runningId)}
                    allowSubagents={allowSubagents}
                    onAllowSubagents={setAllowSubagents}
                    agents={state.agents}
                    agentId={agentId}
                    onAgentId={setAgentId}
                    onAgentModel={setAgentModel}
                    placeholder="Опишите задачу. Оркестратор разложит её на подагентов…"
                  />
                </div>
              </div>
            ) : (
              <>
                <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                  <Conversation messages={messages} runs={runs} agents={state.agents} />
                </div>
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSend={send}
                  onStop={stop}
                  running={Boolean(runningId)}
                  allowSubagents={allowSubagents}
                  onAllowSubagents={setAllowSubagents}
                  agents={state.agents}
                  agentId={agentId}
                  onAgentId={setAgentId}
                  onAgentModel={setAgentModel}
                  placeholder="Продолжить задачу или поставить новую…"
                />
              </>
            )}
          </div>
          {rightOpen && (
            <RightPanel
              tab={rightTab}
              onTab={setRightTab}
              tree={tree}
              runs={runs}
              agents={state.agents}
              projectPath={project?.path}
            />
          )}
        </div>
      </section>

      <AgentDialog
        open={agentOpen}
        onOpenChange={setAgentOpen}
        onCreate={async (agent) => {
          await mutate("createAgent", agent)
          await reload()
          setView("agents")
        }}
      />
      <ProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        github={github}
        cloneParent={cloneParent}
        onCreate={async (projectValue) => {
          const res = await mutate("createProject", projectValue)
          setProjectId(res.project.id)
          await reload()
          setView("projects")
        }}
        onClone={async (input) => {
          const res = await mutate("cloneGithub", input)
          setProjectId(res.project.id)
          await reload()
          setView("projects")
        }}
        onLoadRepos={async () => {
          const res = await mutate("githubRepos")
          return res.repos ?? []
        }}
        onConnectGithub={async (token) => {
          await mutate("updateSettings", { githubToken: token })
          const data = await reload()
          if (!data.github.connected) {
            throw new Error(data.github.detail || "GitHub не подключился")
          }
        }}
      />
    </div>
  )
}
