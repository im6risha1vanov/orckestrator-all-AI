import { relativeTo } from "../files"
import type { Adapter, AdapterContext, Emit } from "./types"
import { sleep, streamText } from "./types"

function pickFiles(ctx: AdapterContext, n = 5) {
  return ctx.fileHints.slice(0, n).map((f) => relativeTo(ctx.projectPath, f))
}

function buildAnswer(ctx: AdapterContext) {
  const files = pickFiles(ctx)
  const fileList =
    files.length > 0
      ? files.map((f) => `- \`${f}\``).join("\n")
      : "- каталог пока пустой или недоступен"

  const lines = [
    `**${ctx.agentName}** · ${ctx.agentRole}`,
    "",
    `Задача принята. Рабочий каталог: \`${ctx.worktreePath}\`.`,
    "",
    "Что вижу в проекте:",
    fileList,
    "",
    "План работы:",
    "1. Уточнить границы задачи и не трогать лишнее.",
    "2. Собрать контекст по ключевым файлам.",
    "3. Внести правки узким патчем.",
    "4. Коротко отчитаться оркестратору.",
    "",
    ctx.agentInstructions
      ? `Следую инструкции агента: ${ctx.agentInstructions.slice(0, 280)}`
      : "",
    "",
    `Исполнитель **${ctx.executor}** · модель **${ctx.model}**. В этой среде раннер недоступен или без ключа — работаю в локальном режиме Артели. Подключите CLI или ключ в настройках, и этот же агент пойдёт через настоящий раннер.`,
  ]
  return lines.filter(Boolean).join("\n")
}

function buildDiff(ctx: AdapterContext) {
  const rel = pickFiles(ctx, 1)[0] ?? "README.md"
  return {
    path: rel,
    patch: `--- a/${rel}\n+++ b/${rel}\n@@ -1,3 +1,8 @@\n+# Заметка агента «${ctx.agentName}»\n+\n+Локальный режим: патч не записан на диск.\n+Подключите ${ctx.executor}, чтобы правки применялись в worktree.\n+`,
  }
}

export const localAdapter: Adapter = {
  id: "local",
  async run(ctx: AdapterContext, emit: Emit) {
    emit({ type: "thinking", text: `${ctx.agentName} смотрит проект и раскладывает шаги…` })
    await sleep(420, ctx.signal)
    emit({
      type: "tool",
      tool: "list_dir",
      text: ctx.worktreePath,
    })
    await sleep(280, ctx.signal)
    if (ctx.fileHints[0]) {
      emit({
        type: "tool",
        tool: "read_file",
        path: relativeTo(ctx.projectPath, ctx.fileHints[0]),
      })
      await sleep(240, ctx.signal)
    }
    await streamText(buildAnswer(ctx), emit, ctx.signal, 10)
    const diff = buildDiff(ctx)
    emit({ type: "diff", path: diff.path, patch: diff.patch })
    emit({ type: "usage", inputTokens: 800, outputTokens: 420 })
  },
}
