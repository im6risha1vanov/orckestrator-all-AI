"use client"

import { useState } from "react"
import { FolderGit2, Loader2, Lock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AGENT_COLORS, defaultModel, EXECUTORS, modelsFor, resolveModel } from "@/lib/executors"
import type { ExecutorId, GithubAccount, GithubRepo } from "@/lib/types"
import { cn } from "@/lib/utils"

export function AgentDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (agent: {
    name: string
    role: string
    instructions: string
    executor: ExecutorId
    model: string
    color: string
    canSpawn: boolean
  }) => void
}) {
  const [name, setName] = useState("")
  const [role, setRole] = useState("")
  const [instructions, setInstructions] = useState("")
  const [executor, setExecutor] = useState<ExecutorId>("claude")
  const [model, setModel] = useState(defaultModel("claude"))
  const [color, setColor] = useState(AGENT_COLORS[4])
  const [canSpawn, setCanSpawn] = useState(false)

  function reset() {
    setName("")
    setRole("")
    setInstructions("")
    setExecutor("claude")
    setModel(defaultModel("claude"))
    setColor(AGENT_COLORS[4])
    setCanSpawn(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новый подагент</DialogTitle>
          <DialogDescription>
            Агент появится в списке и сможет получать задачи от оркестратора. Проект любой — агент не привязан к репозиторию.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="agent-name">Имя</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Тестировщик"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agent-role">Роль</Label>
            <Input
              id="agent-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Пишет и гоняет тесты"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agent-ins">Инструкция</Label>
            <Textarea
              id="agent-ins"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Что делать, чего не делать, в каком формате отвечать"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agent-exec">Исполнитель</Label>
            <select
              id="agent-exec"
              value={executor}
              onChange={(e) => {
                const next = e.target.value as ExecutorId
                setExecutor(next)
                setModel(defaultModel(next))
              }}
              className="h-8 rounded-lg bg-input/30 px-2 text-sm ring-1 ring-input"
            >
              {EXECUTORS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {EXECUTORS.find((e) => e.id === executor)?.hint}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agent-model">Модель</Label>
            <select
              id="agent-model"
              value={resolveModel(executor, model)}
              onChange={(e) => setModel(e.target.value)}
              className="h-8 rounded-lg bg-input/30 px-2 text-sm ring-1 ring-input"
            >
              {modelsFor(executor).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Цвет</Label>
            <div className="flex flex-wrap gap-2">
              {AGENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="size-6 rounded-full ring-2 ring-offset-2 ring-offset-[#1c1c1c]"
                  style={{
                    background: c,
                    boxShadow: color === c ? `0 0 0 2px ${c}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={canSpawn}
              onChange={(e) => setCanSpawn(e.target.checked)}
            />
            Может сам запускать подагентов
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              onCreate({ name, role, instructions, executor, model, color, canSpawn })
              reset()
              onOpenChange(false)
            }}
            disabled={!name.trim()}
          >
            Создать агента
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectDialog({
  open,
  onOpenChange,
  onCreate,
  onClone,
  onLoadRepos,
  onConnectGithub,
  github,
  cloneParent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (project: { name: string; path: string }) => Promise<void>
  onClone: (input: { cloneUrl: string; destParent: string }) => Promise<void>
  onLoadRepos: () => Promise<GithubRepo[]>
  onConnectGithub: (token: string) => Promise<void>
  github?: GithubAccount | null
  cloneParent: string
}) {
  const [mode, setMode] = useState<"github" | "local">("github")
  const [name, setName] = useState("")
  const [path, setPath] = useState("")
  const [cloneUrl, setCloneUrl] = useState("")
  const [destParent, setDestParent] = useState("")
  const [token, setToken] = useState("")
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const destValue = destParent || cloneParent

  function reset() {
    setName("")
    setPath("")
    setCloneUrl("")
    setToken("")
    setRepos([])
    setBusy(false)
    setError(null)
    setMode("github")
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Открыть проект</DialogTitle>
          <DialogDescription>
            Клонируй репозиторий с GitHub или укажи уже скачанную папку на этом компьютере.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1">
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1.5 text-[12.5px]",
              mode === "github" ? "bg-white/10 text-zinc-100" : "text-zinc-500"
            )}
            onClick={() => setMode("github")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-1.5 text-[12.5px]",
              mode === "local" ? "bg-white/10 text-zinc-100" : "text-zinc-500"
            )}
            onClick={() => setMode("local")}
          >
            Папка на диске
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>
        )}

        {mode === "github" ? (
          <div className="grid gap-3">
            <div className="flex items-start gap-2 rounded-lg bg-white/4 px-2.5 py-2 text-[12px] leading-5 text-zinc-400">
              <FolderGit2 className="mt-0.5 size-3.5 shrink-0 text-zinc-300" />
              <span>
                {github?.connected
                  ? github.detail
                  : "Без токена клонируются только публичные репозитории. Для своих и приватных — PAT в поле ниже или в Настройках."}
              </span>
            </div>
            {!github?.connected && (
              <div className="grid gap-1.5">
                <Label htmlFor="gh-token">Токен GitHub</Label>
                <div className="flex gap-2">
                  <Input
                    id="gh-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_…"
                    className="font-mono text-[12px]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !token.trim()}
                    onClick={async () => {
                      setBusy(true)
                      setError(null)
                      try {
                        await onConnectGithub(token.trim())
                        setToken("")
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err))
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    Войти
                  </Button>
                </div>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Artel"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  Создать classic PAT с правом repo
                </a>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="gh-url">URL или owner/repo</Label>
              <Input
                id="gh-url"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/you/repo.git"
                className="font-mono text-[12px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="gh-dest">Куда клонировать</Label>
              <Input
                id="gh-dest"
                value={destValue}
                onChange={(e) => setDestParent(e.target.value)}
                placeholder={cloneParent || "C:\\Users\\you\\Documents"}
                className="font-mono text-[12px]"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {github?.connected ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError(null)
                    try {
                      const list = await onLoadRepos()
                      setRepos(list)
                      if (list.length === 0) {
                        setError("Репозиториев не видно. Проверь право repo у токена.")
                      }
                    } catch (err) {
                      setError(err instanceof Error ? err.message : String(err))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Загрузить мои репозитории
                </Button>
              ) : (
                <p className="text-[11px] leading-4 text-zinc-500">
                  Список своих репозиториев — после входа по токену. Публичный URL можно клонировать сразу.
                </p>
              )}
              <span className="text-[11px] text-zinc-500">{repos.length ? `${repos.length} шт.` : ""}</span>
            </div>
            {repos.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg ring-1 ring-white/8">
                {repos.map((repo) => (
                  <button
                    key={repo.fullName}
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-white/5",
                      cloneUrl === repo.cloneUrl && "bg-white/8"
                    )}
                    onClick={() => setCloneUrl(repo.cloneUrl)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-zinc-100">{repo.fullName}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {repo.description || repo.defaultBranch}
                      </div>
                    </div>
                    {repo.private && <Lock className="mt-0.5 size-3 shrink-0 text-zinc-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="proj-name">Название</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="call-bot-analysis"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="proj-path">Путь на диске</Label>
              <Input
                id="proj-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\\Users\\you\\Documents\\repo"
                className="font-mono text-[12px]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          {mode === "github" ? (
            <Button
              disabled={busy || !cloneUrl.trim()}
              onClick={() =>
                run(async () => {
                  await onClone({ cloneUrl: cloneUrl.trim(), destParent: destValue.trim() })
                })
              }
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Клонировать
            </Button>
          ) : (
            <Button
              disabled={busy || !name.trim() || !path.trim()}
              onClick={() =>
                run(async () => {
                  await onCreate({ name, path })
                })
              }
            >
              Добавить
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
