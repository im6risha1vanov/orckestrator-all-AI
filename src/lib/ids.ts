import { nanoid } from "nanoid"

export function id(prefix: string) {
  return `${prefix}_${nanoid(10)}`
}

export function nowIso() {
  return new Date().toISOString()
}
