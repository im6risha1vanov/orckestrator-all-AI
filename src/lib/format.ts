export function relativeTime(iso: string) {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "сейчас"
  if (min < 60) return `${min} мин`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.floor(hours / 24)
  if (days === 1) return "вчера"
  if (days < 7) return `${days} дн`
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export function statusLabel(status: string) {
  switch (status) {
    case "queued":
      return "в очереди"
    case "running":
      return "работает"
    case "done":
      return "готово"
    case "error":
      return "ошибка"
    case "cancelled":
      return "остановлен"
    default:
      return status
  }
}
