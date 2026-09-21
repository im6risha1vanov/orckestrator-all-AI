"use client"

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { EXECUTORS } from "@/lib/executors"
import type { ClaudeSubscription, GithubAccount, ProbeResult, Settings } from "@/lib/types"

export function SettingsPanel({
  settings,
  probe,
  claude,
  github,
  onChange,
  onSave,
  onRefresh,
}: {
  settings: Settings
  probe: ProbeResult[]
  claude?: ClaudeSubscription | null
  github?: GithubAccount | null
  onChange: (patch: Partial<Settings>) => void
  onSave: () => void
  onRefresh: () => void
}) {
  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 px-3 pb-6">
        <SubscriptionCard claude={claude} onRefresh={onRefresh} />
        <CursorCard settings={settings} probe={probe} onChange={onChange} onSave={onSave} />
        <GithubCard github={github} settings={settings} onChange={onChange} onSave={onSave} />

        <p className="px-1 text-[12px] leading-5 text-zinc-500">
          Codex — через ключ ai.starimg или OpenAI. Всё лежит только на этой машине в{" "}
          <span className="font-mono">data/artel.json</span>.
        </p>
        <Field label="URL ai.starimg" hint="шлюз для Codex">
          <Input
            value={settings.starimgBaseUrl}
            onChange={(e) => onChange({ starimgBaseUrl: e.target.value })}
            placeholder="https://ai.starimg.com/v1"
            className="font-mono text-[12px]"
          />
        </Field>
        <Field label="Ключ ai.starimg">
          <Input
            type="password"
            value={settings.starimgApiKey}
            onChange={(e) => onChange({ starimgApiKey: e.target.value })}
          />
        </Field>
        <Field label="Ключ OpenAI" hint="запасной, если шлюз не нужен">
          <Input
            type="password"
            value={settings.openaiApiKey}
            onChange={(e) => onChange({ openaiApiKey: e.target.value })}
          />
        </Field>
        <Field
          label="Ключ Anthropic API"
          hint="не подписка, отдельный счёт"
        >
          <Input
            type="password"
            value={settings.anthropicApiKey}
            onChange={(e) => onChange({ anthropicApiKey: e.target.value })}
            placeholder="необязательно · sk-ant-…"
          />
        </Field>
        <label className="flex items-center justify-between gap-2 rounded-lg bg-white/4 px-2 py-2 text-[12.5px] text-zinc-300">
          Сначала пробовать CLI
          <Switch
            size="sm"
            checked={settings.preferCli}
            onCheckedChange={(checked) => onChange({ preferCli: Boolean(checked) })}
          />
        </label>
        <Button size="sm" onClick={onSave}>
          Сохранить настройки
        </Button>
        <div className="mt-2 space-y-2">
          <div className="text-[12px] font-medium text-zinc-400">Исполнители</div>
          {EXECUTORS.map((executor) => {
            const status = probe.find((p) => p.executor === executor.id)
            return (
              <div key={executor.id} className="rounded-lg bg-white/4 px-2.5 py-2">
                <div className="flex items-center gap-2 text-[12.5px] text-zinc-200">
                  <span
                    className={`size-1.5 rounded-full ${
                      status?.available ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  {executor.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                  {status?.detail ?? "нет данных"}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}

function SubscriptionCard({
  claude,
  onRefresh,
}: {
  claude?: ClaudeSubscription | null
  onRefresh: () => void
}) {
  const ready = Boolean(claude?.ready)
  return (
    <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/8">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-100">
        <span className={`size-2 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`} />
        Подписка Claude
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-zinc-400">
        Pro / Max / claude.ai — это вход <span className="font-mono text-zinc-300">claude login</span>, а не
        ключ API. Ключ списывается с другого счёта и подписку не использует.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-zinc-300">
        {claude?.detail ?? "Проверяю Claude Code…"}
      </p>
      {claude?.hint && (
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">{claude.hint}</p>
      )}
      {!ready && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-sky-100/90">
          {`npm install -g @anthropic-ai/claude-code
claude login`}
        </pre>
      )}
      <Button size="sm" variant="secondary" className="mt-2" onClick={onRefresh}>
        Проверить подписку
      </Button>
    </div>
  )
}

function CursorCard({
  settings,
  probe,
  onChange,
  onSave,
}: {
  settings: Settings
  probe: ProbeResult[]
  onChange: (patch: Partial<Settings>) => void
  onSave: () => void
}) {
  const status = probe.find((p) => p.executor === "cursor")
  const ready = Boolean(status?.available)
  return (
    <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/8">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-100">
        <span className={`size-2 rounded-full ${ready ? "bg-emerald-400" : "bg-amber-400"}`} />
        Cursor AI
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-zinc-400">
        Это тот же аккаунт, что в Cursor IDE. Артель вызывает CLI <span className="font-mono text-zinc-300">agent</span>{" "}
        / <span className="font-mono text-zinc-300">cursor-agent</span> в каталоге проекта. Встроенный чат Cursor сюда не
        встраивается.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-zinc-300">
        {status?.detail ?? "Проверяю Cursor CLI…"}
      </p>
      {!ready && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 px-2.5 py-2 font-mono text-[11px] leading-5 text-sky-100/90">
          {`irm https://cursor.com/install.ps1 | iex
agent login`}
        </pre>
      )}
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">
        В Cursor: Command Palette → «Install cursor command in PATH». Потом в Артели выбери исполнителя Cursor и модель
        (Grok 4.6, Composer 2, Sonnet 4.5…).
      </p>
      <div className="mt-2 grid gap-1.5">
        <Label className="text-[12px] text-zinc-400">Ключ Cursor API (необязательно)</Label>
        <Input
          type="password"
          value={settings.cursorApiKey}
          onChange={(e) => onChange({ cursorApiKey: e.target.value })}
          placeholder="если agent login уже есть — можно пусто"
          className="font-mono text-[12px]"
        />
      </div>
      <Button size="sm" variant="secondary" className="mt-2" onClick={onSave}>
        Сохранить и проверить
      </Button>
    </div>
  )
}

function GithubCard({
  github,
  settings,
  onChange,
  onSave,
}: {
  github?: GithubAccount | null
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onSave: () => void
}) {
  const ready = Boolean(github?.connected)
  return (
    <div className="rounded-xl bg-white/4 p-3 ring-1 ring-white/8">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-100">
        <span className={`size-2 rounded-full ${ready ? "bg-emerald-400" : "bg-zinc-500"}`} />
        GitHub
      </div>
      <p className="mt-1.5 text-[12px] leading-5 text-zinc-400">
        Classic PAT с правом <span className="font-mono text-zinc-300">repo</span> — список твоих репозиториев и клон
        приватных. Токен остаётся на этой машине.
      </p>
      <p className="mt-2 text-[12px] leading-5 text-zinc-300">
        {github?.detail ?? "Токен ещё не проверяли"}
      </p>
      <a
        href="https://github.com/settings/tokens/new?scopes=repo&description=Artel"
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-block text-[11px] text-sky-400 hover:text-sky-300"
      >
        Создать токен на GitHub
      </a>
      <div className="mt-2 grid gap-1.5">
        <Label className="text-[12px] text-zinc-400">Personal Access Token</Label>
        <Input
          type="password"
          value={settings.githubToken ?? ""}
          onChange={(e) => onChange({ githubToken: e.target.value })}
          placeholder="ghp_…"
          className="font-mono text-[12px]"
        />
      </div>
      <Button size="sm" variant="secondary" className="mt-2" onClick={onSave}>
        Сохранить и проверить
      </Button>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[12px] text-zinc-400">
        {label}
        {hint ? <span className="ml-1 font-normal text-zinc-600">· {hint}</span> : null}
      </Label>
      {children}
    </div>
  )
}
